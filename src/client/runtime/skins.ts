/**
 * Browser-side face of the launch-skin catalog.
 *
 * The catalog itself lives on the host (built-in skins from the package, custom
 * ones from the Harness home, and the selected id), so the settings page talks to
 * the plugin's own routes. Uploads go through XMLHttpRequest rather than fetch,
 * because a video is the one request in this plugin worth showing progress for.
 */
import {
  ACTIVE_ROUTE,
  CUSTOM_SKIN_EXTENSIONS,
  SKINS_ROUTE,
  type LaunchSkinCatalog,
  type LaunchSkinView,
} from '../../skins-contract.ts'

/** One catalog read, or the reason it failed. */
export type CatalogResult =
  | { ok: true; catalog: LaunchSkinCatalog }
  | { ok: false; error: string }

/** Narrow one catalog payload from the wire. */
function decodeCatalog(value: unknown): LaunchSkinCatalog | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const active = typeof record.active === 'string' ? record.active : null
  if (!Array.isArray(record.skins)) return undefined
  const skins: LaunchSkinView[] = []
  for (const entry of record.skins) {
    if (typeof entry !== 'object' || entry === null) continue
    const skin = entry as Record<string, unknown>
    if (typeof skin.id !== 'string' || typeof skin.videoUrl !== 'string') continue
    const name = typeof skin.name === 'object' && skin.name !== null ? skin.name as Record<string, unknown> : {}
    const note = typeof skin.note === 'object' && skin.note !== null ? skin.note as Record<string, unknown> : undefined
    skins.push({
      id: skin.id,
      source: skin.source === 'custom' ? 'custom' : 'builtin',
      kind: 'video',
      name: {
        zh: typeof name.zh === 'string' ? name.zh : skin.id,
        en: typeof name.en === 'string' ? name.en : skin.id,
      },
      ...(note === undefined ? {} : { note: { zh: String(note.zh ?? ''), en: String(note.en ?? '') } }),
      videoUrl: skin.videoUrl,
      posterUrl: typeof skin.posterUrl === 'string' ? skin.posterUrl : null,
      durationMs: typeof skin.durationMs === 'number' ? skin.durationMs : null,
    })
  }
  return { active, skins }
}

/** Read the catalog. */
export async function fetchCatalog(): Promise<CatalogResult> {
  try {
    const response = await fetch(SKINS_ROUTE, { headers: { accept: 'application/json' } })
    if (!response.ok) return { ok: false, error: 'http-' + response.status }
    const catalog = decodeCatalog(await response.json())
    return catalog === undefined ? { ok: false, error: 'bad-payload' } : { ok: true, catalog }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

/** Select one skin (null clears the selection back to the CSS styles). */
export async function setActiveSkin(id: string | null): Promise<CatalogResult> {
  try {
    const response = await fetch(ACTIVE_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) return { ok: false, error: 'http-' + response.status }
    const catalog = decodeCatalog(await response.json())
    return catalog === undefined ? { ok: false, error: 'bad-payload' } : { ok: true, catalog }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

/** Delete one custom skin. */
export async function deleteSkin(id: string): Promise<CatalogResult> {
  try {
    const response = await fetch(SKINS_ROUTE + '/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return { ok: false, error: 'http-' + response.status }
    const body = await response.json() as { catalog?: unknown }
    const catalog = decodeCatalog(body.catalog)
    return catalog === undefined ? { ok: false, error: 'bad-payload' } : { ok: true, catalog }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

/**
 * Upload one video as a new custom skin.
 * @param file - the picked file.
 * @param onProgress - called with a 0..1 fraction while the body is sent.
 * @returns the refreshed catalog, or the failure.
 */
export function uploadSkin(file: File, onProgress?: (fraction: number) => void): Promise<CatalogResult> {
  return new Promise<CatalogResult>((resolve) => {
    const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
    if (!CUSTOM_SKIN_EXTENSIONS.includes(extension)) {
      resolve({ ok: false, error: 'unsupported-extension' })
      return
    }
    const query = '?name=' + encodeURIComponent(file.name) + '&ext=' + encodeURIComponent(extension)
    const request = new XMLHttpRequest()
    request.open('POST', SKINS_ROUTE + query, true)
    request.setRequestHeader('content-type', file.type === '' ? 'application/octet-stream' : file.type)
    request.upload.addEventListener('progress', (event) => {
      if (onProgress !== undefined && event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    })
    request.addEventListener('error', () => { resolve({ ok: false, error: 'network' }) })
    request.addEventListener('abort', () => { resolve({ ok: false, error: 'aborted' }) })
    request.addEventListener('load', () => {
      let payload: unknown
      try {
        payload = JSON.parse(request.responseText)
      } catch {
        resolve({ ok: false, error: 'bad-payload' })
        return
      }
      const record = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
      const catalog = decodeCatalog(record.catalog)
      if (request.status >= 200 && request.status < 300 && catalog !== undefined) {
        resolve({ ok: true, catalog })
        return
      }
      const reason = typeof record.error === 'string' ? record.error : 'http-' + request.status
      resolve({ ok: false, error: reason })
    })
    request.send(file)
  })
}

/** Short label for one skin's origin. */
export function isCustom(skin: LaunchSkinView): boolean {
  return skin.source === 'custom'
}

/** Seconds shown for a video skin's declared length. */
export function durationLabel(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) return null
  return (durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 1)
}
