/**
 * The launch curtain: one video, played full screen before the shell exists.
 *
 * There is no style engine here on purpose. A launch animation is video - that was
 * the whole point of the skin model - so the curtain has exactly one medium, one
 * lifecycle, and one handoff:
 *
 *  1. The Host's inline script (src/index.ts) has usually created the video
 *     element, set its src and called play() before this module even loads.
 *     Restarting playback here would visibly jump, so THIS HALF ADOPTS THAT
 *     ELEMENT: the same node moves into the curtain, keeping its buffer and its
 *     currentTime.
 *  2. The curtain lifts when the video ENDS - not on a timer - and only after the
 *     shell has painted (bounded by the hold cap), so a slow boot never reveals a
 *     half-drawn interface and a short video never outlines a long boot.
 *  3. A stalled or unplayable video lifts on its own safety timer: a skin the
 *     browser cannot decode must never become a wall in front of the GUI.
 */
import css from './splash.module.css'
import { rememberTheme } from './prefs.ts'

/** Colour scheme the curtain paints its letterbox backdrop in. */
export type SplashTheme = 'light' | 'dark'

/** One launch skin, as the curtain needs it. */
export interface SplashSkin {
  /** Skin id (also stamped on the layer for diagnostics). */
  id: string
  /** Same-origin video URL. */
  videoUrl: string
  /** Same-origin poster URL, when the skin ships one. */
  posterUrl: string | null
  /** Author-declared length in milliseconds, when the manifest records one. */
  durationMs: number | null
}

/** One curtain run. */
export interface SplashOptions {
  /** The skin to play. A curtain without a skin is not a curtain. */
  skin: SplashSkin
  /** Let a click or Escape lift the curtain early (default true). */
  skipOnClick?: boolean
  /** Footnote shown under the curtain while skipping is available. */
  hint?: string
  /** Footnote text while the curtain waits for the shell's first paint. */
  waiting?: string
  /** Force a colour scheme; detected from the shell theme when omitted. */
  theme?: SplashTheme
  /** Hold the curtain until the shell has painted (bounded by the hold cap). */
  waitForApp?: boolean
  /** Called once when the curtain is gone, however it ended. */
  onFinish?: () => void
}

/** Attribute stamped on the curtain element (probing and CSS scoping). */
export const CURTAIN_ATTRIBUTE = 'data-dsh-boot-animation'

/** Outro length: the fade the curtain always ends with. */
const OUTRO_MS = 460

/** Outro used when the user skips: a quick lift, not a slow fade. */
const SKIP_MS = 220

/** How long the curtain may hold after the video, waiting for a first paint. */
const HOLD_CAP_MS = 2800

/** How long playback may take to START before the curtain gives up on it. */
const VIDEO_START_GRACE_MS = 6000

/** Extra slack past a known length before the curtain assumes the video stalled. */
const VIDEO_END_GRACE_MS = 8000

/** Safety budget when neither the element nor the manifest knows a length. */
const VIDEO_UNKNOWN_MS = 60000

/** Detect the shell's colour scheme from the theme attributes. */
export function detectTheme(): SplashTheme {
  const body = document.body
  const html = document.documentElement
  const dark = body?.hasAttribute('data-ds-dark-theme') === true
    || html?.hasAttribute('data-ds-dark-theme') === true
    || body?.getAttribute('data-dsh-theme') === 'dark'
  return dark ? 'dark' : 'light'
}

/** True once the shell has painted something into the app root. */
export function appHasPainted(): boolean {
  const root = document.getElementById('root')
  if (root !== null && root.childElementCount > 0) return true
  return document.querySelector('[data-slot]') !== null
}

/** Escape text that came from a dictionary before it enters markup. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Build the curtain's markup: the video stage plus the optional footnote. */
function curtainMarkup(hint: string | undefined): string {
  const parts: string[] = []
  parts.push(stageMarkup())
  if (hint !== undefined && hint.length > 0) {
    parts.push(hintMarkup(escapeText(hint)))
  }
  return parts.join('')
}

/** The video stage element as markup. */
function stageMarkup(): string {
  return '<div class="' + css.videoStage + '"></div>'
}

/** The skip footnote as markup. */
function hintMarkup(text: string): string {
  return '<p class="' + css.hint + '">' + text + '</p>'
}

/**
 * Remove the Host's early backdrop once this curtain is up. The outro fades to
 * transparent, so a leftover backdrop would reappear as the GUI came back; the
 * video (if any) is adopted out of it before this runs.
 */
function dropEarlyCurtain(): void {
  const host = window as unknown as { __DSH_BOOT_CURTAIN_DROP__?: () => void }
  const drop = host.__DSH_BOOT_CURTAIN_DROP__
  if (typeof drop !== 'function') return
  host.__DSH_BOOT_CURTAIN_DROP__ = undefined
  try {
    drop()
  } catch {
    // A stale early layer is never worth breaking the curtain over.
  }
}

/**
 * Take the Host's already-playing video element if it is playing this very skin.
 *
 * Adoption is the whole point of the early backdrop: the element has a populated
 * buffer and a nonzero currentTime, and rebuilding it would restart the animation
 * the user is already watching.
 * @param skin - the skin the curtain wants.
 * @returns the adopted element, or undefined when this page has none.
 */
function adoptEarlyVideo(skin: SplashSkin): HTMLVideoElement | undefined {
  const host = window as unknown as { __DSH_BOOT_CURTAIN_VIDEO__?: HTMLVideoElement }
  const video = host.__DSH_BOOT_CURTAIN_VIDEO__
  if (video === undefined) return undefined
  const source = video.currentSrc !== '' ? video.currentSrc : video.src
  if (source !== '' && source.endsWith(skin.videoUrl) === false && skin.videoUrl.endsWith(source) === false) return undefined
  host.__DSH_BOOT_CURTAIN_VIDEO__ = undefined
  return video
}

/** Build a fresh video element for a skin. */
function createVideo(skin: SplashSkin): HTMLVideoElement {
  const video = document.createElement('video')
  video.muted = true
  video.defaultMuted = true
  video.autoplay = true
  video.setAttribute('muted', '')
  video.setAttribute('playsinline', '')
  video.setAttribute('preload', 'auto')
  video.setAttribute('aria-hidden', 'true')
  if (skin.posterUrl !== null) video.poster = skin.posterUrl
  video.src = skin.videoUrl
  return video
}
let activeCancel: (() => void) | null = null

/**
 * Play the curtain on top of the whole page.
 * @param options - the curtain run (see {@link SplashOptions}).
 * @returns a disposer that lifts the curtain immediately; safe to call twice.
 */
export function playSplash(options: SplashOptions): () => void {
  if (typeof document === 'undefined') return () => {}
  activeCancel?.()
  const theme = options.theme ?? detectTheme()
  const skin = options.skin
  const layer = document.createElement('div')
  layer.className = css.curtain
  layer.setAttribute(CURTAIN_ATTRIBUTE, skin.id)
  layer.setAttribute('data-skin', skin.id)
  layer.setAttribute('data-theme', theme)
  layer.setAttribute('role', 'presentation')
  layer.style.setProperty('--dsh-boot-outro', OUTRO_MS + 'ms')
  layer.innerHTML = curtainMarkup(options.hint)
  document.body.appendChild(layer)

  const video = adoptEarlyVideo(skin) ?? createVideo(skin)
  video.className = css.video
  const stage = layer.querySelector('.' + css.videoStage)
  if (stage !== null) stage.appendChild(video)

  // The early backdrop must go now, not at the outro: this curtain covers it (the
  // adopted video has already been moved out of it), and the theme it paints in is
  // what the next boot's early backdrop uses.
  dropEarlyCurtain()
  rememberTheme(theme)

  const themeObserver = new MutationObserver(() => {
    layer.setAttribute('data-theme', options.theme ?? detectTheme())
  })
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'data-dsh-theme'] })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'data-dsh-theme'] })

  const hintElement = layer.querySelector('.' + css.hint) as HTMLElement | null
  let finished = false
  let outroStarted = false
  let raf = 0
  let safetyTimer = 0
  const skip = options.skipOnClick !== false

  const clear = (): void => {
    cancelAnimationFrame(raf)
    window.clearTimeout(safetyTimer)
    themeObserver.disconnect()
    video.removeEventListener('ended', onVideoEnded)
    video.removeEventListener('error', onVideoStalled)
    video.removeEventListener('loadedmetadata', armSafety)
    layer.removeEventListener('pointerdown', onSkip)
    window.removeEventListener('keydown', onKey)
    layer.remove()
  }

  const finish = (): void => {
    if (finished) return
    finished = true
    clear()
    if (activeCancel === cancel) activeCancel = null
    options.onFinish?.()
  }

  const beginOutro = (outroMs: number): void => {
    if (outroStarted || finished) return
    outroStarted = true
    window.clearTimeout(safetyTimer)
    video.pause()
    layer.classList.remove(css.holding)
    layer.style.setProperty('--dsh-boot-outro', outroMs + 'ms')
    layer.classList.add(css.outro)
    window.setTimeout(finish, outroMs + 40)
  }

  const onSkip = (): void => beginOutro(SKIP_MS)
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') beginOutro(SKIP_MS)
  }
  if (skip) {
    layer.addEventListener('pointerdown', onSkip)
    window.addEventListener('keydown', onKey)
  }

  const waitForApp = options.waitForApp === true
  const holdUntilPainted = (): void => {
    // The last video frame stays on screen while the shell finishes; the cap keeps
    // a shell that never paints from turning the curtain into a wall.
    layer.classList.add(css.holding)
    if (hintElement !== null && options.waiting !== undefined) hintElement.textContent = options.waiting
    const deadline = performance.now() + HOLD_CAP_MS
    const poll = (): void => {
      if (finished || outroStarted) return
      if (appHasPainted() || performance.now() >= deadline) {
        beginOutro(OUTRO_MS)
        return
      }
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
  }

  const onVideoEnded = (): void => {
    if (waitForApp && appHasPainted() === false) holdUntilPainted()
    else beginOutro(OUTRO_MS)
  }

  const onVideoStalled = (): void => {
    // An unplayable skin must not hold the GUI hostage: lift and move on.
    beginOutro(OUTRO_MS)
  }

  /**
   * Arm the stall backstop from the best length available: the element's own
   * metadata first, then the manifest's declared length, then a long fallback.
   * Re-armed on loadedmetadata, when the real duration becomes known.
   */
  function armSafety(): void {
    if (finished || outroStarted) return
    window.clearTimeout(safetyTimer)
    const measured = Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : null
    const budget = measured ?? skin.durationMs ?? VIDEO_UNKNOWN_MS
    safetyTimer = window.setTimeout(() => {
      if (finished || outroStarted) return
      if (video.ended) onVideoEnded()
      else if (video.paused || video.currentTime === 0) onVideoStalled()
      else armSafety()
    }, budget + VIDEO_END_GRACE_MS)
  }

  video.addEventListener('ended', onVideoEnded)
  video.addEventListener('error', onVideoStalled)
  video.addEventListener('loadedmetadata', armSafety)
  armSafety()
  window.setTimeout(() => {
    // Playback must at least START: a video that never produces a frame is dead
    // weight in front of the GUI.
    if (finished || outroStarted) return
    if (video.currentTime === 0 && (video.paused || video.readyState < 2)) onVideoStalled()
  }, VIDEO_START_GRACE_MS)
  const started = video.play()
  if (started && typeof started.catch === 'function') started.catch(() => {})
  // Already past its end (a very short skin adopted late) ends immediately.
  if (video.ended) onVideoEnded()

  function cancel(): void {
    if (finished) return
    finished = true
    clear()
    if (activeCancel === cancel) activeCancel = null
    options.onFinish?.()
  }
  activeCancel = cancel
  return cancel
}
