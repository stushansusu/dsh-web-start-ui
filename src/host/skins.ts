/**
 * The launch-skin registry.
 *
 * Two sources, one shape. Built-in skins ship inside this package under
 * `assets/launch/<id>/` and are read-only; custom skins live in
 * `<DSH_HOME>/launch-animations/<id>/` and are written through the upload
 * route. Both are directories holding a `skin.json` manifest plus the video (and
 * optionally a poster frame), and both are served by the same asset route, so
 * the browser half never learns which source a skin came from except to decide
 * whether it may delete it.
 *
 * Everything here is deliberately strict: a manifest that does not parse, an id
 * that does not match its directory, a file name with a separator in it, or an
 * extension outside the video allow-list makes the skin disappear from the
 * catalog rather than reach the route. The route's allow-list is the manifest
 * itself: a request can only ever fetch a file the manifest names.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTIVE_STATE_FILE, launchAnimationsDir } from './home.ts'
import {
  ASSET_ROUTE,
  CUSTOM_SKIN_EXTENSIONS,
  SKIN_MANIFEST_FILE,
  type LaunchSkinManifest,
  type LaunchSkinView,
} from '../skins-contract.ts'

/** Widest id we accept, and the only shape: lowercase, digits, single dashes. */
const SKIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A bare file name inside a skin directory: no separators, no traversal. */
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * Locate the package root from the running module.
 *
 * The built host half runs from `<pkg>/lib/index.js` and the source layout from
 * `<pkg>/src/host/skins.ts`; probing for the enclosing package.json covers both
 * without a build-time constant.
 * @returns absolute package root.
 */
export function packageRoot(): string {
  const here = fileURLToPath(new URL('..', import.meta.url))
  for (const candidate of [here, join(here, '..'), join(here, '..', '..')]) {
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return here
}

/** Directory holding the shipped skins (`<pkg>/assets/launch`). */
export function builtinSkinsDir(): string {
  return join(packageRoot(), 'assets', 'launch')
}

/** Whether a directory name is an acceptable skin id. */
export function isSkinId(value: string): boolean {
  return SKIN_ID_PATTERN.test(value)
}

/** Directory of one custom skin under the Harness home. */
function customSkinDir(id: string): string {
  return join(launchAnimationsDir(), id)
}

/** Read and validate one skin directory's manifest, or undefined. */
function readManifest(dir: string, id: string): LaunchSkinManifest | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(dir, SKIN_MANIFEST_FILE), 'utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  const file = typeof record.file === 'string' ? record.file : undefined
  if (file === undefined || !FILE_NAME_PATTERN.test(file)) return undefined
  if (!CUSTOM_SKIN_EXTENSIONS.includes(extname(file).toLowerCase())) return undefined
  if (!existsSync(join(dir, file))) return undefined
  const poster = typeof record.poster === 'string' && FILE_NAME_PATTERN.test(record.poster)
    && existsSync(join(dir, record.poster)) ? record.poster : undefined
  const name = typeof record.name === 'object' && record.name !== null ? record.name as Record<string, unknown> : {}
  const note = typeof record.note === 'object' && record.note !== null ? record.note as Record<string, unknown> : undefined
  const durationMs = typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) && record.durationMs > 0
    ? Math.round(record.durationMs)
    : undefined
  return {
    id,
    kind: 'video',
    name: {
      zh: typeof name.zh === 'string' && name.zh.trim() !== '' ? name.zh : id,
      en: typeof name.en === 'string' && name.en.trim() !== '' ? name.en : (typeof name.zh === 'string' ? name.zh : id),
    },
    file,
    ...(poster === undefined ? {} : { poster }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(note === undefined ? {} : {
      note: {
        zh: typeof note.zh === 'string' ? note.zh : '',
        en: typeof note.en === 'string' ? note.en : (typeof note.zh === 'string' ? note.zh : ''),
      },
    }),
  }
}

/** Same-origin asset URL of one file of one skin. */
function assetUrl(id: string, file: string): string {
  return ASSET_ROUTE + '/' + encodeURIComponent(id) + '/' + encodeURIComponent(file)
}

/** Project a validated manifest onto the browser-facing view. */
export function viewOf(manifest: LaunchSkinManifest, source: 'builtin' | 'custom'): LaunchSkinView {
  return {
    id: manifest.id,
    source,
    kind: 'video',
    name: manifest.name,
    ...(manifest.note === undefined ? {} : { note: manifest.note }),
    videoUrl: assetUrl(manifest.id, manifest.file),
    posterUrl: manifest.poster === undefined ? null : assetUrl(manifest.id, manifest.poster),
    durationMs: manifest.durationMs ?? null,
  }
}

/** Enumerate the skin directories of one root, in stable id order. */
function scan(root: string, source: 'builtin' | 'custom'): LaunchSkinView[] {
  let entries: string[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && isSkinId(entry.name))
      .map(entry => entry.name)
      .sort()
  } catch {
    return []
  }
  const skins: LaunchSkinView[] = []
  for (const id of entries) {
    const manifest = readManifest(join(root, id), id)
    if (manifest !== undefined) skins.push(viewOf(manifest, source))
  }
  return skins
}

/** Every shipped skin, in id order. */
export function listBuiltinSkins(): LaunchSkinView[] {
  return scan(builtinSkinsDir(), 'builtin')
}

/** Every custom skin under the Harness home, in id order. */
export function listCustomSkins(): LaunchSkinView[] {
  return scan(launchAnimationsDir(), 'custom')
}

/** The whole catalog, built-ins first. */
export function listSkins(): LaunchSkinView[] {
  return [...listBuiltinSkins(), ...listCustomSkins()]
}

/** Locate one skin by id across both sources. */
export function findSkin(id: string): { view: LaunchSkinView; manifest: LaunchSkinManifest; dir: string } | undefined {
  if (!isSkinId(id)) return undefined
  for (const [dir, source] of [[join(builtinSkinsDir(), id), 'builtin'], [customSkinDir(id), 'custom']] as const) {
    const manifest = readManifest(dir, id)
    if (manifest !== undefined) return { view: viewOf(manifest, source), manifest, dir }
  }
  return undefined
}

/**
 * The stored selection, with 'unset' kept distinct from 'explicitly none'.
 * @returns the stored id, null when the user chose no skin, or undefined when
 *   nothing was ever chosen (or the state file is unreadable).
 */
export function readStoredActive(): string | null | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(launchAnimationsDir(), ACTIVE_STATE_FILE), 'utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const active = (parsed as Record<string, unknown>).active
  if (active === null) return null
  return typeof active === 'string' && active !== '' ? active : undefined
}

/**
 * The skin that should play: the stored choice, or the first built-in skin.
 *
 * A launch-animation plugin that ships a skin should play it once installed, so an
 * unset selection (fresh install, or a stored id whose skin was replaced or
 * removed) resolves to the first built-in skin. Choosing 'no skin' stores an
 * explicit null, which stays null: the fallback never overrides a choice.
 * @returns the skin id to play, or null when nothing should play.
 */
export function resolveActiveSkinId(): string | null {
  const stored = readStoredActive()
  if (stored === null) return null
  if (stored !== undefined && findSkin(stored) !== undefined) return stored
  const fallback = listBuiltinSkins()[0]
  return fallback === undefined ? null : fallback.id
}

/** Clear the stored selection back to 'unset' (the built-in default applies). */
export function clearActiveSkin(): void {
  const dir = launchAnimationsDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, ACTIVE_STATE_FILE), JSON.stringify({}, null, 2) + '\n', 'utf8')
}

/** Persist the selected skin id (null clears it). */
export function writeActiveSkin(id: string | null): void {
  const dir = launchAnimationsDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, ACTIVE_STATE_FILE), JSON.stringify({ active: id }, null, 2) + '\n', 'utf8')
}

/** Absolute path + MIME of one manifest-named file, or undefined. */
export function resolveSkinFile(id: string, file: string): { path: string; mime: string } | undefined {
  const found = findSkin(id)
  if (found === undefined) return undefined
  // The manifest is the allow-list: a request may only fetch the video or the
  // poster the skin itself names.
  if (file !== found.manifest.file && file !== found.manifest.poster) return undefined
  const path = join(found.dir, file)
  try {
    if (!statSync(path).isFile()) return undefined
  } catch {
    return undefined
  }
  return { path, mime: mimeFor(file) }
}

/** Content type by extension (video containers plus the poster imagery). */
function mimeFor(file: string): string {
  switch (extname(file).toLowerCase()) {
    case '.mp4': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.mov': return 'video/quicktime'
    case '.webp': return 'image/webp'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    default: return 'application/octet-stream'
  }
}

/** Slug one uploaded file name into a candidate skin id. */
export function skinIdFromName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  const base = slug === '' ? 'custom' : slug
  return base.startsWith('custom') ? base : 'custom-' + base
}

/**
 * Create (or replace) one custom skin from an already-written payload.
 * @param options - id, display name, extension and the temp file holding the bytes.
 * @returns the new skin's view, or undefined when the id is unusable.
 */
export function commitCustomSkin(options: {
  id: string
  name: string
  ext: string
  tempPath: string
  bytes: number
  posterPath?: string
}): LaunchSkinView | undefined {
  if (!isSkinId(options.id)) return undefined
  const ext = options.ext.toLowerCase()
  if (!CUSTOM_SKIN_EXTENSIONS.includes(ext)) return undefined
  const dir = customSkinDir(options.id)
  mkdirSync(dir, { recursive: true })
  const file = 'intro' + ext
  const target = join(dir, file)
  try {
    rmSync(target, { force: true })
    renameSync(options.tempPath, target)
  } catch {
    return undefined
  }
  const manifest: LaunchSkinManifest = {
    id: options.id,
    kind: 'video',
    name: { zh: options.name, en: options.name },
    file,
    ...(options.posterPath === undefined ? {} : { poster: 'poster.webp' }),
  }
  writeFileSync(join(dir, SKIN_MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return viewOf(manifest, 'custom')
}

/**
 * Delete one custom skin (built-ins are package files and cannot be removed).
 * @param id - skin id.
 * @returns true when a directory was removed.
 */
export function deleteCustomSkin(id: string): boolean {
  if (!isSkinId(id)) return false
  const dir = customSkinDir(id)
  if (!existsSync(dir)) return false
  rmSync(dir, { recursive: true, force: true })
  return !existsSync(dir)
}
