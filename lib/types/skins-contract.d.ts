/**
 * Shared contract of the launch-skin catalog: the shapes the host serves and
 * the browser half consumes, plus the paths both sides must agree on. Types
 * only for the browser half (its bundle must not drag host code in), so this
 * module stays free of node imports.
 */
/** Browser-facing base path of the plugin's own host routes. */
export declare const BOOT_ANIMATION_API = "/api/boot-animation";
/** Route that lists built-in and custom skins plus the active id. */
export declare const SKINS_ROUTE: string;
/** Route that reads or writes the selected skin (POST { id }). */
export declare const ACTIVE_ROUTE: string;
/** Prefix serving one skin's files (`<asset>/<id>/<file>`). */
export declare const ASSET_ROUTE: string;
/** Manifest file name inside a skin directory (built-in and custom alike). */
export declare const SKIN_MANIFEST_FILE = "skin.json";
/** Upload size ceiling for one custom skin, in bytes (256 MiB). */
export declare const CUSTOM_SKIN_MAX_BYTES: number;
/** Video containers a custom skin may be uploaded as. */
export declare const CUSTOM_SKIN_EXTENSIONS: readonly string[];
/** One launch skin's manifest, as stored on disk. */
export interface LaunchSkinManifest {
    /** Stable id: the directory name. */
    id: string;
    /** Only video skins exist today; the field keeps room for stills. */
    kind: 'video';
    /** Display name in both languages. */
    name: {
        zh: string;
        en: string;
    };
    /** Video file name inside the skin directory. */
    file: string;
    /** Optional poster frame shown until the video has data. */
    poster?: string;
    /** Author-declared length in milliseconds (display only). */
    durationMs?: number;
    /** Optional one-line note shown in the picker. */
    note?: {
        zh: string;
        en: string;
    };
}
/** One skin as the browser half sees it: manifest plus resolved URLs. */
export interface LaunchSkinView {
    id: string;
    /** Built-in skins ship in the package; custom ones live in $DSH_HOME. */
    source: 'builtin' | 'custom';
    kind: 'video';
    name: {
        zh: string;
        en: string;
    };
    note?: {
        zh: string;
        en: string;
    };
    /** Same-origin URL of the video. */
    videoUrl: string;
    /** Same-origin URL of the poster frame, when the skin ships one. */
    posterUrl: string | null;
    /** Declared length in milliseconds, when the author recorded one. */
    durationMs: number | null;
}
/** Answer of the skins route. */
export interface LaunchSkinCatalog {
    /** Selected skin id, or null for the built-in CSS styles. */
    active: string | null;
    skins: LaunchSkinView[];
}
/** Payload the host injects into the served index for the early backdrop. */
export interface EarlySkinPayload {
    id: string;
    /** Video URL, absolute on this origin. */
    videoUrl: string;
    posterUrl: string | null;
    durationMs: number | null;
}
/** Global the early backdrop script and the browser half both read. */
export declare const EARLY_SKIN_GLOBAL = "__DSH_BOOT_SKIN__";
