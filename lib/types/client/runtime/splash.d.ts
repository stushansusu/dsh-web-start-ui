/** Colour scheme the curtain paints its letterbox backdrop in. */
export type SplashTheme = 'light' | 'dark';
/** One launch skin, as the curtain needs it. */
export interface SplashSkin {
    /** Skin id (also stamped on the layer for diagnostics). */
    id: string;
    /** Same-origin video URL. */
    videoUrl: string;
    /** Same-origin poster URL, when the skin ships one. */
    posterUrl: string | null;
    /** Author-declared length in milliseconds, when the manifest records one. */
    durationMs: number | null;
}
/** One curtain run. */
export interface SplashOptions {
    /** The skin to play. A curtain without a skin is not a curtain. */
    skin: SplashSkin;
    /** Let a click or Escape lift the curtain early (default true). */
    skipOnClick?: boolean;
    /** Footnote shown under the curtain while skipping is available. */
    hint?: string;
    /** Footnote text while the curtain waits for the shell's first paint. */
    waiting?: string;
    /** Force a colour scheme; detected from the shell theme when omitted. */
    theme?: SplashTheme;
    /** Hold the curtain until the shell has painted (bounded by the hold cap). */
    waitForApp?: boolean;
    /** Called once when the curtain is gone, however it ended. */
    onFinish?: () => void;
}
/** Attribute stamped on the curtain element (probing and CSS scoping). */
export declare const CURTAIN_ATTRIBUTE = "data-dsh-boot-animation";
/** Detect the shell's colour scheme from the theme attributes. */
export declare function detectTheme(): SplashTheme;
/** True once the shell has painted something into the app root. */
export declare function appHasPainted(): boolean;
/**
 * Play the curtain on top of the whole page.
 * @param options - the curtain run (see {@link SplashOptions}).
 * @returns a disposer that lifts the curtain immediately; safe to call twice.
 */
export declare function playSplash(options: SplashOptions): () => void;
