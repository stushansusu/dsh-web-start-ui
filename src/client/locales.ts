/**
 * Startup-animation copy. Both languages are first-class: the settings card and
 * the curtain's own hint text read the same dictionary through the standard t
 * seat (namespace bootAnimation).
 */

/** Copy keys owned by this plugin. */
export type BootAnimationKey =
  | 'title'
  | 'lede'
  | 'enabled'
  | 'enabledHint'
  | 'skinSection'
  | 'skinSectionHint'
  | 'skinNone'
  | 'skinNoneHint'
  | 'skinBuiltin'
  | 'skinCustom'
  | 'skinAdd'
  | 'skinAddHint'
  | 'skinUploading'
  | 'skinUploaded'
  | 'skinUploadFailed'
  | 'skinDelete'
  | 'skinDeleted'
  | 'skinSpec'
  | 'skinSelectFailed'
  | 'skinLoading'
  | 'skinPreviewUnavailable'
  | 'frequency'
  | 'frequencySession'
  | 'frequencySessionHint'
  | 'frequencyAlways'
  | 'frequencyAlwaysHint'
  | 'skip'
  | 'skipHint'
  | 'preview'
  | 'previewHint'
  | 'reset'
  | 'note'
  | 'waiting'

/** Simplified Chinese dictionary. */
export const zh: Record<BootAnimationKey, string> = {
  "title": "启动动画",
  "lede": "打开 DSH 时先播一段启动视频，等界面画好再落帘。",
  "enabled": "启用启动动画",
  "enabledHint": "关闭后每次打开都直接进界面。",
  "skinSection": "启动皮肤",
  "skinSectionHint": "选一段视频当作开场动画。没选皮肤就不播 —— 本插件只播视频。",
  "skinNone": "不用皮肤",
  "skinNoneHint": "不播开场动画",
  "skinBuiltin": "内置",
  "skinCustom": "自定义",
  "skinAdd": "添加自定义皮肤",
  "skinAddHint": "选择视频文件（mp4 / webm / mov，≤ 256 MB），上传后立即出现在上面，选中即生效。",
  "skinUploading": "上传中",
  "skinUploaded": "已添加：",
  "skinUploadFailed": "上传失败：",
  "skinDelete": "删除",
  "skinDeleted": "已删除：",
  "skinSpec": "规格建议：H.264 mp4（HEVC 需浏览器硬件解码支持）、1920×1080、无音轨 —— 视频每次开机都要下/播，越大开机越慢。",
  "skinSelectFailed": "切换皮肤失败：",
  "skinLoading": "正在读取皮肤列表…",
  "skinPreviewUnavailable": "先选一个皮肤才能预览",
  "frequency": "播放频率",
  "frequencySession": "每个会话一次",
  "frequencySessionHint": "同一个浏览器窗口只在首次打开时播放。",
  "frequencyAlways": "每次刷新",
  "frequencyAlwaysHint": "每次打开或刷新都播放。",
  "skip": "点击任意处跳过",
  "skipHint": "按 Esc 也可以立刻落帘。",
  "preview": "预览动画",
  "previewHint": "立刻在本页播放一次（用当前选中的皮肤）。",
  "reset": "恢复默认",
  "note": "播放设置存在浏览器本地；选中的启动皮肤是宿主状态，同一套安装的所有浏览器共用。",
  "waiting": "正在启动…"
}

/** English dictionary. */
export const en: Record<BootAnimationKey, string> = {
  "title": "Startup animation",
  "lede": "Play a launch video when DSH opens, and lift it once the shell has painted.",
  "enabled": "Enable the startup animation",
  "enabledHint": "Turn it off to go straight to the interface.",
  "skinSection": "Launch skin",
  "skinSectionHint": "Pick the video that opens DSH. With no skin selected nothing plays - this plugin plays video, or nothing.",
  "skinNone": "No skin",
  "skinNoneHint": "Play no launch animation",
  "skinBuiltin": "Built-in",
  "skinCustom": "Custom",
  "skinAdd": "Add a custom skin",
  "skinAddHint": "Pick a video (mp4 / webm / mov, up to 256 MB); it appears above as soon as it lands, and takes effect when selected.",
  "skinUploading": "Uploading",
  "skinUploaded": "Added: ",
  "skinUploadFailed": "Upload failed: ",
  "skinDelete": "Delete",
  "skinDeleted": "Deleted: ",
  "skinSpec": "Suggested: H.264 mp4 (HEVC needs hardware decoding in the browser), 1920x1080, no audio - the file is fetched and played on every boot, so a heavy one slows startup.",
  "skinSelectFailed": "Could not switch skin: ",
  "skinLoading": "Reading the skin list…",
  "skinPreviewUnavailable": "Select a skin first",
  "frequency": "Replay",
  "frequencySession": "Once per session",
  "frequencySessionHint": "Only the first load in a given browser window.",
  "frequencyAlways": "Every load",
  "frequencyAlwaysHint": "Every open and every refresh.",
  "skip": "Click anywhere to skip",
  "skipHint": "Escape lifts the curtain too.",
  "preview": "Preview",
  "previewHint": "Play it once now, with the selected skin.",
  "reset": "Reset to defaults",
  "note": "Playback preferences live in this browser. The selected launch skin is host state, shared by every browser on this install.",
  "waiting": "Starting…"
}
