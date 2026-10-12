import { type LaunchSkinManifest, type LaunchSkinView } from '../skins-contract.ts';
/**
 * Locate the package root from the running module.
 *
 * The built host half runs from `<pkg>/lib/index.js` and the source layout from
 * `<pkg>/src/host/skins.ts`; probing for the enclosing package.json covers both
 * without a build-time constant.
 * @returns absolute package root.
 */
export declare function packageRoot(): string;
/** Directory holding the shipped skins (`<pkg>/assets/launch`). */
export declare function builtinSkinsDir(): string;
/** Whether a directory name is an acceptable skin id. */
export declare function isSkinId(value: string): boolean;
/** Project a validated manifest onto the browser-facing view. */
export declare function viewOf(manifest: LaunchSkinManifest, source: 'builtin' | 'custom'): LaunchSkinView;
/** Every shipped skin, in id order. */
export declare function listBuiltinSkins(): LaunchSkinView[];
/** Every custom skin under the Harness home, in id order. */
export declare function listCustomSkins(): LaunchSkinView[];
/** The whole catalog, built-ins first. */
export declare function listSkins(): LaunchSkinView[];
/** Locate one skin by id across both sources. */
export declare function findSkin(id: string): {
    view: LaunchSkinView;
    manifest: LaunchSkinManifest;
    dir: string;
} | undefined;
/**
 * The stored selection, with 'unset' kept distinct from 'explicitly none'.
 * @returns the stored id, null when the user chose no skin, or undefined when
 *   nothing was ever chosen (or the state file is unreadable).
 */
export declare function readStoredActive(): string | null | undefined;
/**
 * The skin that should play: the stored choice, or the first built-in skin.
 *
 * A launch-animation plugin that ships a skin should play it once installed, so an
 * unset selection (fresh install, or a stored id whose skin was replaced or
 * removed) resolves to the first built-in skin. Choosing 'no skin' stores an
 * explicit null, which stays null: the fallback never overrides a choice.
 * @returns the skin id to play, or null when nothing should play.
 */
export declare function resolveActiveSkinId(): string | null;
/** Clear the stored selection back to 'unset' (the built-in default applies). */
export declare function clearActiveSkin(): void;
/** Persist the selected skin id (null clears it). */
export declare function writeActiveSkin(id: string | null): void;
/** Absolute path + MIME of one manifest-named file, or undefined. */
export declare function resolveSkinFile(id: string, file: string): {
    path: string;
    mime: string;
} | undefined;
/** Slug one uploaded file name into a candidate skin id. */
export declare function skinIdFromName(name: string): string;
/**
 * Create (or replace) one custom skin from an already-written payload.
 * @param options - id, display name, extension and the temp file holding the bytes.
 * @returns the new skin's view, or undefined when the id is unusable.
 */
export declare function commitCustomSkin(options: {
    id: string;
    name: string;
    ext: string;
    tempPath: string;
    bytes: number;
    posterPath?: string;
}): LaunchSkinView | undefined;
/**
 * Delete one custom skin (built-ins are package files and cannot be removed).
 * @param id - skin id.
 * @returns true when a directory was removed.
 */
export declare function deleteCustomSkin(id: string): boolean;
