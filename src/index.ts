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
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the webserver's `webserver/index-inject` event merge.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { EARLY_SKIN_GLOBAL, type EarlySkinPayload } from './skins-contract.ts'
import { bootAnimationRoute } from './host/routes.ts'
import { findSkin, resolveActiveSkinId } from './host/skins.ts'

/** Backdrop gradients, mirrored from the browser half's stylesheet. */
const DARK_BACKDROP = 'radial-gradient(120% 82% at 50% 46%,#0c1526 0%,#070c17 55%,#04070d 100%)'
const LIGHT_BACKDROP = 'radial-gradient(120% 82% at 50% 46%,#ffffff 0%,#eef2fa 46%,#e2e8f5 100%)'

/**
 * The served early-curtain body.
 *
 * Runs in the document head before any module: reads the stored preferences (a
 * disabled curtain or an already-played session paints nothing), builds the
 * layer with inline styles, starts the selected video when the Host injected one,
 * and publishes the handoff hooks the browser half takes over from.
 * @param darkBackdrop - CSS background for the dark theme.
 * @param lightBackdrop - CSS background for the light theme.
 * @param skinGlobal - global name carrying the selected skin payload.
 */
function earlyCurtainBody(darkBackdrop: string, lightBackdrop: string, skinGlobal: string): void {
  try {
    const P = 'dsh:boot-animation:v1'
    const S = 'dsh:boot-animation:played'
    const T = 'dsh:boot-animation:theme'
    const raw = window.localStorage.getItem(P)
    const prefs = raw ? JSON.parse(raw) : {}
    if (prefs.enabled === false) return
    if (prefs.frequency !== 'always' && window.sessionStorage.getItem(S) === '1') return
    let theme = window.localStorage.getItem(T)
    if (theme !== 'dark' && theme !== 'light') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    // No skin, no curtain: this plugin plays a video or nothing at all, so an
    // unselected install boots with no backdrop to explain and none to remove.
    const skin = (globalThis as unknown as Record<string, EarlySkinPayload | null | undefined>)[skinGlobal]
    if (!skin || !skin.videoUrl) return
    const layer = document.createElement('div')
    layer.setAttribute('data-dsh-boot-curtain', 'early')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147482990;pointer-events:none;background:'
      + (theme === 'dark' ? darkBackdrop : lightBackdrop) + ';'
    {
      const video = document.createElement('video')
      video.muted = true
      video.defaultMuted = true
      video.autoplay = true
      video.setAttribute('muted', '')
      video.setAttribute('playsinline', '')
      video.setAttribute('preload', 'auto')
      if (skin.posterUrl) video.poster = skin.posterUrl
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
      layer.appendChild(video)
      ;(window as unknown as Record<string, unknown>).__DSH_BOOT_CURTAIN_VIDEO__ = video
      video.src = skin.videoUrl
      const kick = (): void => {
        const started = video.play()
        if (started && started.catch) started.catch(() => {})
      }
      kick()
      video.addEventListener('loadeddata', kick, { once: true })
    }
    document.documentElement.appendChild(layer)
    let gone = false
    const drop = (): void => {
      if (gone) return
      gone = true
      if (layer.parentNode) layer.parentNode.removeChild(layer)
    }
    ;(window as unknown as Record<string, unknown>).__DSH_BOOT_CURTAIN_DROP__ = drop
    window.setTimeout(drop, 15000)
  } catch {
    // A curtain is never worth breaking boot over: the document loads regardless.
  }
}

/** Serialize the early curtain into one inline script, with its inputs bound. */
export function earlyCurtainScript(): string {
  return '(' + earlyCurtainBody.toString() + ')('
    + JSON.stringify(DARK_BACKDROP) + ','
    + JSON.stringify(LIGHT_BACKDROP) + ','
    + JSON.stringify(EARLY_SKIN_GLOBAL) + ')'
}

/** Payload the early script and the browser half read, or null without a skin. */
export function earlySkinPayload(): EarlySkinPayload | null {
  const active = resolveActiveSkinId()
  if (active === null) return null
  const found = findSkin(active)
  if (found === undefined) return null
  return {
    id: found.view.id,
    videoUrl: found.view.videoUrl,
    posterUrl: found.view.posterUrl,
    durationMs: found.view.durationMs,
  }
}

/**
 * Contribute the early curtain (and install the routes) on every index render.
 * @param ctx - host root context.
 */
export function apply(ctx: Context): void {
  let disposeRoutes: (() => void) | undefined
  const installRoutes = (): void => {
    if (disposeRoutes !== undefined) return
    const webServer = ctx.get('webServer')
    if (webServer === undefined) return
    const unregister = webServer.register(bootAnimationRoute())
    disposeRoutes = () => {
      unregister()
      disposeRoutes = undefined
    }
    ctx.effect(() => () => { disposeRoutes?.() }, 'ui-web-start-ui: routes')
  }

  // Three triggers, all idempotent, because the webserver's activation order is not
  // this plugin's to assume: (a) right now, when the service is already there; (b) the
  // moment cordis provides it, if it is not; (c) the first index render, as a last
  // resort. The API must answer before any page has loaded - a stale cached index, or
  // a probe, would otherwise see 404s and a curtain whose video cannot be fetched.
  installRoutes()
  ctx.effect(() => ctx.on('internal/service', (name) => {
    if (name === 'webServer') installRoutes()
  }), 'ui-web-start-ui: routes when the webserver appears')
  ctx.effect(() => ctx.on('webserver/index-inject', (table) => {
    installRoutes()
    table.push({ kind: 'global', name: EARLY_SKIN_GLOBAL, value: earlySkinPayload() })
    table.push({ kind: 'script', placement: 'head', text: earlyCurtainScript() })
  }), 'ui-web-start-ui: early curtain row')
}
