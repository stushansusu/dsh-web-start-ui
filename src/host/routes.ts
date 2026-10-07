/**
 * The plugin's HTTP surface.
 *
 * One prefix registration carries four things the browser half needs and cannot
 * do alone: the catalog of launch skins, the selection, the upload of a custom
 * video, and the bytes themselves (with Range support, because a browser wants a
 * byte range to start an mp4 without downloading all of it).
 *
 * Mutations are loopback-only: the desktop shell binds 0.0.0.0 for its LAN mode,
 * and an unauthenticated upload/delete/select route reachable from the network
 * would be a hole. Reads (catalog and assets) stay open, the way the pet's asset
 * route is, so a paired device still sees the curtain it was configured with.
 */
import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { once } from 'node:events'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import {
  ACTIVE_ROUTE,
  ASSET_ROUTE,
  BOOT_ANIMATION_API,
  CUSTOM_SKIN_EXTENSIONS,
  CUSTOM_SKIN_MAX_BYTES,
  SKINS_ROUTE,
  type LaunchSkinCatalog,
} from '../skins-contract.ts'
import {
  commitCustomSkin,
  deleteCustomSkin,
  isSkinId,
  clearActiveSkin,
  listSkins,
  readStoredActive,
  resolveActiveSkinId,
  resolveSkinFile,
  skinIdFromName,
  writeActiveSkin,
} from './skins.ts'
import { launchAnimationsDir } from './home.ts'

/** JSON response headers for this family. */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

/** Write one JSON response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/**
 * Whether the request arrived over loopback.
 *
 * IPv4 loopback, IPv6 loopback, and the IPv4-mapped form Node reports on a
 * dual-stack socket. Anything else (a LAN address, a tunnel) fails.
 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

/** Read the whole request body as JSON, bounded to 64 KiB. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > 64 * 1024) throw new Error('body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? null : JSON.parse(text)
}

/** The whole catalog plus the selected id. */
export function catalog(): LaunchSkinCatalog {
  return { active: resolveActiveSkinId(), skins: listSkins() }
}

/** First free id derived from a display name. */
function uniqueSkinId(name: string): string {
  const base = skinIdFromName(name)
  const taken = new Set(listSkins().map(skin => skin.id))
  if (!taken.has(base)) return base
  for (let index = 2; index < 100; index++) {
    const candidate = base + '-' + index
    if (!taken.has(candidate)) return candidate
  }
  return base + '-' + Date.now().toString(36)
}

/**
 * Stream one upload into a temp file under the cap.
 * @returns the byte count, or undefined when the payload exceeded the cap.
 */
async function spoolUpload(req: IncomingMessage, tempPath: string): Promise<number | undefined> {
  const out = createWriteStream(tempPath)
  let bytes = 0
  try {
    for await (const chunk of req) {
      const buffer = chunk as Buffer
      bytes += buffer.length
      if (bytes > CUSTOM_SKIN_MAX_BYTES) {
        out.destroy()
        return undefined
      }
      if (!out.write(buffer)) await once(out, 'drain')
    }
    await new Promise<void>((resolve, reject) => {
      out.end(() => { resolve() })
      out.on('error', reject)
    })
    return bytes
  } catch {
    out.destroy()
    return undefined
  }
}

/** Handle POST /skins (a raw video body plus name/ext query parameters). */
async function handleUpload(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const declared = (url.searchParams.get('name') ?? '').trim()
  const requestedExt = (url.searchParams.get('ext') ?? '').trim().toLowerCase()
  const ext = requestedExt !== '' ? requestedExt : extname(declared).toLowerCase()
  if (!CUSTOM_SKIN_EXTENSIONS.includes(ext)) {
    sendJson(res, 400, { error: 'unsupported-extension', allowed: CUSTOM_SKIN_EXTENSIONS })
    return
  }
  const displayName = declared === '' ? 'Custom launch animation' : declared.replace(/\.[A-Za-z0-9]+$/, '')
  const requestedId = url.searchParams.get('id') ?? ''
  const id = isSkinId(requestedId) ? requestedId : uniqueSkinId(displayName)
  const tempPath = join(tmpdir(), 'dsh-web-start-ui-' + id + '-' + Date.now() + '.upload')
  const bytes = await spoolUpload(req, tempPath)
  if (bytes === undefined) {
    rmSync(tempPath, { force: true })
    sendJson(res, 413, { error: 'too-large', maxBytes: CUSTOM_SKIN_MAX_BYTES })
    return
  }
  if (bytes === 0) {
    rmSync(tempPath, { force: true })
    sendJson(res, 400, { error: 'empty-body' })
    return
  }
  const skin = commitCustomSkin({ id, name: displayName, ext, tempPath, bytes })
  if (skin === undefined) {
    rmSync(tempPath, { force: true })
    sendJson(res, 400, { error: 'rejected' })
    return
  }
  sendJson(res, 201, { skin, catalog: catalog() })
}

/** Serve one skin file, honouring a single byte range. */
function serveAsset(req: IncomingMessage, res: ServerResponse, id: string, file: string): void {
  const resolved = resolveSkinFile(id, file)
  if (resolved === undefined) {
    sendJson(res, 404, { error: 'not-found' })
    return
  }
  const stat = statSync(resolved.path)
  const size = stat.size
  // The URL is stable per skin, so the response must be revalidatable rather than
  // refetched: a launch video is megabytes, and every boot would otherwise pay for
  // it again. max-age=0 + must-revalidate keeps replacement honest (a re-uploaded
  // skin changes the ETag), while the 304 keeps the body in the browser's cache.
  const etag = '"' + size.toString(36) + '-' + Math.floor(stat.mtimeMs).toString(36) + '"'
  const headers: Record<string, string> = {
    'content-type': resolved.mime,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0, must-revalidate',
    etag,
  }
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }
  const range = req.headers.range
  const match = typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
  if (match === null) {
    res.writeHead(200, { ...headers, 'content-length': String(size) })
    createReadStream(resolved.path).pipe(res)
    return
  }
  const rawStart = match[1]
  const rawEnd = match[2]
  let start = rawStart === '' ? undefined : Number(rawStart)
  let end = rawEnd === '' ? undefined : Number(rawEnd)
  if (start === undefined && end === undefined) {
    res.writeHead(416, { ...headers, 'content-range': 'bytes */' + size })
    res.end()
    return
  }
  if (start === undefined) {
    const tail = end ?? 0
    start = Math.max(0, size - tail)
    end = size - 1
  } else if (end === undefined || end >= size) {
    end = size - 1
  }
  if (start >= size || start > end) {
    res.writeHead(416, { ...headers, 'content-range': 'bytes */' + size })
    res.end()
    return
  }
  res.writeHead(206, {
    ...headers,
    'content-range': 'bytes ' + start + '-' + end + '/' + size,
    'content-length': String(end - start + 1),
  })
  createReadStream(resolved.path, { start, end }).pipe(res)
}

/** The single prefix route: everything under /api/boot-animation. */
export function bootAnimationRoute(): WebRoute {
  return {
    kind: 'prefix',
    path: BOOT_ANIMATION_API,
    handler: (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname
      const method = req.method ?? 'GET'
      if (method === 'GET' && path === SKINS_ROUTE) {
        sendJson(res, 200, catalog())
        return
      }
      if (method === 'POST' && path === ACTIVE_ROUTE) {
        if (!isLoopbackRequest(req)) {
          sendJson(res, 403, { error: 'loopback-only' })
          return
        }
        void handleActive(req, res)
        return
      }
      if (method === 'POST' && path === SKINS_ROUTE) {
        if (!isLoopbackRequest(req)) {
          sendJson(res, 403, { error: 'loopback-only' })
          return
        }
        void handleUpload(req, res, url)
        return
      }
      if (method === 'DELETE' && path.startsWith(SKINS_ROUTE + '/')) {
        if (!isLoopbackRequest(req)) {
          sendJson(res, 403, { error: 'loopback-only' })
          return
        }
        const id = decodeURIComponent(path.slice(SKINS_ROUTE.length + 1))
        const found = listSkins().find(skin => skin.id === id)
        if (found === undefined) {
          sendJson(res, 404, { error: 'not-found' })
          return
        }
        if (found.source !== 'custom') {
          sendJson(res, 400, { error: 'builtin-not-removable' })
          return
        }
        const removed = deleteCustomSkin(id)
        // A deleted skin must not stay selected: clearing returns the install to the
        // built-in default rather than to an explicit 'no skin'.
        if (removed && readStoredActive() === id) clearActiveSkin()
        sendJson(res, 200, { removed, catalog: catalog() })
        return
      }
      if (method === 'GET' && path.startsWith(ASSET_ROUTE + '/')) {
        const rest = path.slice(ASSET_ROUTE.length + 1)
        const slash = rest.indexOf('/')
        if (slash <= 0) {
          sendJson(res, 404, { error: 'not-found' })
          return
        }
        const id = decodeURIComponent(rest.slice(0, slash))
        const file = decodeURIComponent(rest.slice(slash + 1))
        serveAsset(req, res, id, file)
        return
      }
      sendJson(res, 404, { error: 'not-found' })
    },
  }
}

/** Handle POST /active: { id: string | null }. */
async function handleActive(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try {
    body = await readJson(req)
  } catch {
    sendJson(res, 400, { error: 'bad-json' })
    return
  }
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { error: 'bad-body' })
    return
  }
  const value = (body as Record<string, unknown>).id
  if (value === null || value === undefined || value === '') {
    writeActiveSkin(null)
    sendJson(res, 200, catalog())
    return
  }
  if (typeof value !== 'string' || !isSkinId(value)) {
    sendJson(res, 400, { error: 'bad-id' })
    return
  }
  if (!listSkins().some(skin => skin.id === value)) {
    sendJson(res, 404, { error: 'unknown-skin' })
    return
  }
  writeActiveSkin(value)
  sendJson(res, 200, catalog())
}

/** Directory custom skins are written to (exported for diagnostics/tests). */
export function customSkinsRoot(): string {
  return launchAnimationsDir()
}
