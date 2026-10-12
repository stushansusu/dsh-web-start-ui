/**
 * Startup-animation plugin, browser half.
 *
 * Two jobs, both local to this page:
 *
 *  1. Boot - play the selected launch skin the instant this module is applied
 *     (before the shell's first frame). The skin arrives in the served index as a
 *     global and the Host's inline script has already created and started its
 *     video; this half adopts that element rather than restarting it (see
 *     runtime/splash.ts). No skin means no curtain: the plugin plays a video or
 *     nothing at all. The replay policy is honoured here - 'session' writes the
 *     sessionStorage marker, so a reload goes straight to the interface.
 *  2. Settings - register one first-level settings section (id 'boot-animation')
 *     whose page picks a launch skin (host state, through the plugin's own routes),
 *     uploads or deletes custom skins, and can replay any of them on the spot.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type BootAnimationKey } from './locales.ts';
import { type SplashSkin } from './runtime/splash.ts';
/** Locale namespace owned by this plugin. */
export declare const NS = "bootAnimation";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Startup-animation settings copy. */
        bootAnimation: BootAnimationKey;
    }
}
/** Required services: the slot registry and the locale dictionary service. */
export declare const inject: string[];
/**
 * The launch skin the Host injected into this page, if any.
 *
 * Read synchronously from the served global: the video is already playing by the
 * time this half runs, and waiting for the catalog request would mean either
 * restarting it or showing a second curtain.
 * @returns the injected skin, or null when this page has no curtain to play.
 */
export declare function readInjectedSkin(): SplashSkin | null;
/**
 * Register the dictionaries, boot the curtain and publish the settings page.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
