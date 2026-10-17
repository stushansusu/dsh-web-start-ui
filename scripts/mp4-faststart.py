#!/usr/bin/env python3
"""Move an mp4's moov box in front of mdat - losslessly, without re-encoding.

    python scripts/mp4-faststart.py <file.mp4> [more.mp4 ...] [--check]

Why: a launch skin is fetched cold on the first boot, and the browser cannot
decode a frame before it has read moov (the sample tables). With moov at the END
of the file - the default for most encoders - the browser has to fetch the tail
first, abort its first request and ask again; measured on this package, that put
the first painted frame ~0.6 s later than necessary on a cold cache, and the
curtain sat on its poster for that whole time.

The media payload is not touched: moov is copied, its stco/co64 chunk offsets are
bumped by the size of the box that moved, and the top-level boxes are rewritten in
the new order. Output is byte-for-byte the same mdat and the same decoded frames.

Exit: 0 when nothing needed moving (or everything moved), 1 with --check when a
file still has moov last, 2 on a file this tool cannot rewrite.
"""

import os
import struct
import sys
import tempfile

MAXOFF = 0xFFFFFFFF


def read_boxes(path, start, end):
    boxes = []
    with open(path, "rb") as f:
        pos = start
        while pos + 8 <= end:
            f.seek(pos)
            head = f.read(8)
            if len(head) < 8:
                break
            size = struct.unpack(">I", head[:4])[0]
            typ = head[4:8].decode("latin1", "replace")
            header = 8
            if size == 1:
                size = struct.unpack(">Q", f.read(8))[0]
                header = 16
            elif size == 0:
                size = end - pos
            if size < header or pos + size > end:
                raise ValueError("truncated box at " + str(pos))
            boxes.append({"type": typ, "offset": pos, "size": size, "header": header})
            pos += size
    return boxes


def find_box(data, start, end, name):
    found = []
    pos = start
    while pos + 8 <= end:
        size = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8].decode("latin1", "replace")
        header = 8
        if size == 1:
            size = struct.unpack(">Q", data[pos + 8:pos + 16])[0]
            header = 16
        elif size == 0:
            size = end - pos
        if size < header:
            break
        if typ == name:
            found.append((pos, header, size))
        pos += size
    return found


def locate(data, start, end, path):
    spans = [(start, end)]
    for name in path:
        nxt = []
        for span in spans:
            for off, header, size in find_box(data, span[0], span[1], name):
                nxt.append((off + header, off + size))
        spans = nxt
    return spans


def shift_chunk_offsets(blob, delta):
    counts = {"stco": 0, "co64": 0}
    table = ["moov", "trak", "mdia", "minf", "stbl", "stco"]
    for content, _end in locate(blob, 0, len(blob), table):
        count = struct.unpack(">I", blob[content + 4:content + 8])[0]
        for i in range(count):
            at = content + 8 + i * 4
            value = struct.unpack(">I", blob[at:at + 4])[0]
            if value + delta > MAXOFF:
                raise ValueError("chunk offset leaves 32 bits; this file needs co64 rewriting")
            blob[at:at + 4] = struct.pack(">I", value + delta)
        counts["stco"] += count
    table = ["moov", "trak", "mdia", "minf", "stbl", "co64"]
    for content, _end in locate(blob, 0, len(blob), table):
        count = struct.unpack(">I", blob[content + 4:content + 8])[0]
        for i in range(count):
            at = content + 8 + i * 8
            value = struct.unpack(">Q", blob[at:at + 8])[0]
            blob[at:at + 8] = struct.pack(">Q", value + delta)
        counts["co64"] += count
    if counts["stco"] + counts["co64"] == 0:
        raise ValueError("moov carries no chunk offset table")
    return counts


def rewrite(path):
    size = os.path.getsize(path)
    top = read_boxes(path, 0, size)
    types = [box["type"] for box in top]
    if types.count("moov") != 1:
        raise ValueError("expected exactly one moov, found " + str(types))
    if types.count("mdat") != 1:
        raise ValueError("expected exactly one mdat, found " + str(types))
    moov = next(box for box in top if box["type"] == "moov")
    mdat = next(box for box in top if box["type"] == "mdat")
    if moov["offset"] < mdat["offset"]:
        return None
    with open(path, "rb") as f:
        f.seek(moov["offset"])
        moov_bytes = bytearray(f.read(moov["size"]))
    counts = shift_chunk_offsets(moov_bytes, moov["size"])
    order = [box for box in top if box["offset"] < mdat["offset"] and box["type"] != "moov"]
    order.append(moov)
    order.append(mdat)
    order += [box for box in top if box["offset"] > mdat["offset"] and box["type"] != "moov"]
    handle, temp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), suffix=".faststart")
    os.close(handle)
    try:
        with open(path, "rb") as src, open(temp, "wb") as out:
            for box in order:
                if box["offset"] == moov["offset"]:
                    out.write(moov_bytes)
                    continue
                src.seek(box["offset"])
                remaining = box["size"]
                while remaining > 0:
                    chunk = src.read(min(1 << 22, remaining))
                    if not chunk:
                        raise IOError("short read while copying " + box["type"])
                    out.write(chunk)
                    remaining -= len(chunk)
        os.replace(temp, path)
    except BaseException:
        if os.path.exists(temp):
            os.remove(temp)
        raise
    return {"delta": moov["size"], "counts": counts}


def main(argv):
    check_only = "--check" in argv
    targets = [a for a in argv[1:] if not a.startswith("--")]
    if not targets:
        print(__doc__.strip().splitlines()[2].strip())
        return 2
    failed = False
    for path in targets:
        if not os.path.isfile(path):
            print("mp4-faststart: no such file: " + path)
            failed = True
            continue
        try:
            result = rewrite(path) if not check_only else None
        except (ValueError, IOError) as error:
            print("mp4-faststart: cannot rewrite " + path + ": " + str(error))
            failed = True
            continue
        if check_only:
            top = read_boxes(path, 0, os.path.getsize(path))
            moov = next((b for b in top if b["type"] == "moov"), None)
            mdat = next((b for b in top if b["type"] == "mdat"), None)
            fast = moov is not None and mdat is not None and moov["offset"] < mdat["offset"]
            print(("ok   " if fast else "moov-last ") + path)
            if not fast:
                failed = True
        elif result is None:
            print("already-faststart " + path)
        else:
            print("rewrote " + path + " (moov moved by " + str(result["delta"]) + " bytes, stco "
                  + str(result["counts"]["stco"]) + ", co64 " + str(result["counts"]["co64"]) + ")")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
