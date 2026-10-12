/**
 * The startup-animation settings page.
 *
 * One thing to choose, plus how it behaves. The card lists every launch skin the
 * host knows (built in the package, or uploaded here into the Harness home), lets
 * one be selected or removed, uploads a new one with progress, and replays any of
 * them on the spot. Playback preferences (enable, replay policy, click to skip)
 * are browser-local; the selected skin is host state, so every browser of one
 * install opens on the same curtain.
 *
 * Colors ride the GUI's --dsw-alias-* semantic tokens, which the shell redefines
 * under body[data-ds-dark-theme] and under an active skin, so the page follows the
 * theme and the skin without a single hard-coded hex.
 */
import { type ReactNode } from 'react';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SplashSkin } from './runtime/splash.ts';
/** Business face the plugin's apply() injects into the card. */
export interface BootAnimationInjected {
    /** Play the curtain immediately with the given skin. */
    preview(skin: SplashSkin): void;
    /** Drop the stored playback preferences and return to the defaults. */
    reset(): void;
}
/** Plugin-card props: locale seat + injected face. */
export type BootAnimationCardProps = PropsLocale<'bootAnimation'> & BootAnimationInjected;
/**
 * Render the startup-animation settings page.
 * @param props - locale seat plus the injected preview/reset faces.
 * @returns the settings page.
 */
export declare function BootAnimationCard({ t, preview, reset }: BootAnimationCardProps): ReactNode;
