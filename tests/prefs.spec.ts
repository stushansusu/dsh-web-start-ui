/**
 * Startup-animation preferences: the browser-local store that decides whether the
 * curtain plays, how often, and whether a click may lift it early.
 *
 * Which skin plays is host state (src/host/*), covered by the real-shell probes in
 * the package AGENTS.md. What belongs in unit tests is the surface that runs during
 * BOOT: every decode and fallback below is on the path that paints the first frame,
 * so a throw or a bad value here is a broken launch rather than a wrong-looking
 * settings page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A web-storage area good enough for the store's read/write surface. */
function makeArea(): Storage {
  const map = new Map<string, string>()
  return {
    get length(): number { return map.size },
    clear: () => { map.clear() },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key) },
    setItem: (key: string, value: string) => { map.set(key, String(value)) },
  }
}

const local = makeArea()
const session = makeArea()

// The store reaches for the browser's two storage areas; the node test environment
// has no window, so the stubs above take its place. Assigned through a named
// binding, never as a bare parenthesized statement: a line opening with a
// parenthesis would be read as a call on the previous statement and the file would
// fail to collect.
const host = globalThis as unknown as { window: unknown }
host.window = { localStorage: local, sessionStorage: session }

/**
 * Evaluate the store module fresh, as a page load would.
 * @returns the newly evaluated module (its top-level load ran against the stubs).
 */
async function freshStore(): Promise<typeof import('../src/client/runtime/prefs.ts')> {
  vi.resetModules()
  return await import('../src/client/runtime/prefs.ts')
}

describe('startup-animation preferences', () => {
  beforeEach(() => {
    local.clear()
    session.clear()
  })

  it('user gets the documented defaults in a browser that stored nothing', async () => {
    // Given: no preference set and no session marker
    // When: the store loads
    const store = await freshStore()
    // Then: it exposes the defaults the settings page shows
    expect(store.prefs()).toEqual({ enabled: true, frequency: 'session', skipOnClick: true })
  })

  it('user keeps a stored set across a reload', async () => {
    // Given: a stored set written by an earlier session
    local.setItem('dsh:boot-animation:v1', JSON.stringify({ enabled: false, frequency: 'always', skipOnClick: false }))
    // When: the store loads again
    const store = await freshStore()
    // Then: every field comes back unchanged
    expect(store.prefs()).toEqual({ enabled: false, frequency: 'always', skipOnClick: false })
  })

  it('user gets the defaults when the stored payload is not usable', async () => {
    // Given: a hand-edited payload (truncated JSON) and a non-object payload
    local.setItem('dsh:boot-animation:v1', '{"enabled":')
    // When: the store loads
    const broken = await freshStore()
    // Then: it falls back to the defaults instead of throwing
    expect(broken.prefs().frequency).toBe('session')
    local.setItem('dsh:boot-animation:v1', '"just a string"')
    const wrongShape = await freshStore()
    expect(wrongShape.prefs().enabled).toBe(true)
  })

  it('user never gets an unknown replay policy', async () => {
    // Given: a write carrying a policy this plugin does not ship
    const store = await freshStore()
    // When: the settings page stores that patch
    store.updatePrefs({ frequency: 'sometimes' as never })
    // Then: the unknown value collapses to the default
    expect(store.prefs().frequency).toBe('session')
  })

  it('user sees the curtain once per browser session under the session policy', async () => {
    // Given: a fresh browser session
    const store = await freshStore()
    const before = store.sessionPlayed()
    // When: the curtain reports that it played
    store.markSessionPlayed()
    // Then: the marker is set and the next load reads it as played
    expect(before).toBe(false)
    expect(store.sessionPlayed()).toBe(true)
    expect(session.getItem('dsh:boot-animation:played')).toBe('1')
  })

  it('user hands the last curtain theme to the next boot', async () => {
    // Given: a curtain that painted in the dark theme
    const store = await freshStore()
    // When: the curtain records the theme it used
    store.rememberTheme('dark')
    // Then: the host's early backdrop can read it before the shell exists
    expect(local.getItem('dsh:boot-animation:theme')).toBe('dark')
  })
})
