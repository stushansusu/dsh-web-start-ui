window.__ModuleLoader__.load({
	id: "@linxin666/dsh-web-start-ui",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/runtime/prefs.ts
		/** localStorage key holding the JSON preference set. */
		const PREFS_STORAGE_KEY = "dsh:boot-animation:v1";
		/**
		* localStorage key holding the theme the last curtain painted itself in.
		*
		* The Host's early backdrop (src/index.ts) runs before the shell publishes its
		* theme attribute, so it cannot detect the theme itself; it reads this value and
		* falls back to the OS colour scheme on the very first boot.
		*/
		const THEME_STORAGE_KEY = "dsh:boot-animation:theme";
		/** sessionStorage key marking that this browser session already played the curtain. */
		const SESSION_PLAYED_KEY = "dsh:boot-animation:played";
		/** What a fresh install (or unreadable storage) plays. */
		const DEFAULT_PREFS = {
			enabled: true,
			frequency: "session",
			skipOnClick: true
		};
		/** Narrow an unknown value to a known replay policy. */
		function frequencyOf(value) {
			return value === "always" || value === "session" ? value : DEFAULT_PREFS.frequency;
		}
		/** Decode one stored payload, ignoring anything that is not an object. */
		function decode(raw) {
			if (typeof raw !== "string" || raw.length === 0) return { ...DEFAULT_PREFS };
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				return { ...DEFAULT_PREFS };
			}
			if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PREFS };
			const record = parsed;
			return {
				enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_PREFS.enabled,
				frequency: frequencyOf(record.frequency),
				skipOnClick: typeof record.skipOnClick === "boolean" ? record.skipOnClick : DEFAULT_PREFS.skipOnClick
			};
		}
		/** Read one web-storage area without letting a blocked store break boot. */
		function storage(kind) {
			try {
				return (kind === "local" ? window.localStorage : window.sessionStorage) ?? void 0;
			} catch {
				return;
			}
		}
		/** Read a stored string, tolerating a blocked or absent store. */
		function readStored(kind, key) {
			try {
				return storage(kind)?.getItem(key) ?? null;
			} catch {
				return null;
			}
		}
		/** Write a stored string, tolerating a blocked or absent store. */
		function writeStored(kind, key, value) {
			try {
				storage(kind)?.setItem(key, value);
			} catch {}
		}
		/** Load the effective preferences at module evaluation. */
		function load() {
			return decode(readStored("local", PREFS_STORAGE_KEY));
		}
		let current = load();
		const listeners = /* @__PURE__ */ new Set();
		/** Current preferences (stable reference until the next update). */
		function prefs() {
			return current;
		}
		/** Subscribe to preference changes; returns the unsubscribe. */
		function subscribePrefs(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
		function publish(next) {
			current = next;
			for (const listener of [...listeners]) listener();
			return current;
		}
		/** Persist the patch and notify subscribers. */
		function updatePrefs(patch) {
			const next = decode(JSON.stringify({
				...current,
				...patch
			}));
			writeStored("local", PREFS_STORAGE_KEY, JSON.stringify(next));
			return publish(next);
		}
		/** Drop the stored set and go back to the defaults. */
		function resetPrefs() {
			try {
				storage("local")?.removeItem(PREFS_STORAGE_KEY);
			} catch {}
			return publish({ ...DEFAULT_PREFS });
		}
		/** Record the theme the curtain painted in, for the next boot's early backdrop. */
		function rememberTheme(theme) {
			writeStored("local", THEME_STORAGE_KEY, theme);
		}
		/** True when this browser session already played the curtain. */
		function sessionPlayed() {
			return readStored("session", SESSION_PLAYED_KEY) === "1";
		}
		/** Mark this browser session as played. */
		function markSessionPlayed() {
			writeStored("session", SESSION_PLAYED_KEY, "1");
		}
		//#endregion
		//#region src/skins-contract.ts
		/** Route that lists built-in and custom skins plus the active id. */
		const SKINS_ROUTE = "/api/boot-animation/skins";
		/** Route that reads or writes the selected skin (POST { id }). */
		const ACTIVE_ROUTE = "/api/boot-animation/active";
		/** Video containers a custom skin may be uploaded as. */
		const CUSTOM_SKIN_EXTENSIONS = [
			".mp4",
			".webm",
			".mov"
		];
		/** Global the early backdrop script and the browser half both read. */
		const EARLY_SKIN_GLOBAL = "__DSH_BOOT_SKIN__";
		//#endregion
		//#region src/client/runtime/skins.ts
		/**
		* Browser-side face of the launch-skin catalog.
		*
		* The catalog itself lives on the host (built-in skins from the package, custom
		* ones from the Harness home, and the selected id), so the settings page talks to
		* the plugin's own routes. Uploads go through XMLHttpRequest rather than fetch,
		* because a video is the one request in this plugin worth showing progress for.
		*/
		/** Narrow one catalog payload from the wire. */
		function decodeCatalog(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const record = value;
			const active = typeof record.active === "string" ? record.active : null;
			if (!Array.isArray(record.skins)) return void 0;
			const skins = [];
			for (const entry of record.skins) {
				if (typeof entry !== "object" || entry === null) continue;
				const skin = entry;
				if (typeof skin.id !== "string" || typeof skin.videoUrl !== "string") continue;
				const name = typeof skin.name === "object" && skin.name !== null ? skin.name : {};
				const note = typeof skin.note === "object" && skin.note !== null ? skin.note : void 0;
				skins.push({
					id: skin.id,
					source: skin.source === "custom" ? "custom" : "builtin",
					kind: "video",
					name: {
						zh: typeof name.zh === "string" ? name.zh : skin.id,
						en: typeof name.en === "string" ? name.en : skin.id
					},
					...note === void 0 ? {} : { note: {
						zh: String(note.zh ?? ""),
						en: String(note.en ?? "")
					} },
					videoUrl: skin.videoUrl,
					posterUrl: typeof skin.posterUrl === "string" ? skin.posterUrl : null,
					durationMs: typeof skin.durationMs === "number" ? skin.durationMs : null
				});
			}
			return {
				active,
				skins
			};
		}
		/** Read the catalog. */
		async function fetchCatalog() {
			try {
				const response = await fetch(SKINS_ROUTE, { headers: { accept: "application/json" } });
				if (!response.ok) return {
					ok: false,
					error: "http-" + response.status
				};
				const catalog = decodeCatalog(await response.json());
				return catalog === void 0 ? {
					ok: false,
					error: "bad-payload"
				} : {
					ok: true,
					catalog
				};
			} catch (error) {
				return {
					ok: false,
					error: String(error)
				};
			}
		}
		/** Select one skin (null clears the selection back to the CSS styles). */
		async function setActiveSkin(id) {
			try {
				const response = await fetch(ACTIVE_ROUTE, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						accept: "application/json"
					},
					body: JSON.stringify({ id })
				});
				if (!response.ok) return {
					ok: false,
					error: "http-" + response.status
				};
				const catalog = decodeCatalog(await response.json());
				return catalog === void 0 ? {
					ok: false,
					error: "bad-payload"
				} : {
					ok: true,
					catalog
				};
			} catch (error) {
				return {
					ok: false,
					error: String(error)
				};
			}
		}
		/** Delete one custom skin. */
		async function deleteSkin(id) {
			try {
				const response = await fetch("/api/boot-animation/skins/" + encodeURIComponent(id), {
					method: "DELETE",
					headers: { accept: "application/json" }
				});
				if (!response.ok) return {
					ok: false,
					error: "http-" + response.status
				};
				const catalog = decodeCatalog((await response.json()).catalog);
				return catalog === void 0 ? {
					ok: false,
					error: "bad-payload"
				} : {
					ok: true,
					catalog
				};
			} catch (error) {
				return {
					ok: false,
					error: String(error)
				};
			}
		}
		/**
		* Upload one video as a new custom skin.
		* @param file - the picked file.
		* @param onProgress - called with a 0..1 fraction while the body is sent.
		* @returns the refreshed catalog, or the failure.
		*/
		function uploadSkin(file, onProgress) {
			return new Promise((resolve) => {
				const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
				if (!CUSTOM_SKIN_EXTENSIONS.includes(extension)) {
					resolve({
						ok: false,
						error: "unsupported-extension"
					});
					return;
				}
				const query = "?name=" + encodeURIComponent(file.name) + "&ext=" + encodeURIComponent(extension);
				const request = new XMLHttpRequest();
				request.open("POST", SKINS_ROUTE + query, true);
				request.setRequestHeader("content-type", file.type === "" ? "application/octet-stream" : file.type);
				request.upload.addEventListener("progress", (event) => {
					if (onProgress !== void 0 && event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
				});
				request.addEventListener("error", () => {
					resolve({
						ok: false,
						error: "network"
					});
				});
				request.addEventListener("abort", () => {
					resolve({
						ok: false,
						error: "aborted"
					});
				});
				request.addEventListener("load", () => {
					let payload;
					try {
						payload = JSON.parse(request.responseText);
					} catch {
						resolve({
							ok: false,
							error: "bad-payload"
						});
						return;
					}
					const record = typeof payload === "object" && payload !== null ? payload : {};
					const catalog = decodeCatalog(record.catalog);
					if (request.status >= 200 && request.status < 300 && catalog !== void 0) {
						resolve({
							ok: true,
							catalog
						});
						return;
					}
					resolve({
						ok: false,
						error: typeof record.error === "string" ? record.error : "http-" + request.status
					});
				});
				request.send(file);
			});
		}
		/** Seconds shown for a video skin's declared length. */
		function durationLabel(durationMs) {
			if (durationMs === null || durationMs <= 0) return null;
			return (durationMs / 1e3).toFixed(durationMs % 1e3 === 0 ? 0 : 1);
		}
		//#endregion
		//#region \0dsh-css:packages/dsh-web-start-ui/src/client/boot-animation.module.css.mjs
		const css$1 = ".E6M0Hq_section{flex-direction:column;gap:14px;display:flex}.E6M0Hq_lede{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.6}.E6M0Hq_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:16px;padding:16px;display:flex}.E6M0Hq_row{justify-content:space-between;align-items:center;gap:16px;display:flex}.E6M0Hq_rowText{flex-direction:column;gap:4px;min-width:0;display:flex}.E6M0Hq_rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}.E6M0Hq_rowHint{color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:1.5}.E6M0Hq_switch{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-radius:11px;flex:none;width:40px;height:22px;padding:0;transition:background .18s,border-color .18s;position:relative}.E6M0Hq_switchOn{background:var(--dsw-alias-brand-primary);border-color:#0000}.E6M0Hq_knob{background:#fff;border-radius:50%;width:16px;height:16px;transition:transform .18s;position:absolute;top:2px;left:2px;box-shadow:0 1px 3px #00000059}.E6M0Hq_switchOn .E6M0Hq_knob{transform:translate(18px)}.E6M0Hq_divider{background:var(--dsw-alias-border-l2);height:1px}.E6M0Hq_group{flex-direction:column;gap:8px;transition:opacity .18s;display:flex}.E6M0Hq_group[aria-disabled=true]{opacity:.5}.E6M0Hq_groupLabel{letter-spacing:.04em;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}.E6M0Hq_groupHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}.E6M0Hq_segment{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:9px;align-self:flex-start;gap:2px;padding:2px;display:inline-flex}.E6M0Hq_segItem{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:7px;padding:6px 14px;font-size:13px;transition:background .16s,color .16s}.E6M0Hq_segItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.E6M0Hq_segActive{background:var(--dsw-alias-bg-layer-4);color:var(--dsw-alias-label-primary);font-weight:600}.E6M0Hq_check{color:var(--dsw-alias-label-primary);cursor:pointer;align-items:center;gap:8px;font-size:13px;display:inline-flex}.E6M0Hq_skins{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;display:grid}.E6M0Hq_skinTile{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;flex-direction:column;align-items:stretch;gap:6px;padding:8px;transition:border-color .16s,background .16s;display:flex}.E6M0Hq_skinTile:hover{border-color:var(--dsw-alias-label-dimmed)}.E6M0Hq_skinTileActive{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover-accent)}.E6M0Hq_skinPick{color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;flex-direction:column;align-items:flex-start;gap:6px;padding:0;display:flex}.E6M0Hq_skinThumb{aspect-ratio:16/9;object-fit:cover;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:6px;width:100%;display:block}.E6M0Hq_skinThumbNone{background:linear-gradient(120deg, var(--dsw-alias-bg-layer-3) 0%, var(--dsw-alias-bg-layer-4) 55%, var(--dsw-alias-bg-layer-2) 100%)}.E6M0Hq_skinThumbVideo{background:radial-gradient(circle at 50% 50%, var(--dsw-alias-bg-layer-4) 0%, var(--dsw-alias-bg-layer-1) 100%)}.E6M0Hq_skinName{color:var(--dsw-alias-label-primary);word-break:break-all;font-size:12.5px;font-weight:600}.E6M0Hq_skinHint{color:var(--dsw-alias-label-tertiary);font-size:11.5px}.E6M0Hq_skinDelete{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:6px;align-self:flex-end;padding:3px 8px;font-size:11.5px}.E6M0Hq_skinDelete:hover{color:var(--dsw-alias-label-error);border-color:var(--dsw-alias-label-error)}.E6M0Hq_upload{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.E6M0Hq_uploadLabel{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-radius:9px;align-items:center;padding:8px 14px;font-size:13px;display:inline-flex;position:relative}.E6M0Hq_uploadLabel:hover{background:var(--dsw-alias-interactive-bg-hover)}.E6M0Hq_uploadLabel input{opacity:0;cursor:pointer;position:absolute;inset:0}.E6M0Hq_progress{background:var(--dsw-alias-bg-layer-4);border-radius:2px;height:4px;overflow:hidden}.E6M0Hq_progressBar{background:var(--dsw-alias-brand-primary);height:100%;transition:width .15s;display:block}.E6M0Hq_message{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}.E6M0Hq_messageBad{color:var(--dsw-alias-label-error)}.E6M0Hq_actions{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.E6M0Hq_preview{cursor:pointer;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));border:none;border-radius:9px;padding:8px 18px;font-size:13px;font-weight:600}.E6M0Hq_preview:hover{background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}.E6M0Hq_preview:disabled{cursor:not-allowed;opacity:.5}.E6M0Hq_ghost{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:9px;padding:8px 14px;font-size:13px}.E6M0Hq_ghost:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.E6M0Hq_note{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.6}@media (width<=760px){.E6M0Hq_skins{grid-template-columns:repeat(2,minmax(0,1fr))}}";
		const tagId$1 = "@linxin666/dsh-web-start-ui/packages/dsh-web-start-ui/src/client/boot-animation.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-web-start-ui";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var boot_animation_module_css_default = {
			"actions": "E6M0Hq_actions",
			"card": "E6M0Hq_card",
			"check": "E6M0Hq_check",
			"divider": "E6M0Hq_divider",
			"ghost": "E6M0Hq_ghost",
			"group": "E6M0Hq_group",
			"groupHint": "E6M0Hq_groupHint",
			"groupLabel": "E6M0Hq_groupLabel",
			"knob": "E6M0Hq_knob",
			"lede": "E6M0Hq_lede",
			"message": "E6M0Hq_message",
			"messageBad": "E6M0Hq_messageBad",
			"note": "E6M0Hq_note",
			"preview": "E6M0Hq_preview",
			"progress": "E6M0Hq_progress",
			"progressBar": "E6M0Hq_progressBar",
			"row": "E6M0Hq_row",
			"rowHint": "E6M0Hq_rowHint",
			"rowText": "E6M0Hq_rowText",
			"rowTitle": "E6M0Hq_rowTitle",
			"section": "E6M0Hq_section",
			"segActive": "E6M0Hq_segActive",
			"segItem": "E6M0Hq_segItem",
			"segment": "E6M0Hq_segment",
			"skinDelete": "E6M0Hq_skinDelete",
			"skinHint": "E6M0Hq_skinHint",
			"skinName": "E6M0Hq_skinName",
			"skinPick": "E6M0Hq_skinPick",
			"skinThumb": "E6M0Hq_skinThumb",
			"skinThumbNone": "E6M0Hq_skinThumbNone",
			"skinThumbVideo": "E6M0Hq_skinThumbVideo",
			"skinTile": "E6M0Hq_skinTile",
			"skinTileActive": "E6M0Hq_skinTileActive",
			"skins": "E6M0Hq_skins",
			"switch": "E6M0Hq_switch",
			"switchOn": "E6M0Hq_switchOn",
			"upload": "E6M0Hq_upload",
			"uploadLabel": "E6M0Hq_uploadLabel"
		};
		//#endregion
		//#region src/client/BootAnimationCard.tsx
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
		/** Join class names, dropping the falsey ones. */
		function cx(...names) {
			return names.filter((name) => typeof name === "string" && name.length > 0).join(" ");
		}
		/**
		* Pick the language a skin's display name should be shown in.
		*
		* The locale service hands out a namespace-bound translate, not the active tag, so
		* the decision rides a string this plugin owns: the built-in badge is Chinese in zh
		* and Latin in en.
		*/
		function prefersChinese(sample) {
			return /[\u4e00-\u9fff]/.test(sample);
		}
		/** Present one skin as the curtain wants it. */
		function toSplashSkin(skin) {
			return {
				id: skin.id,
				videoUrl: skin.videoUrl,
				posterUrl: skin.posterUrl,
				durationMs: skin.durationMs
			};
		}
		/**
		* Render the startup-animation settings page.
		* @param props - locale seat plus the injected preview/reset faces.
		* @returns the settings page.
		*/
		function BootAnimationCard({ t, preview, reset }) {
			const current = (0, react.useSyncExternalStore)(subscribePrefs, prefs);
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [message, setMessage] = (0, react.useState)(null);
			const [uploading, setUploading] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const chinese = prefersChinese(t("skinBuiltin"));
			(0, react.useEffect)(() => {
				let alive = true;
				fetchCatalog().then((result) => {
					if (!alive) return;
					if (result.ok) setCatalog(result.catalog);
					else setMessage({
						text: t("skinSelectFailed") + result.error,
						bad: true
					});
				});
				return () => {
					alive = false;
				};
			}, []);
			const activeSkin = catalog?.skins.find((skin) => skin.id === catalog.active) ?? null;
			const choose = async (id) => {
				setBusy(true);
				const result = await setActiveSkin(id);
				setBusy(false);
				if (result.ok) {
					setCatalog(result.catalog);
					setMessage(null);
					return;
				}
				setMessage({
					text: t("skinSelectFailed") + result.error,
					bad: true
				});
			};
			const onPickFile = async (file) => {
				if (file === void 0) return;
				setMessage(null);
				setUploading({
					name: file.name,
					fraction: 0
				});
				const result = await uploadSkin(file, (fraction) => {
					setUploading({
						name: file.name,
						fraction
					});
				});
				setUploading(null);
				if (!result.ok) {
					setMessage({
						text: t("skinUploadFailed") + result.error,
						bad: true
					});
					return;
				}
				setCatalog(result.catalog);
				const added = result.catalog.skins[result.catalog.skins.length - 1];
				setMessage({
					text: t("skinUploaded") + (added === void 0 ? file.name : added.name[chinese ? "zh" : "en"]),
					bad: false
				});
				if (added !== void 0) await choose(added.id);
			};
			const remove = async (skin) => {
				setBusy(true);
				const result = await deleteSkin(skin.id);
				setBusy(false);
				if (!result.ok) {
					setMessage({
						text: t("skinUploadFailed") + result.error,
						bad: true
					});
					return;
				}
				setCatalog(result.catalog);
				setMessage({
					text: t("skinDeleted") + skin.name[chinese ? "zh" : "en"],
					bad: false
				});
			};
			const canPreview = activeSkin !== null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: boot_animation_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: boot_animation_module_css_default.lede,
					children: t("lede")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cx(boot_animation_module_css_default.card, !current.enabled && boot_animation_module_css_default.cardIdle),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: boot_animation_module_css_default.row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: boot_animation_module_css_default.rowText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.rowTitle,
									children: t("enabled")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.rowHint,
									children: t("enabledHint")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "switch",
								"aria-checked": current.enabled,
								"aria-label": t("enabled"),
								className: cx(boot_animation_module_css_default.switch, current.enabled && boot_animation_module_css_default.switchOn),
								onClick: () => {
									updatePrefs({ enabled: !current.enabled });
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: boot_animation_module_css_default.knob })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: boot_animation_module_css_default.divider }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: boot_animation_module_css_default.group,
							"aria-disabled": !current.enabled,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupLabel,
									children: t("skinSection")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupHint,
									children: t("skinSectionHint")
								}),
								catalog === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupHint,
									children: t("skinLoading")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: boot_animation_module_css_default.skins,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: cx(boot_animation_module_css_default.skinTile, catalog.active === null && boot_animation_module_css_default.skinTileActive),
										"aria-pressed": catalog.active === null,
										disabled: busy,
										onClick: () => {
											choose(null);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: cx(boot_animation_module_css_default.skinThumb, boot_animation_module_css_default.skinThumbNone) }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: boot_animation_module_css_default.skinName,
												children: t("skinNone")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: boot_animation_module_css_default.skinHint,
												children: t("skinNoneHint")
											})
										]
									}), catalog.skins.map((skin) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cx(boot_animation_module_css_default.skinTile, catalog.active === skin.id && boot_animation_module_css_default.skinTileActive),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: boot_animation_module_css_default.skinPick,
											"aria-pressed": catalog.active === skin.id,
											disabled: busy,
											onClick: () => {
												choose(skin.id);
											},
											children: [
												skin.posterUrl === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: cx(boot_animation_module_css_default.skinThumb, boot_animation_module_css_default.skinThumbVideo) }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
													className: boot_animation_module_css_default.skinThumb,
													src: skin.posterUrl,
													alt: ""
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: boot_animation_module_css_default.skinName,
													children: skin.name[chinese ? "zh" : "en"]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: boot_animation_module_css_default.skinHint,
													children: [t(skin.source === "custom" ? "skinCustom" : "skinBuiltin"), durationLabel(skin.durationMs) === null ? "" : " · " + durationLabel(skin.durationMs) + "s"]
												})
											]
										}), skin.source === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: boot_animation_module_css_default.skinDelete,
											disabled: busy,
											onClick: () => {
												remove(skin);
											},
											children: t("skinDelete")
										}) : null]
									}, skin.id))]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: boot_animation_module_css_default.upload,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: boot_animation_module_css_default.uploadLabel,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "file",
											accept: "video/mp4,video/webm,video/quicktime",
											disabled: uploading !== null,
											onChange: (event) => {
												const file = event.target.files?.[0];
												event.target.value = "";
												onPickFile(file);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("skinAdd") })]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: boot_animation_module_css_default.groupHint,
										children: t("skinAddHint")
									})]
								}),
								uploading === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: boot_animation_module_css_default.progress,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
										className: boot_animation_module_css_default.progressBar,
										style: { width: Math.round(uploading.fraction * 100) + "%" }
									})
								}),
								uploading === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupHint,
									children: t("skinUploading") + " " + Math.round(uploading.fraction * 100) + "% · " + uploading.name
								}),
								message === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cx(boot_animation_module_css_default.message, message.bad && boot_animation_module_css_default.messageBad),
									children: message.text
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupHint,
									children: t("skinSpec")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: boot_animation_module_css_default.divider }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: boot_animation_module_css_default.group,
							"aria-disabled": !current.enabled,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupLabel,
									children: t("frequency")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: boot_animation_module_css_default.segment,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: cx(boot_animation_module_css_default.segItem, current.frequency === "session" && boot_animation_module_css_default.segActive),
										"aria-pressed": current.frequency === "session",
										onClick: () => {
											updatePrefs({ frequency: "session" });
										},
										children: t("frequencySession")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: cx(boot_animation_module_css_default.segItem, current.frequency === "always" && boot_animation_module_css_default.segActive),
										"aria-pressed": current.frequency === "always",
										onClick: () => {
											updatePrefs({ frequency: "always" });
										},
										children: t("frequencyAlways")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupHint,
									children: current.frequency === "session" ? t("frequencySessionHint") : t("frequencyAlwaysHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: boot_animation_module_css_default.group,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: boot_animation_module_css_default.check,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: current.skipOnClick,
									onChange: () => {
										updatePrefs({ skipOnClick: !current.skipOnClick });
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("skip") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: boot_animation_module_css_default.groupHint,
								children: t("skipHint")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: boot_animation_module_css_default.actions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: boot_animation_module_css_default.preview,
									disabled: !canPreview,
									onClick: () => {
										if (activeSkin !== null) preview(toSplashSkin(activeSkin));
									},
									children: t("preview")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: boot_animation_module_css_default.ghost,
									onClick: reset,
									children: t("reset")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: boot_animation_module_css_default.groupHint,
									children: canPreview ? t("previewHint") : t("skinPreviewUnavailable")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: boot_animation_module_css_default.note,
							children: t("note")
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Simplified Chinese dictionary. */
		const zh = {
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
		};
		/** English dictionary. */
		const en = {
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
		};
		//#endregion
		//#region \0dsh-css:packages/dsh-web-start-ui/src/client/runtime/splash.module.css.mjs
		const css = "._6_bjMq_curtain{z-index:2147483000;user-select:none;cursor:default;--dsh-boot-ink:#16203a;background:radial-gradient(120% 82% at 50% 46%,#fff 0%,#eef2fa 46%,#e2e8f5 100%);place-items:center;animation:.24s ease-out both _6_bjMq_curtainIn;display:grid;position:fixed;inset:0;overflow:hidden}._6_bjMq_curtain[data-theme=dark]{--dsh-boot-ink:#eaf2ff;background:radial-gradient(120% 82% at 50% 46%,#0c1526 0%,#070c17 55%,#04070d 100%)}._6_bjMq_videoStage{background:0 0;position:absolute;inset:0;overflow:hidden}._6_bjMq_video{object-fit:cover;background:0 0;width:100%;height:100%;display:block;position:absolute;inset:0}._6_bjMq_hint{z-index:2;text-align:center;letter-spacing:.16em;color:var(--dsh-boot-ink);text-shadow:0 1px 12px #0000008c;opacity:0;font-family:Segoe UI,Microsoft YaHei UI,system-ui,sans-serif;font-size:12.5px;animation:.6s ease-out .9s both _6_bjMq_hintIn;position:absolute;bottom:42px;left:0;right:0}._6_bjMq_outro{animation:_6_bjMq_curtainOut var(--dsh-boot-outro) cubic-bezier(.4, 0, .2, 1) both}@keyframes _6_bjMq_curtainIn{0%{opacity:0}to{opacity:1}}@keyframes _6_bjMq_curtainOut{0%{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.035)}}@keyframes _6_bjMq_hintIn{0%{opacity:0}to{opacity:.55}}@media (prefers-reduced-motion:reduce){._6_bjMq_curtain,._6_bjMq_curtain *{animation-duration:.2s!important;animation-iteration-count:1!important}}";
		const tagId = "@linxin666/dsh-web-start-ui/packages/dsh-web-start-ui/src/client/runtime/splash.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-web-start-ui";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var splash_module_css_default = {
			"curtain": "_6_bjMq_curtain",
			"curtainIn": "_6_bjMq_curtainIn",
			"curtainOut": "_6_bjMq_curtainOut",
			"hint": "_6_bjMq_hint",
			"hintIn": "_6_bjMq_hintIn",
			"outro": "_6_bjMq_outro",
			"video": "_6_bjMq_video",
			"videoStage": "_6_bjMq_videoStage"
		};
		//#endregion
		//#region src/client/runtime/splash.ts
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
		/** Attribute stamped on the curtain element (probing and CSS scoping). */
		const CURTAIN_ATTRIBUTE = "data-dsh-boot-animation";
		/** Outro length: the fade the curtain always ends with. */
		const OUTRO_MS = 460;
		/** Outro used when the user skips: a quick lift, not a slow fade. */
		const SKIP_MS = 220;
		/** How long the curtain may hold after the video, waiting for a first paint. */
		const HOLD_CAP_MS = 2800;
		/** How long playback may take to START before the curtain gives up on it. */
		const VIDEO_START_GRACE_MS = 6e3;
		/** Extra slack past a known length before the curtain assumes the video stalled. */
		const VIDEO_END_GRACE_MS = 8e3;
		/** Safety budget when neither the element nor the manifest knows a length. */
		const VIDEO_UNKNOWN_MS = 6e4;
		/** Detect the shell's colour scheme from the theme attributes. */
		function detectTheme() {
			const body = document.body;
			const html = document.documentElement;
			return body?.hasAttribute("data-ds-dark-theme") === true || html?.hasAttribute("data-ds-dark-theme") === true || body?.getAttribute("data-dsh-theme") === "dark" ? "dark" : "light";
		}
		/** True once the shell has painted something into the app root. */
		function appHasPainted() {
			const root = document.getElementById("root");
			if (root !== null && root.childElementCount > 0) return true;
			return document.querySelector("[data-slot]") !== null;
		}
		/** Escape text that came from a dictionary before it enters markup. */
		function escapeText(value) {
			return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}
		/** Build the curtain's markup: the video stage plus the optional footnote. */
		function curtainMarkup(hint) {
			const parts = [];
			parts.push(stageMarkup());
			if (hint !== void 0 && hint.length > 0) parts.push(hintMarkup(escapeText(hint)));
			return parts.join("");
		}
		/** The video stage element as markup. */
		function stageMarkup() {
			return "<div class=\"" + splash_module_css_default.videoStage + "\"></div>";
		}
		/** The skip footnote as markup. */
		function hintMarkup(text) {
			return "<p class=\"" + splash_module_css_default.hint + "\">" + text + "</p>";
		}
		/**
		* Remove the Host's early backdrop once this curtain is up. The outro fades to
		* transparent, so a leftover backdrop would reappear as the GUI came back; the
		* video (if any) is adopted out of it before this runs.
		*/
		function dropEarlyCurtain() {
			const host = window;
			const drop = host.__DSH_BOOT_CURTAIN_DROP__;
			if (typeof drop !== "function") return;
			host.__DSH_BOOT_CURTAIN_DROP__ = void 0;
			try {
				drop();
			} catch {}
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
		function adoptEarlyVideo(skin) {
			const host = window;
			const video = host.__DSH_BOOT_CURTAIN_VIDEO__;
			if (video === void 0) return void 0;
			const source = video.currentSrc !== "" ? video.currentSrc : video.src;
			if (source !== "" && source.endsWith(skin.videoUrl) === false && skin.videoUrl.endsWith(source) === false) return void 0;
			host.__DSH_BOOT_CURTAIN_VIDEO__ = void 0;
			return video;
		}
		/** Build a fresh video element for a skin. */
		function createVideo(skin) {
			const video = document.createElement("video");
			video.muted = true;
			video.defaultMuted = true;
			video.autoplay = true;
			video.setAttribute("muted", "");
			video.setAttribute("playsinline", "");
			video.setAttribute("preload", "auto");
			video.setAttribute("aria-hidden", "true");
			if (skin.posterUrl !== null) video.poster = skin.posterUrl;
			video.src = skin.videoUrl;
			return video;
		}
		let activeCancel = null;
		/**
		* Play the curtain on top of the whole page.
		* @param options - the curtain run (see {@link SplashOptions}).
		* @returns a disposer that lifts the curtain immediately; safe to call twice.
		*/
		function playSplash(options) {
			if (typeof document === "undefined") return () => {};
			activeCancel?.();
			const theme = options.theme ?? detectTheme();
			const skin = options.skin;
			const layer = document.createElement("div");
			layer.className = splash_module_css_default.curtain;
			layer.setAttribute(CURTAIN_ATTRIBUTE, skin.id);
			layer.setAttribute("data-skin", skin.id);
			layer.setAttribute("data-theme", theme);
			layer.setAttribute("role", "presentation");
			layer.style.setProperty("--dsh-boot-outro", "460ms");
			layer.innerHTML = curtainMarkup(options.hint);
			document.body.appendChild(layer);
			const video = adoptEarlyVideo(skin) ?? createVideo(skin);
			video.className = splash_module_css_default.video;
			const stage = layer.querySelector("." + splash_module_css_default.videoStage);
			if (stage !== null) stage.appendChild(video);
			dropEarlyCurtain();
			rememberTheme(theme);
			const themeObserver = new MutationObserver(() => {
				layer.setAttribute("data-theme", options.theme ?? detectTheme());
			});
			themeObserver.observe(document.body, {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme", "data-dsh-theme"]
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme", "data-dsh-theme"]
			});
			const hintElement = layer.querySelector("." + splash_module_css_default.hint);
			let finished = false;
			let outroStarted = false;
			let raf = 0;
			let safetyTimer = 0;
			const skip = options.skipOnClick !== false;
			const clear = () => {
				cancelAnimationFrame(raf);
				window.clearTimeout(safetyTimer);
				themeObserver.disconnect();
				video.removeEventListener("ended", onVideoEnded);
				video.removeEventListener("error", onVideoStalled);
				video.removeEventListener("loadedmetadata", armSafety);
				layer.removeEventListener("pointerdown", onSkip);
				window.removeEventListener("keydown", onKey);
				layer.remove();
			};
			const finish = () => {
				if (finished) return;
				finished = true;
				clear();
				if (activeCancel === cancel) activeCancel = null;
				options.onFinish?.();
			};
			const beginOutro = (outroMs) => {
				if (outroStarted || finished) return;
				outroStarted = true;
				window.clearTimeout(safetyTimer);
				video.pause();
				layer.classList.remove(splash_module_css_default.holding);
				layer.style.setProperty("--dsh-boot-outro", outroMs + "ms");
				layer.classList.add(splash_module_css_default.outro);
				window.setTimeout(finish, outroMs + 40);
			};
			const onSkip = () => beginOutro(SKIP_MS);
			const onKey = (event) => {
				if (event.key === "Escape") beginOutro(SKIP_MS);
			};
			if (skip) {
				layer.addEventListener("pointerdown", onSkip);
				window.addEventListener("keydown", onKey);
			}
			const waitForApp = options.waitForApp === true;
			const holdUntilPainted = () => {
				layer.classList.add(splash_module_css_default.holding);
				if (hintElement !== null && options.waiting !== void 0) hintElement.textContent = options.waiting;
				const deadline = performance.now() + HOLD_CAP_MS;
				const poll = () => {
					if (finished || outroStarted) return;
					if (appHasPainted() || performance.now() >= deadline) {
						beginOutro(OUTRO_MS);
						return;
					}
					raf = requestAnimationFrame(poll);
				};
				raf = requestAnimationFrame(poll);
			};
			const onVideoEnded = () => {
				if (waitForApp && appHasPainted() === false) holdUntilPainted();
				else beginOutro(OUTRO_MS);
			};
			const onVideoStalled = () => {
				beginOutro(OUTRO_MS);
			};
			/**
			* Arm the stall backstop from the best length available: the element's own
			* metadata first, then the manifest's declared length, then a long fallback.
			* Re-armed on loadedmetadata, when the real duration becomes known.
			*/
			function armSafety() {
				if (finished || outroStarted) return;
				window.clearTimeout(safetyTimer);
				const budget = (Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1e3 : null) ?? skin.durationMs ?? VIDEO_UNKNOWN_MS;
				safetyTimer = window.setTimeout(() => {
					if (finished || outroStarted) return;
					if (video.ended) onVideoEnded();
					else if (video.paused || video.currentTime === 0) onVideoStalled();
					else armSafety();
				}, budget + VIDEO_END_GRACE_MS);
			}
			video.addEventListener("ended", onVideoEnded);
			video.addEventListener("error", onVideoStalled);
			video.addEventListener("loadedmetadata", armSafety);
			armSafety();
			window.setTimeout(() => {
				if (finished || outroStarted) return;
				if (video.currentTime === 0 && (video.paused || video.readyState < 2)) onVideoStalled();
			}, VIDEO_START_GRACE_MS);
			const started = video.play();
			if (started && typeof started.catch === "function") started.catch(() => {});
			if (video.ended) onVideoEnded();
			function cancel() {
				if (finished) return;
				finished = true;
				clear();
				if (activeCancel === cancel) activeCancel = null;
				options.onFinish?.();
			}
			activeCancel = cancel;
			return cancel;
		}
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace owned by this plugin. */
		const NS = "bootAnimation";
		/** Required services: the slot registry and the locale dictionary service. */
		const inject = ["slots", "locale"];
		/** Settings-page id (the nav cell key; a fresh id adds beside the shipped pages). */
		const SECTION_ID = "boot-animation";
		/** Nav position: after the shipped pages and the skin center's own section. */
		const SECTION_ORDER = 130;
		/**
		* Read one dictionary string, tolerating a locale service that is not ready.
		* @param ctx - client root context.
		* @param key - dictionary key.
		* @returns the active-locale string, or undefined when the seat is unavailable.
		*/
		function text(ctx, key) {
			try {
				return ctx.locale.bind(NS)(key);
			} catch {
				return;
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
		function readInjectedSkin() {
			const payload = globalThis[EARLY_SKIN_GLOBAL];
			if (typeof payload !== "object" || payload === null) return null;
			const record = payload;
			if (typeof record.id !== "string" || typeof record.videoUrl !== "string") return null;
			return {
				id: record.id,
				videoUrl: record.videoUrl,
				posterUrl: typeof record.posterUrl === "string" ? record.posterUrl : null,
				durationMs: typeof record.durationMs === "number" ? record.durationMs : null
			};
		}
		/**
		* Play one curtain run.
		* @param ctx - client root context (for the curtain's own hint copy).
		* @param options - the preference set to project onto the curtain.
		* @param skin - the launch skin to play.
		* @param waitForApp - hold until the shell has painted (boot only).
		* @returns the curtain's disposer.
		*/
		function play(ctx, options, skin, waitForApp) {
			const skip = options.skipOnClick;
			return playSplash({
				skin,
				skipOnClick: skip,
				waitForApp,
				theme: detectTheme(),
				hint: skip ? text(ctx, "skip") : void 0,
				waiting: text(ctx, "waiting")
			});
		}
		/**
		* Register the dictionaries, boot the curtain and publish the settings page.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, {
						zh,
						en
					});
				} catch {
					return () => {};
				}
			}, "ui-web-start-ui: dictionaries");
			ctx.effect(() => {
				const skin = readInjectedSkin();
				if (skin === null) return () => {};
				const options = prefs();
				if (!options.enabled) return () => {};
				if (options.frequency === "session" && sessionPlayed()) return () => {};
				markSessionPlayed();
				return play(ctx, options, skin, true);
			}, "ui-web-start-ui: launch curtain");
			const injected = () => ({
				preview: (skin) => {
					play(ctx, prefs(), skin, false);
				},
				reset: () => {
					resetPrefs();
				}
			});
			ctx.slots.inject("settings.section", () => {
				try {
					return ctx.slots.register({
						name: "settings.section",
						id: SECTION_ID,
						order: SECTION_ORDER,
						label: () => text(ctx, "title") ?? "Startup animation",
						locale: NS,
						inject: injected
					}, BootAnimationCard);
				} catch {
					return () => {};
				}
			});
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		exports.readInjectedSkin = readInjectedSkin;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map