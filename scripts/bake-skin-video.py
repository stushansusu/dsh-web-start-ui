#!/usr/bin/env python3
"""Re-encode one launch-skin video into the shipped spec, and pull a poster frame.

  python scripts/bake-skin-video.py <source.mp4> <out-dir> [--width 1920] [--crf 23] [--poster-at 0]

Why this exists: a launch skin is downloaded on install, fetched on first boot and
played before the GUI appears. A 2K master (tens of MB) buys nothing on screen -
the curtain covers the viewport and crops anyway - but it costs every user the
bytes and the buffering. This scales to 1920 wide, keeps the aspect, drops audio
and rewrites with faststart so playback can begin on the first fragments.

Needs a python with av (this machine: the ComfyUI venv).
"""
import argparse
import os
import sys

import av


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('out_dir')
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--crf', type=int, default=23)
    parser.add_argument('--preset', default='medium')
    parser.add_argument('--tune', default='')
    parser.add_argument('--poster-at', type=int, default=0)
    parser.add_argument('--out-name', default='intro.mp4')
    parser.add_argument('--poster-name', default='poster.jpg')
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(args.out_dir, args.out_name)
    poster_path = os.path.join(args.out_dir, args.poster_name)

    with av.open(args.source) as source:
        video_in = source.streams.video[0]
        fps = video_in.average_rate
        width = args.width
        height = round(video_in.height * args.width / video_in.width / 2) * 2
        print('source %dx%d %s -> %dx%d' % (video_in.width, video_in.height, fps, width, height))
        with av.open(out_path, mode='w') as out:
            stream = out.add_stream('libx264', rate=fps)
            stream.width, stream.height = width, height
            stream.pix_fmt = 'yuv420p'
            options = {'crf': str(args.crf), 'preset': args.preset, 'movflags': '+faststart'}
            if args.tune != '':
                options['tune'] = args.tune
            stream.options = options
            index = 0
            for frame in source.decode(video_in):
                scaled = frame.reformat(width, height, 'yuv420p')
                if index == args.poster_at:
                    try:
                        scaled.to_image().save(poster_path, quality=82)
                    except Exception as error:  # noqa: BLE001 - poster is best-effort
                        print('poster skipped: %s' % error)
                for packet in stream.encode(scaled):
                    out.mux(packet)
                index += 1
            for packet in stream.encode():
                out.mux(packet)
    print('wrote %s (%.2f MB, %d frames)' % (out_path, os.path.getsize(out_path) / 1024 / 1024, index))
    if os.path.exists(poster_path):
        print('wrote %s (%.0f KB)' % (poster_path, os.path.getsize(poster_path) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
