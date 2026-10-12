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
export type BootAnimationFrequency = 'session' | 'always';
/** One complete preference set. */
export interface BootAnimationPrefs {
    /** Master switch: false boots straight to the interface. */
    enabled: boolean;
    /** Replay policy (sessionStorage marker vs. every load). */
    frequency: BootAnimationFrequency;
    /** Let a click or Escape lift the curtain early. */
    skipOnClick: boolean;
}
/** localStorage key holding the JSON preference set. */
export declare const PREFS_STORAGE_KEY = "dsh:boot-animation:v1";
/**
 * localStorage key holding the theme the last curtain painted itself in.
 *
 * The Host's early backdrop (src/index.ts) runs before the shell publishes its
 * theme attribute, so it cannot detect the theme itself; it reads this value and
 * falls back to the OS colour scheme on the very first boot.
 */
export declare const THEME_STORAGE_KEY = "dsh:boot-animation:theme";
/** sessionStorage key marking that this browser session already played the curtain. */
export declare const SESSION_PLAYED_KEY = "dsh:boot-animation:played";
/** What a fresh install (or unreadable storage) plays. */
export declare const DEFAULT_PREFS: BootAnimationPrefs;
/** Read a stored string, tolerating a blocked or absent store. */
export declare function readStored(kind: 'local' | 'session', key: string): string | null;
/** Write a stored string, tolerating a blocked or absent store. */
export declare function writeStored(kind: 'local' | 'session', key: string, value: string): void;
/** Current preferences (stable reference until the next update). */
export declare function prefs(): BootAnimationPrefs;
/** Subscribe to preference changes; returns the unsubscribe. */
export declare function subscribePrefs(listener: () => void): () => void;
/** Persist the patch and notify subscribers. */
export declare function updatePrefs(patch: Partial<BootAnimationPrefs>): BootAnimationPrefs;
/** Drop the stored set and go back to the defaults. */
export declare function resetPrefs(): BootAnimationPrefs;
/** Record the theme the curtain painted in, for the next boot's early backdrop. */
export declare function rememberTheme(theme: 'light' | 'dark'): void;
/** True when this browser session already played the curtain. */
export declare function sessionPlayed(): boolean;
/** Mark this browser session as played. */
export declare function markSessionPlayed(): void;
