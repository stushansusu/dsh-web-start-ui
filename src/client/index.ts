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
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned ctx.slots Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge ('settings.section').
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the layout plugin's slot declarations.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { BootAnimationCard, type BootAnimationInjected } from './BootAnimationCard.tsx'
import { en, zh, type BootAnimationKey } from './locales.ts'
import { EARLY_SKIN_GLOBAL, type EarlySkinPayload } from '../skins-contract.ts'
import { detectTheme, playSplash, type SplashSkin } from './runtime/splash.ts'
import { markSessionPlayed, prefs, resetPrefs, sessionPlayed, type BootAnimationPrefs } from './runtime/prefs.ts'

/** Locale namespace owned by this plugin. */
export const NS = 'bootAnimation'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Startup-animation settings copy. */
    bootAnimation: BootAnimationKey
  }
}

/** Required services: the slot registry and the locale dictionary service. */
export const inject = ['slots', 'locale']

/** Settings-page id (the nav cell key; a fresh id adds beside the shipped pages). */
const SECTION_ID = 'boot-animation'

/** Nav position: after the shipped pages and the skin center's own section. */
const SECTION_ORDER = 130

/**
 * Read one dictionary string, tolerating a locale service that is not ready.
 * @param ctx - client root context.
 * @param key - dictionary key.
 * @returns the active-locale string, or undefined when the seat is unavailable.
 */
function text(ctx: ClientContext, key: BootAnimationKey): string | undefined {
  try {
    return ctx.locale.bind(NS)(key)
  } catch {
    return undefined
  }
}

/**
 * The launch skin the Host injected into this page, if any.
 *
 * Read synchronously from the served global: the video is already playing by the
 * time this half runs, and waiting for the catalog request would mean either
 * restarting it or showing a second curtain.
 * @returns the injected skin, or null when this page has no curtain to play.
 */
export function readInjectedSkin(): SplashSkin | null {
  const payload = (globalThis as unknown as Record<string, unknown>)[EARLY_SKIN_GLOBAL]
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as EarlySkinPayload & Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.videoUrl !== 'string') return null
  return {
    id: record.id,
    videoUrl: record.videoUrl,
    posterUrl: typeof record.posterUrl === 'string' ? record.posterUrl : null,
    durationMs: typeof record.durationMs === 'number' ? record.durationMs : null,
  }
}

/**
 * Play one curtain run.
 * @param ctx - client root context (for the curtain's own hint copy).
 * @param options - the preference set to project onto the curtain.
 * @param skin - the launch skin to play.
 * @param waitForApp - hold until the shell has painted (boot only).
 * @returns the curtain's disposer.
 */
function play(ctx: ClientContext, options: BootAnimationPrefs, skin: SplashSkin, waitForApp: boolean): () => void {
  const skip = options.skipOnClick
  return playSplash({
    skin,
    skipOnClick: skip,
    waitForApp,
    theme: detectTheme(),
    hint: skip ? text(ctx, 'skip') : undefined,
    waiting: text(ctx, 'waiting'),
  })
}

/**
 * Register the dictionaries, boot the curtain and publish the settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'ui-web-start-ui: dictionaries')

  // The launch curtain. This effect runs while the boot graph is applying the
  // browser halves - i.e. before the shell's first frame - which is the whole
  // point: the curtain covers a cold page rather than appearing over a warm one.
  ctx.effect(() => {
    const skin = readInjectedSkin()
    if (skin === null) return () => {}
    const options = prefs()
    if (!options.enabled) return () => {}
    if (options.frequency === 'session' && sessionPlayed()) return () => {}
    // Marked at PLAY time, not at finish: a reload that interrupts the curtain
    // must not replay it for the session policy.
    markSessionPlayed()
    return play(ctx, options, skin, true)
  }, 'ui-web-start-ui: launch curtain')

  const injected = (): BootAnimationInjected => ({
    preview: (skin: SplashSkin) => {
      // A preview is not a boot: it never touches the session marker, and it lifts
      // on the video's own end rather than waiting for a first paint.
      play(ctx, prefs(), skin, false)
    },
    reset: () => {
      resetPrefs()
    },
  })

  ctx.slots.inject('settings.section', () => {
    try {
      return ctx.slots.register({
        name: 'settings.section',
        id: SECTION_ID,
        order: SECTION_ORDER,
        label: () => text(ctx, 'title') ?? 'Startup animation',
        locale: NS,
        inject: injected,
      }, BootAnimationCard)
    } catch {
      return () => {}
    }
  })
}
