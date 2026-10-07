#!/usr/bin/env node
/**
 * Add (or replace) a built-in launch skin.
 *
 *   node scripts/add-launch-skin.mjs <video> --name "极光" [options]
 *
 * Options:
 *   --name <text>      display name (also used for the Chinese side)
 *   --name-en <text>   English display name (defaults to --name)
 *   --id <slug>        directory id (default: slug of --name, prefixed 'skin-')
 *   --poster <image>   poster frame (jpg/png/webp)
 *   --duration <sec>   declared length, for the picker label
 *   --note-zh / --note-en <text>
 *   --force            overwrite an existing skin id
 *
 * A skin is a directory under assets/launch/<id>/ holding the video plus a
 * skin.json manifest; the host reads it at runtime, so no build step follows.
 * Keep skins small (the package README suggests <= 8 MB): a launch skin is
 * downloaded on first use and played on every boot, and a heavy file makes the
 * animation the slowest part of starting the GUI.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov']
const POSTER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SKINS_DIR = join(PACKAGE_ROOT, 'assets', 'launch')

/** Parse the argv tail into flags. */
function parseArgs(argv) {
  const flags = { positional: [] }
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (token === '--force') { flags.force = true; continue }
    if (token.startsWith('--')) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(token + ' needs a value')
      flags[token.slice(2)] = value
      index++
      continue
    }
    flags.positional.push(token)
  }
  return flags
}

/** Slug text into a skin id. */
function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug === '' ? 'skin' : slug.startsWith('skin-') || slug.startsWith('demo-') ? slug : 'skin-' + slug
}

function main() {
  const flags = parseArgs(process.argv.slice(2))
  const video = flags.positional[0]
  if (video === undefined) {
    console.error('usage: node scripts/add-launch-skin.mjs <video> --name "Display name" [--id slug] [--poster file] [--duration seconds]')
    process.exit(2)
  }
  const videoPath = resolve(video)
  if (!existsSync(videoPath)) {
    console.error('no such video: ' + videoPath)
    process.exit(1)
  }
  const videoExt = extname(videoPath).toLowerCase()
  if (!VIDEO_EXTENSIONS.includes(videoExt)) {
    console.error('unsupported video container ' + videoExt + '; use one of ' + VIDEO_EXTENSIONS.join(', '))
    process.exit(1)
  }
  const displayName = flags.name ?? 'Launch skin'
  const id = flags.id === undefined ? slugify(displayName) : flags.id
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    console.error('bad id ' + JSON.stringify(id) + ': lowercase letters, digits and dashes only')
    process.exit(1)
  }
  const dir = join(SKINS_DIR, id)
  if (existsSync(dir) && flags.force !== true) {
    console.error('skin ' + id + ' already exists; pass --force to replace it')
    process.exit(1)
  }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const videoName = 'intro' + videoExt
  copyFileSync(videoPath, join(dir, videoName))
  let posterName
  if (flags.poster !== undefined) {
    const posterPath = resolve(flags.poster)
    const posterExt = extname(posterPath).toLowerCase()
    if (!POSTER_EXTENSIONS.includes(posterExt)) {
      console.error('unsupported poster ' + posterExt + '; use one of ' + POSTER_EXTENSIONS.join(', '))
      process.exit(1)
    }
    if (!existsSync(posterPath)) {
      console.error('no such poster: ' + posterPath)
      process.exit(1)
    }
    posterName = 'poster' + posterExt
    copyFileSync(posterPath, join(dir, posterName))
  }
  const durationSeconds = flags.duration === undefined ? undefined : Number(flags.duration)
  const manifest = {
    id,
    kind: 'video',
    name: { zh: displayName, en: flags['name-en'] ?? displayName },
    file: videoName,
    ...(posterName === undefined ? {} : { poster: posterName }),
    ...(durationSeconds === undefined || !Number.isFinite(durationSeconds) ? {} : { durationMs: Math.round(durationSeconds * 1000) }),
    ...(flags['note-zh'] === undefined && flags['note-en'] === undefined ? {} : {
      note: { zh: flags['note-zh'] ?? flags['note-en'] ?? '', en: flags['note-en'] ?? flags['note-zh'] ?? '' },
    }),
  }
  writeFileSync(join(dir, 'skin.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  const size = readFileSync(join(dir, videoName)).length
  console.log('added skin ' + id + ' -> ' + dir)
  console.log('  video   ' + videoName + ' (' + (size / 1024 / 1024).toFixed(2) + ' MB)')
  if (posterName !== undefined) console.log('  poster  ' + posterName)
  console.log('  manifest skin.json (restart the host and open Settings -> Startup animation)')
  if (size > 8 * 1024 * 1024) {
    console.warn('  warning: over 8 MB - every boot downloads this file; consider re-encoding')
  }
}

main()
