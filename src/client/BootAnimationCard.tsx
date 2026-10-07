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
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { prefs, subscribePrefs, updatePrefs } from './runtime/prefs.ts'
import type { SplashSkin } from './runtime/splash.ts'
import type { LaunchSkinCatalog, LaunchSkinView } from '../skins-contract.ts'
import { deleteSkin, durationLabel, fetchCatalog, setActiveSkin, uploadSkin } from './runtime/skins.ts'
import css from './boot-animation.module.css'

/** Business face the plugin's apply() injects into the card. */
export interface BootAnimationInjected {
  /** Play the curtain immediately with the given skin. */
  preview(skin: SplashSkin): void
  /** Drop the stored playback preferences and return to the defaults. */
  reset(): void
}

/** Plugin-card props: locale seat + injected face. */
export type BootAnimationCardProps = PropsLocale<'bootAnimation'> & BootAnimationInjected

/** Join class names, dropping the falsey ones. */
function cx(...names: (string | false | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name.length > 0).join(' ')
}

/**
 * Pick the language a skin's display name should be shown in.
 *
 * The locale service hands out a namespace-bound translate, not the active tag, so
 * the decision rides a string this plugin owns: the built-in badge is Chinese in zh
 * and Latin in en.
 */
function prefersChinese(sample: string): boolean {
  return /[\u4e00-\u9fff]/.test(sample)
}

/** Present one skin as the curtain wants it. */
function toSplashSkin(skin: LaunchSkinView): SplashSkin {
  return {
    id: skin.id,
    videoUrl: skin.videoUrl,
    posterUrl: skin.posterUrl,
    durationMs: skin.durationMs,
  }
}

/**
 * Render the startup-animation settings page.
 * @param props - locale seat plus the injected preview/reset faces.
 * @returns the settings page.
 */
export function BootAnimationCard({ t, preview, reset }: BootAnimationCardProps): ReactNode {
  const current = useSyncExternalStore(subscribePrefs, prefs)
  const [catalog, setCatalog] = useState<LaunchSkinCatalog | null>(null)
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)
  const [uploading, setUploading] = useState<{ name: string; fraction: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const chinese = prefersChinese(t('skinBuiltin'))

  useEffect(() => {
    let alive = true
    void fetchCatalog().then((result) => {
      if (!alive) return
      if (result.ok) setCatalog(result.catalog)
      else setMessage({ text: t('skinSelectFailed') + result.error, bad: true })
    })
    return () => { alive = false }
  }, [])

  const activeSkin = catalog?.skins.find((skin) => skin.id === catalog.active) ?? null

  const choose = async (id: string | null): Promise<void> => {
    setBusy(true)
    const result = await setActiveSkin(id)
    setBusy(false)
    if (result.ok) {
      setCatalog(result.catalog)
      setMessage(null)
      return
    }
    setMessage({ text: t('skinSelectFailed') + result.error, bad: true })
  }

  const onPickFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setMessage(null)
    setUploading({ name: file.name, fraction: 0 })
    const result = await uploadSkin(file, (fraction) => { setUploading({ name: file.name, fraction }) })
    setUploading(null)
    if (!result.ok) {
      setMessage({ text: t('skinUploadFailed') + result.error, bad: true })
      return
    }
    setCatalog(result.catalog)
    const added = result.catalog.skins[result.catalog.skins.length - 1]
    setMessage({
      text: t('skinUploaded') + (added === undefined ? file.name : added.name[chinese ? 'zh' : 'en']),
      bad: false,
    })
    if (added !== undefined) await choose(added.id)
  }

  const remove = async (skin: LaunchSkinView): Promise<void> => {
    setBusy(true)
    const result = await deleteSkin(skin.id)
    setBusy(false)
    if (!result.ok) {
      setMessage({ text: t('skinUploadFailed') + result.error, bad: true })
      return
    }
    setCatalog(result.catalog)
    setMessage({ text: t('skinDeleted') + skin.name[chinese ? 'zh' : 'en'], bad: false })
  }

  const canPreview = activeSkin !== null
  return (
    <div className={css.section}>
      <p className={css.lede}>{t('lede')}</p>

      <div className={cx(css.card, !current.enabled && css.cardIdle)}>
        <div className={css.row}>
          <span className={css.rowText}>
            <span className={css.rowTitle}>{t('enabled')}</span>
            <span className={css.rowHint}>{t('enabledHint')}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={current.enabled}
            aria-label={t('enabled')}
            className={cx(css.switch, current.enabled && css.switchOn)}
            onClick={() => { updatePrefs({ enabled: !current.enabled }) }}
          >
            <i className={css.knob} />
          </button>
        </div>

        <div className={css.divider} />

        <div className={css.group} aria-disabled={!current.enabled}>
          <span className={css.groupLabel}>{t('skinSection')}</span>
          <span className={css.groupHint}>{t('skinSectionHint')}</span>
          {catalog === null ? (
            <span className={css.groupHint}>{t('skinLoading')}</span>
          ) : (
            <div className={css.skins}>
              <button
                type="button"
                className={cx(css.skinTile, catalog.active === null && css.skinTileActive)}
                aria-pressed={catalog.active === null}
                disabled={busy}
                onClick={() => { void choose(null) }}
              >
                <i className={cx(css.skinThumb, css.skinThumbNone)} />
                <span className={css.skinName}>{t('skinNone')}</span>
                <span className={css.skinHint}>{t('skinNoneHint')}</span>
              </button>
              {catalog.skins.map((skin) => (
                <div key={skin.id} className={cx(css.skinTile, catalog.active === skin.id && css.skinTileActive)}>
                  <button
                    type="button"
                    className={css.skinPick}
                    aria-pressed={catalog.active === skin.id}
                    disabled={busy}
                    onClick={() => { void choose(skin.id) }}
                  >
                    {skin.posterUrl === null
                      ? <i className={cx(css.skinThumb, css.skinThumbVideo)} />
                      : <img className={css.skinThumb} src={skin.posterUrl} alt="" />}
                    <span className={css.skinName}>{skin.name[chinese ? 'zh' : 'en']}</span>
                    <span className={css.skinHint}>
                      {t(skin.source === 'custom' ? 'skinCustom' : 'skinBuiltin')}
                      {durationLabel(skin.durationMs) === null ? '' : ' · ' + durationLabel(skin.durationMs) + 's'}
                    </span>
                  </button>
                  {skin.source === 'custom' ? (
                    <button
                      type="button"
                      className={css.skinDelete}
                      disabled={busy}
                      onClick={() => { void remove(skin) }}
                    >{t('skinDelete')}</button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <div className={css.upload}>
            <label className={css.uploadLabel}>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={uploading !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  void onPickFile(file)
                }}
              />
              <span>{t('skinAdd')}</span>
            </label>
            <span className={css.groupHint}>{t('skinAddHint')}</span>
          </div>
          {uploading === null ? null : (
            <div className={css.progress}>
              <i className={css.progressBar} style={{ width: Math.round(uploading.fraction * 100) + '%' }} />
            </div>
          )}
          {uploading === null ? null : (
            <span className={css.groupHint}>{t('skinUploading') + ' ' + Math.round(uploading.fraction * 100) + '% · ' + uploading.name}</span>
          )}
          {message === null ? null : (
            <span className={cx(css.message, message.bad && css.messageBad)}>{message.text}</span>
          )}
          <span className={css.groupHint}>{t('skinSpec')}</span>
        </div>

        <div className={css.divider} />

        <div className={css.group} aria-disabled={!current.enabled}>
          <span className={css.groupLabel}>{t('frequency')}</span>
          <div className={css.segment}>
            <button
              type="button"
              className={cx(css.segItem, current.frequency === 'session' && css.segActive)}
              aria-pressed={current.frequency === 'session'}
              onClick={() => { updatePrefs({ frequency: 'session' }) }}
            >{t('frequencySession')}</button>
            <button
              type="button"
              className={cx(css.segItem, current.frequency === 'always' && css.segActive)}
              aria-pressed={current.frequency === 'always'}
              onClick={() => { updatePrefs({ frequency: 'always' }) }}
            >{t('frequencyAlways')}</button>
          </div>
          <span className={css.groupHint}>
            {current.frequency === 'session' ? t('frequencySessionHint') : t('frequencyAlwaysHint')}
          </span>
        </div>

        <div className={css.group}>
          <label className={css.check}>
            <input
              type="checkbox"
              checked={current.skipOnClick}
              onChange={() => { updatePrefs({ skipOnClick: !current.skipOnClick }) }}
            />
            <span>{t('skip')}</span>
          </label>
          <span className={css.groupHint}>{t('skipHint')}</span>
        </div>

        <div className={css.actions}>
          <button
            type="button"
            className={css.preview}
            disabled={!canPreview}
            onClick={() => { if (activeSkin !== null) preview(toSplashSkin(activeSkin)) }}
          >{t('preview')}</button>
          <button type="button" className={css.ghost} onClick={reset}>{t('reset')}</button>
          <span className={css.groupHint}>{canPreview ? t('previewHint') : t('skinPreviewUnavailable')}</span>
        </div>

        <p className={css.note}>{t('note')}</p>
      </div>
    </div>
  )
}
