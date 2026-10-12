/**
 * Host loader entry for the startup-animation plugin.
 *
 * Two jobs, both about the frames the browser half cannot paint on its own:
 *
 *  1. Serve the launch-skin catalog and the video bytes (`src/host/routes.ts`):
 *     built-in skins ship in this package, custom ones live under the Harness
 *     home, and the selected id is host state so every browser of this install
 *     sees the same curtain.
 *  2. Contribute the served index's early backdrop
 *     (`webserver/index-inject`): a global carrying the selected skin's URLs plus
 *     one small inline script that paints the backdrop — and starts the video —
 *     before the module graph is even requested. Measured without it: the shell
 *     paints at ~115ms while the browser half only runs at ~550ms, so the
 *     interface would flash first. With it the video element is fetching by
 *     ~35ms, and the browser half ADOPTS that very element (see
 *     src/client/runtime/splash.ts) rather than restarting playback.
 *
 * The routes are installed lazily from the first injection emit: that event is
 * proof the webserver exists, which is what lets this half stay inject-free and
 * therefore loadable on a Host that serves no HTTP at all — a headless profile
 * then simply never paints a backdrop.
 *
 * The inline script is emitted from a real function through `toString()` instead
 * of a hand-escaped string literal: it stays readable and type-checked, and its
 * only outside inputs are the three arguments below. Nothing inside it may
 * reference module scope.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type EarlySkinPayload } from './skins-contract.ts';
/** Serialize the early curtain into one inline script, with its inputs bound. */
export declare function earlyCurtainScript(): string;
/** Payload the early script and the browser half read, or null without a skin. */
export declare function earlySkinPayload(): EarlySkinPayload | null;
/**
 * Contribute the early curtain (and install the routes) on every index render.
 * @param ctx - host root context.
 */
export declare function apply(ctx: Context): void;
