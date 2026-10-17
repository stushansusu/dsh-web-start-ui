#!/usr/bin/env node
/**
 * Launch-asset guard - the two ways a shipped skin can go wrong silently.
 *
 * A launch skin is the one asset that can make the GUI appear *slower*: it is
 * fetched cold on the first boot of a browser session, and the curtain stays up
 * until it has played. Two defects cost nothing locally and everything on a cold
 * cache (both shipped in 0.4.6 and were measured on a real first open):
 *
 *  1. moov AFTER mdat. The browser cannot decode a single frame before it has read
 *     moov (the sample tables). With moov last it fetches the head, aborts, fetches
 *     the tail, then fetches the rest: on this package that was +0.6 s before the
 *     first painted frame, and the curtain sat on its poster for the whole time.
 *     No browser setting fixes it - fix the file:
 *     python scripts/mp4-faststart.py <file.mp4>
 *     (lossless: moov is copied with its chunk offsets bumped, mdat untouched).
 *  2. a poster frame that is not the video's FIRST frame. The poster is what the
 *     curtain shows until the first decoded frame, so a poster taken from the end of
 *     the video makes the boot open on the *last* image and then snap back to the
 *     start. This one cannot be checked here - it needs a video decoder. Take the
 *     poster from frame 0:
 *     scripts/bake-skin-video.py <source> <out-dir> --poster-at 0
 *     (that script re-encodes and writes the poster from the same first frame).
 *
 * Also checks the manifest is self-consistent, and that a declared durationMs - the
 * curtain's stall backstop when the element's own metadata never arrives - matches
 * the real mvhd duration.
 *
 * Usage:
 *   node scripts/check-launch-assets.mjs [--root <assets dir>]   # CI gate
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const rootFlag = args.indexOf('--root')
const ASSETS = rootFlag === -1 ? join(ROOT, 'assets', 'launch') : args[rootFlag + 1]
const DURATION_TOLERANCE_MS = 150
const failures = []

/** Read a byte range without pulling a 40 MB video into memory. */
function readAt(fd, offset, length) {
  const buffer = Buffer.alloc(length)
  const read = readSync(fd, buffer, 0, length, offset)
  return buffer.subarray(0, read)
}

/**
 * Walk top-level boxes. Only box headers are read, so a moov at the end of a
 * 44 MB file costs a handful of 8-byte reads, not a download.
 * @param fd - open file descriptor.
 * @param size - file size in bytes.
 * @returns box records with type, offset, size and header length.
 */
function topLevelBoxes(fd, size) {
  const boxes = []
  let pos = 0
  while (pos + 8 <= size && boxes.length < 64) {
    const head = readAt(fd, pos, 8)
    if (head.length < 8) break
    let boxSize = head.readUInt32BE(0)
    const type = head.toString('latin1', 4, 8)
    let header = 8
    if (boxSize === 1) {
      const wide = readAt(fd, pos + 8, 8)
      if (wide.length < 8) break
      boxSize = Number(wide.readBigUInt64BE(0))
      header = 16
    } else if (boxSize === 0) {
      boxSize = size - pos
    }
    if (boxSize < header || pos + boxSize > size) break
    boxes.push({ type, offset: pos, size: boxSize, header })
    pos += boxSize
  }
  return boxes
}

/** Direct child boxes named 'name' inside one box payload. */
function childBoxes(data, name) {
  const found = []
  let pos = 0
  while (pos + 8 <= data.length) {
    let size = data.readUInt32BE(pos)
    const type = data.toString('latin1', pos + 4, pos + 8)
    let header = 8
    if (size === 1) {
      if (pos + 16 > data.length) break
      size = Number(data.readBigUInt64BE(pos + 8))
      header = 16
    } else if (size === 0) {
      size = data.length - pos
    }
    if (size < header) break
    if (type === name) found.push({ offset: pos, header, size })
    pos += size
  }
  return found
}

/** Resolve a dotted box path to the payload spans of the last segment. */
function locate(data, path) {
  let spans = [{ start: 0, end: data.length }]
  for (const name of path) {
    const next = []
    for (const span of spans) {
      const slice = data.subarray(span.start, span.end)
      for (const box of childBoxes(slice, name)) {
        next.push({ start: span.start + box.offset + box.header, end: span.start + box.offset + box.size })
      }
    }
    spans = next
  }
  return spans
}

/** The mvhd duration in milliseconds, or null when it cannot be read. */
function movieDurationMs(moov) {
  const spans = locate(moov, ['moov', 'mvhd'])
  if (spans.length === 0) return null
  const at = spans[0].start
  const version = moov.readUInt8(at)
  const timescale = moov.readUInt32BE(at + 4 + (version === 1 ? 16 : 8))
  const duration = version === 1 ? Number(moov.readBigUInt64BE(at + 20)) : moov.readUInt32BE(at + 16)
  if (!timescale) return null
  return Math.round((duration / timescale) * 1000)
}

/** The sample entry fourcc (avc1, hvc1, ...) of the first video track. */
function videoCodec(moov) {
  const spans = locate(moov, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'])
  if (spans.length === 0) return null
  const at = spans[0].start + 8
  if (at + 8 > moov.length) return null
  return moov.toString('latin1', at + 4, at + 8)
}

/** Check one skin directory; returns a summary row, or null when it is unusable. */
function checkSkin(id, dir) {
  const manifestPath = join(dir, 'skin.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    failures.push(id + ': skin.json is unreadable (' + error.message + ')')
    return null
  }
  if (manifest.id !== id) failures.push(id + ': skin.json declares id "' + manifest.id + '"')
  if (manifest.kind !== 'video') failures.push(id + ': kind must be "video"')
  const videoPath = join(dir, String(manifest.file ?? ''))
  if (typeof manifest.file !== 'string' || !existsSync(videoPath)) {
    failures.push(id + ': video file "' + manifest.file + '" is missing')
    return null
  }
  if (manifest.poster !== undefined) {
    if (typeof manifest.poster !== 'string' || !existsSync(join(dir, manifest.poster))) {
      failures.push(id + ': poster "' + manifest.poster + '" is missing')
    }
  }
  const size = statSync(videoPath).size
  const fd = openSync(videoPath, 'r')
  let boxes
  try {
    boxes = topLevelBoxes(fd, size)
  } finally {
    closeSync(fd)
  }
  const moov = boxes.find((box) => box.type === 'moov')
  const mdat = boxes.find((box) => box.type === 'mdat')
  if (boxes[0] === undefined || boxes[0].type !== 'ftyp') failures.push(id + ': not an mp4 (no leading ftyp)')
  if (moov === undefined) failures.push(id + ': no moov box')
  if (mdat === undefined) failures.push(id + ': no mdat box')
  if (moov === undefined || mdat === undefined) return null
  if (moov.offset > mdat.offset) {
    failures.push(id + ': moov is AFTER mdat, so a cold boot must fetch the tail before it can decode'
      + ' - run: python scripts/mp4-faststart.py ' + videoPath)
  }
  const fd2 = openSync(videoPath, 'r')
  let moovBytes
  try {
    moovBytes = readAt(fd2, moov.offset, moov.size)
  } finally {
    closeSync(fd2)
  }
  const duration = movieDurationMs(moovBytes)
  if (typeof manifest.durationMs === 'number' && duration !== null) {
    const drift = Math.abs(manifest.durationMs - duration)
    if (drift > DURATION_TOLERANCE_MS) {
      failures.push(id + ': durationMs ' + manifest.durationMs + ' does not match the movie (' + duration
        + ' ms); it is the curtain backstop when metadata never arrives')
    }
  }
  return {
    faststart: moov.offset < mdat.offset,
    codec: videoCodec(moovBytes) ?? '?',
    duration,
    poster: manifest.poster === undefined ? 'none' : String(manifest.poster),
    size,
  }
}

if (!existsSync(ASSETS)) {
  console.error('check-launch-assets: no launch assets at ' + ASSETS)
  process.exit(1)
}
const ids = readdirSync(ASSETS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(ASSETS, entry.name, 'skin.json')))
  .map((entry) => entry.name)
  .sort()
if (ids.length === 0) {
  console.error('check-launch-assets: no skins found under ' + ASSETS)
  process.exit(1)
}
const rows = []
for (const id of ids) {
  const result = checkSkin(id, join(ASSETS, id))
  if (result !== null) rows.push({ id, ...result })
}
if (failures.length > 0) {
  console.error('check-launch-assets: a shipped skin would stall or mislead the curtain:')
  for (const line of failures) console.error('  - ' + line)
  process.exit(1)
}
for (const row of rows) {
  console.log('  ' + row.id.padEnd(14) + (row.faststart ? 'faststart' : 'MOOV-LAST')
    + '  ' + String(row.codec).padEnd(5)
    + '  ' + String(Math.round(row.size / 1024 / 1024)) + ' MB'
    + '  ' + (row.duration === null ? '?' : row.duration + ' ms')
    + '  poster ' + row.poster)
}
console.log('check-launch-assets: OK (' + rows.length + ' skins: moov first, manifest paths exist, durations match)')
