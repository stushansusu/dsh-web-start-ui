/**
 * Startup-animation preferences.
 *
 * Browser-local on purpose: the curtain is presentation, so nothing here belongs
 * in the profile configuration (no Host round trip, no settings revision, no
 * migration). The store is a plain snapshot + subscriber pair so the settings card
 * can read it through useSyncExternalStore and the boot path can read it
 * synchronously before the first paint.
 *
 * The animation itself is NOT here: which launch skin plays is host state (every
 * browser of one install opens on the same curtain, and only the host can start
 * the video before the shell exists).
 *
 * Every read is defensive: a hand-edited or half-written localStorage value must
 * degrade to the defaults instead of throwing inside the boot path.
 */

/** When the curtain plays: only the first load of a browser session, or every load. */
export type BootAnimationFrequency = 'session' | 'always'

/** One complete preference set. */
export interface BootAnimationPrefs {
  /** Master switch: false boots straight to the interface. */
  enabled: boolean
  /** Replay policy (sessionStorage marker vs. every load). */
  frequency: BootAnimationFrequency
  /** Let a click or Escape lift the curtain early. */
  skipOnClick: boolean
}

/** localStorage key holding the JSON preference set. */
export const PREFS_STORAGE_KEY = 'dsh:boot-animation:v1'

/**
 * localStorage key holding the theme the last curtain painted itself in.
 *
 * The Host's early backdrop (src/index.ts) runs before the shell publishes its
 * theme attribute, so it cannot detect the theme itself; it reads this value and
 * falls back to the OS colour scheme on the very first boot.
 */
export const THEME_STORAGE_KEY = 'dsh:boot-animation:theme'

/** sessionStorage key marking that this browser session already played the curtain. */
export const SESSION_PLAYED_KEY = 'dsh:boot-animation:played'

/** What a fresh install (or unreadable storage) plays. */
export const DEFAULT_PREFS: BootAnimationPrefs = {
  enabled: true,
  frequency: 'session',
  skipOnClick: true,
}

/** Narrow an unknown value to a known replay policy. */
function frequencyOf(value: unknown): BootAnimationFrequency {
  return value === 'always' || value === 'session' ? value : DEFAULT_PREFS.frequency
}

/** Decode one stored payload, ignoring anything that is not an object. */
function decode(raw: string | null): BootAnimationPrefs {
  if (typeof raw !== 'string' || raw.length === 0) return { ...DEFAULT_PREFS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_PREFS }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFS }
  const record = parsed as Record<string, unknown>
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_PREFS.enabled,
    frequency: frequencyOf(record.frequency),
    skipOnClick: typeof record.skipOnClick === 'boolean' ? record.skipOnClick : DEFAULT_PREFS.skipOnClick,
  }
}

/** Read one web-storage area without letting a blocked store break boot. */
function storage(kind: 'local' | 'session'): Storage | undefined {
  try {
    const area = kind === 'local' ? window.localStorage : window.sessionStorage
    return area ?? undefined
  } catch {
    return undefined
  }
}

/** Read a stored string, tolerating a blocked or absent store. */
export function readStored(kind: 'local' | 'session', key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** Write a stored string, tolerating a blocked or absent store. */
export function writeStored(kind: 'local' | 'session', key: string, value: string): void {
  try {
    storage(kind)?.setItem(key, value)
  } catch {
    // A blocked store (private mode, disabled cookies) just does not persist.
  }
}

/** Load the effective preferences at module evaluation. */
function load(): BootAnimationPrefs {
  return decode(readStored('local', PREFS_STORAGE_KEY))
}

let current: BootAnimationPrefs = load()
const listeners = new Set<() => void>()

/** Current preferences (stable reference until the next update). */
export function prefs(): BootAnimationPrefs {
  return current
}

/** Subscribe to preference changes; returns the unsubscribe. */
export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function publish(next: BootAnimationPrefs): BootAnimationPrefs {
  current = next
  for (const listener of [...listeners]) listener()
  return current
}

/** Persist the patch and notify subscribers. */
export function updatePrefs(patch: Partial<BootAnimationPrefs>): BootAnimationPrefs {
  const next = decode(JSON.stringify({ ...current, ...patch }))
  writeStored('local', PREFS_STORAGE_KEY, JSON.stringify(next))
  return publish(next)
}

/** Drop the stored set and go back to the defaults. */
export function resetPrefs(): BootAnimationPrefs {
  try {
    storage('local')?.removeItem(PREFS_STORAGE_KEY)
  } catch {
    // Ignore: the in-memory reset below is the observable behavior.
  }
  return publish({ ...DEFAULT_PREFS })
}

/** Record the theme the curtain painted in, for the next boot's early backdrop. */
export function rememberTheme(theme: 'light' | 'dark'): void {
  writeStored('local', THEME_STORAGE_KEY, theme)
}

/** True when this browser session already played the curtain. */
export function sessionPlayed(): boolean {
  return readStored('session', SESSION_PLAYED_KEY) === '1'
}

/** Mark this browser session as played. */
export function markSessionPlayed(): void {
  writeStored('session', SESSION_PLAYED_KEY, '1')
}
