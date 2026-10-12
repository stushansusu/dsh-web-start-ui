/**
 * Browser-side face of the launch-skin catalog.
 *
 * The catalog itself lives on the host (built-in skins from the package, custom
 * ones from the Harness home, and the selected id), so the settings page talks to
 * the plugin's own routes. Uploads go through XMLHttpRequest rather than fetch,
 * because a video is the one request in this plugin worth showing progress for.
 */
import { type LaunchSkinCatalog, type LaunchSkinView } from '../../skins-contract.ts';
/** One catalog read, or the reason it failed. */
export type CatalogResult = {
    ok: true;
    catalog: LaunchSkinCatalog;
} | {
    ok: false;
    error: string;
};
/** Read the catalog. */
export declare function fetchCatalog(): Promise<CatalogResult>;
/** Select one skin (null clears the selection back to the CSS styles). */
export declare function setActiveSkin(id: string | null): Promise<CatalogResult>;
/** Delete one custom skin. */
export declare function deleteSkin(id: string): Promise<CatalogResult>;
/**
 * Upload one video as a new custom skin.
 * @param file - the picked file.
 * @param onProgress - called with a 0..1 fraction while the body is sent.
 * @returns the refreshed catalog, or the failure.
 */
export declare function uploadSkin(file: File, onProgress?: (fraction: number) => void): Promise<CatalogResult>;
/** Short label for one skin's origin. */
export declare function isCustom(skin: LaunchSkinView): boolean;
/** Seconds shown for a video skin's declared length. */
export declare function durationLabel(durationMs: number | null): string | null;
