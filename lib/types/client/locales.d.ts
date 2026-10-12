/**
 * Startup-animation copy. Both languages are first-class: the settings card and
 * the curtain's own hint text read the same dictionary through the standard t
 * seat (namespace bootAnimation).
 */
/** Copy keys owned by this plugin. */
export type BootAnimationKey = 'title' | 'lede' | 'enabled' | 'enabledHint' | 'skinSection' | 'skinSectionHint' | 'skinNone' | 'skinNoneHint' | 'skinBuiltin' | 'skinCustom' | 'skinAdd' | 'skinAddHint' | 'skinUploading' | 'skinUploaded' | 'skinUploadFailed' | 'skinDelete' | 'skinDeleted' | 'skinSpec' | 'skinSelectFailed' | 'skinLoading' | 'skinPreviewUnavailable' | 'frequency' | 'frequencySession' | 'frequencySessionHint' | 'frequencyAlways' | 'frequencyAlwaysHint' | 'skip' | 'skipHint' | 'preview' | 'previewHint' | 'reset' | 'note' | 'waiting';
/** Simplified Chinese dictionary. */
export declare const zh: Record<BootAnimationKey, string>;
/** English dictionary. */
export declare const en: Record<BootAnimationKey, string>;
