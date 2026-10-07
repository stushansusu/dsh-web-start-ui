import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/skins-contract.ts
/**
* Shared contract of the launch-skin catalog: the shapes the host serves and
* the browser half consumes, plus the paths both sides must agree on. Types
* only for the browser half (its bundle must not drag host code in), so this
* module stays free of node imports.
*/
/** Browser-facing base path of the plugin's own host routes. */
const BOOT_ANIMATION_API = "/api/boot-animation";
/** Manifest file name inside a skin directory (built-in and custom alike). */
const SKIN_MANIFEST_FILE = "skin.json";
/** Upload size ceiling for one custom skin, in bytes (256 MiB). */
const CUSTOM_SKIN_MAX_BYTES = 256 * 1024 * 1024;
/** Video containers a custom skin may be uploaded as. */
const CUSTOM_SKIN_EXTENSIONS = [
	".mp4",
	".webm",
	".mov"
];
/** Global the early backdrop script and the browser half both read. */
const EARLY_SKIN_GLOBAL = "__DSH_BOOT_SKIN__";
//#endregion
//#region src/host/home.ts
/**
* Where the host keeps custom launch skins.
*
* The Harness home is resolved the way the rest of the host does it: $DSH_HOME
* when set, otherwise <user home>/.dsh. Custom skins live beside the user's
* other Harness state (`<home>/launch-animations/<id>/`) rather than in browser
* storage, so the choice survives clearing site data and the host can read it
* before the shell exists (that is what lets a video start early).
*/
/** Root directory of custom launch skins for one environment. */
function launchAnimationsDir(env = process.env) {
	return join((env.DSH_HOME !== void 0 && env.DSH_HOME.trim() !== "" ? env.DSH_HOME.trim() : void 0) ?? join(homedir(), ".dsh"), "launch-animations");
}
/** File holding the selected skin id (`{ "active": string | null }`). */
const ACTIVE_STATE_FILE = "state.json";
//#endregion
//#region src/host/skins.ts
/**
* The launch-skin registry.
*
* Two sources, one shape. Built-in skins ship inside this package under
* `assets/launch/<id>/` and are read-only; custom skins live in
* `<DSH_HOME>/launch-animations/<id>/` and are written through the upload
* route. Both are directories holding a `skin.json` manifest plus the video (and
* optionally a poster frame), and both are served by the same asset route, so
* the browser half never learns which source a skin came from except to decide
* whether it may delete it.
*
* Everything here is deliberately strict: a manifest that does not parse, an id
* that does not match its directory, a file name with a separator in it, or an
* extension outside the video allow-list makes the skin disappear from the
* catalog rather than reach the route. The route's allow-list is the manifest
* itself: a request can only ever fetch a file the manifest names.
*/
/** Widest id we accept, and the only shape: lowercase, digits, single dashes. */
const SKIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A bare file name inside a skin directory: no separators, no traversal. */
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/**
* Locate the package root from the running module.
*
* The built host half runs from `<pkg>/lib/index.js` and the source layout from
* `<pkg>/src/host/skins.ts`; probing for the enclosing package.json covers both
* without a build-time constant.
* @returns absolute package root.
*/
function packageRoot() {
	const here = fileURLToPath(new URL("..", import.meta.url));
	for (const candidate of [
		here,
		join(here, ".."),
		join(here, "..", "..")
	]) if (existsSync(join(candidate, "package.json"))) return candidate;
	return here;
}
/** Directory holding the shipped skins (`<pkg>/assets/launch`). */
function builtinSkinsDir() {
	return join(packageRoot(), "assets", "launch");
}
/** Whether a directory name is an acceptable skin id. */
function isSkinId(value) {
	return SKIN_ID_PATTERN.test(value);
}
/** Directory of one custom skin under the Harness home. */
function customSkinDir(id) {
	return join(launchAnimationsDir(), id);
}
/** Read and validate one skin directory's manifest, or undefined. */
function readManifest(dir, id) {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(join(dir, SKIN_MANIFEST_FILE), "utf8"));
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null) return void 0;
	const record = parsed;
	const file = typeof record.file === "string" ? record.file : void 0;
	if (file === void 0 || !FILE_NAME_PATTERN.test(file)) return void 0;
	if (!CUSTOM_SKIN_EXTENSIONS.includes(extname(file).toLowerCase())) return void 0;
	if (!existsSync(join(dir, file))) return void 0;
	const poster = typeof record.poster === "string" && FILE_NAME_PATTERN.test(record.poster) && existsSync(join(dir, record.poster)) ? record.poster : void 0;
	const name = typeof record.name === "object" && record.name !== null ? record.name : {};
	const note = typeof record.note === "object" && record.note !== null ? record.note : void 0;
	const durationMs = typeof record.durationMs === "number" && Number.isFinite(record.durationMs) && record.durationMs > 0 ? Math.round(record.durationMs) : void 0;
	return {
		id,
		kind: "video",
		name: {
			zh: typeof name.zh === "string" && name.zh.trim() !== "" ? name.zh : id,
			en: typeof name.en === "string" && name.en.trim() !== "" ? name.en : typeof name.zh === "string" ? name.zh : id
		},
		file,
		...poster === void 0 ? {} : { poster },
		...durationMs === void 0 ? {} : { durationMs },
		...note === void 0 ? {} : { note: {
			zh: typeof note.zh === "string" ? note.zh : "",
			en: typeof note.en === "string" ? note.en : typeof note.zh === "string" ? note.zh : ""
		} }
	};
}
/** Same-origin asset URL of one file of one skin. */
function assetUrl(id, file) {
	return "/api/boot-animation/asset/" + encodeURIComponent(id) + "/" + encodeURIComponent(file);
}
/** Project a validated manifest onto the browser-facing view. */
function viewOf(manifest, source) {
	return {
		id: manifest.id,
		source,
		kind: "video",
		name: manifest.name,
		...manifest.note === void 0 ? {} : { note: manifest.note },
		videoUrl: assetUrl(manifest.id, manifest.file),
		posterUrl: manifest.poster === void 0 ? null : assetUrl(manifest.id, manifest.poster),
		durationMs: manifest.durationMs ?? null
	};
}
/** Enumerate the skin directories of one root, in stable id order. */
function scan(root, source) {
	let entries;
	try {
		entries = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && isSkinId(entry.name)).map((entry) => entry.name).sort();
	} catch {
		return [];
	}
	const skins = [];
	for (const id of entries) {
		const manifest = readManifest(join(root, id), id);
		if (manifest !== void 0) skins.push(viewOf(manifest, source));
	}
	return skins;
}
/** Every shipped skin, in id order. */
function listBuiltinSkins() {
	return scan(builtinSkinsDir(), "builtin");
}
/** Every custom skin under the Harness home, in id order. */
function listCustomSkins() {
	return scan(launchAnimationsDir(), "custom");
}
/** The whole catalog, built-ins first. */
function listSkins() {
	return [...listBuiltinSkins(), ...listCustomSkins()];
}
/** Locate one skin by id across both sources. */
function findSkin(id) {
	if (!isSkinId(id)) return void 0;
	for (const [dir, source] of [[join(builtinSkinsDir(), id), "builtin"], [customSkinDir(id), "custom"]]) {
		const manifest = readManifest(dir, id);
		if (manifest !== void 0) return {
			view: viewOf(manifest, source),
			manifest,
			dir
		};
	}
}
/**
* The stored selection, with 'unset' kept distinct from 'explicitly none'.
* @returns the stored id, null when the user chose no skin, or undefined when
*   nothing was ever chosen (or the state file is unreadable).
*/
function readStoredActive() {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(join(launchAnimationsDir(), ACTIVE_STATE_FILE), "utf8"));
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null) return void 0;
	const active = parsed.active;
	if (active === null) return null;
	return typeof active === "string" && active !== "" ? active : void 0;
}
/**
* The skin that should play: the stored choice, or the first built-in skin.
*
* A launch-animation plugin that ships a skin should play it once installed, so an
* unset selection (fresh install, or a stored id whose skin was replaced or
* removed) resolves to the first built-in skin. Choosing 'no skin' stores an
* explicit null, which stays null: the fallback never overrides a choice.
* @returns the skin id to play, or null when nothing should play.
*/
function resolveActiveSkinId() {
	const stored = readStoredActive();
	if (stored === null) return null;
	if (stored !== void 0 && findSkin(stored) !== void 0) return stored;
	const fallback = listBuiltinSkins()[0];
	return fallback === void 0 ? null : fallback.id;
}
/** Clear the stored selection back to 'unset' (the built-in default applies). */
function clearActiveSkin() {
	const dir = launchAnimationsDir();
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, ACTIVE_STATE_FILE), JSON.stringify({}, null, 2) + "\n", "utf8");
}
/** Persist the selected skin id (null clears it). */
function writeActiveSkin(id) {
	const dir = launchAnimationsDir();
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, ACTIVE_STATE_FILE), JSON.stringify({ active: id }, null, 2) + "\n", "utf8");
}
/** Absolute path + MIME of one manifest-named file, or undefined. */
function resolveSkinFile(id, file) {
	const found = findSkin(id);
	if (found === void 0) return void 0;
	if (file !== found.manifest.file && file !== found.manifest.poster) return void 0;
	const path = join(found.dir, file);
	try {
		if (!statSync(path).isFile()) return void 0;
	} catch {
		return;
	}
	return {
		path,
		mime: mimeFor(file)
	};
}
/** Content type by extension (video containers plus the poster imagery). */
function mimeFor(file) {
	switch (extname(file).toLowerCase()) {
		case ".mp4": return "video/mp4";
		case ".webm": return "video/webm";
		case ".mov": return "video/quicktime";
		case ".webp": return "image/webp";
		case ".png": return "image/png";
		case ".jpg":
		case ".jpeg": return "image/jpeg";
		default: return "application/octet-stream";
	}
}
/** Slug one uploaded file name into a candidate skin id. */
function skinIdFromName(name) {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
	const base = slug === "" ? "custom" : slug;
	return base.startsWith("custom") ? base : "custom-" + base;
}
/**
* Create (or replace) one custom skin from an already-written payload.
* @param options - id, display name, extension and the temp file holding the bytes.
* @returns the new skin's view, or undefined when the id is unusable.
*/
function commitCustomSkin(options) {
	if (!isSkinId(options.id)) return void 0;
	const ext = options.ext.toLowerCase();
	if (!CUSTOM_SKIN_EXTENSIONS.includes(ext)) return void 0;
	const dir = customSkinDir(options.id);
	mkdirSync(dir, { recursive: true });
	const file = "intro" + ext;
	const target = join(dir, file);
	try {
		rmSync(target, { force: true });
		renameSync(options.tempPath, target);
	} catch {
		return;
	}
	const manifest = {
		id: options.id,
		kind: "video",
		name: {
			zh: options.name,
			en: options.name
		},
		file,
		...options.posterPath === void 0 ? {} : { poster: "poster.webp" }
	};
	writeFileSync(join(dir, SKIN_MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n", "utf8");
	return viewOf(manifest, "custom");
}
/**
* Delete one custom skin (built-ins are package files and cannot be removed).
* @param id - skin id.
* @returns true when a directory was removed.
*/
function deleteCustomSkin(id) {
	if (!isSkinId(id)) return false;
	const dir = customSkinDir(id);
	if (!existsSync(dir)) return false;
	rmSync(dir, {
		recursive: true,
		force: true
	});
	return !existsSync(dir);
}
//#endregion
//#region src/host/routes.ts
/**
* The plugin's HTTP surface.
*
* One prefix registration carries four things the browser half needs and cannot
* do alone: the catalog of launch skins, the selection, the upload of a custom
* video, and the bytes themselves (with Range support, because a browser wants a
* byte range to start an mp4 without downloading all of it).
*
* Mutations are loopback-only: the desktop shell binds 0.0.0.0 for its LAN mode,
* and an unauthenticated upload/delete/select route reachable from the network
* would be a hole. Reads (catalog and assets) stay open, the way the pet's asset
* route is, so a paired device still sees the curtain it was configured with.
*/
/** JSON response headers for this family. */
const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store"
};
/** Write one JSON response. */
function sendJson(res, status, body) {
	res.writeHead(status, JSON_HEADERS);
	res.end(JSON.stringify(body));
}
/**
* Whether the request arrived over loopback.
*
* IPv4 loopback, IPv6 loopback, and the IPv4-mapped form Node reports on a
* dual-stack socket. Anything else (a LAN address, a tunnel) fails.
*/
function isLoopbackRequest(req) {
	const address = req.socket.remoteAddress ?? "";
	return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}
/** Read the whole request body as JSON, bounded to 64 KiB. */
async function readJson(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > 64 * 1024) throw new Error("body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	return text === "" ? null : JSON.parse(text);
}
/** The whole catalog plus the selected id. */
function catalog() {
	return {
		active: resolveActiveSkinId(),
		skins: listSkins()
	};
}
/** First free id derived from a display name. */
function uniqueSkinId(name) {
	const base = skinIdFromName(name);
	const taken = new Set(listSkins().map((skin) => skin.id));
	if (!taken.has(base)) return base;
	for (let index = 2; index < 100; index++) {
		const candidate = base + "-" + index;
		if (!taken.has(candidate)) return candidate;
	}
	return base + "-" + Date.now().toString(36);
}
/**
* Stream one upload into a temp file under the cap.
* @returns the byte count, or undefined when the payload exceeded the cap.
*/
async function spoolUpload(req, tempPath) {
	const out = createWriteStream(tempPath);
	let bytes = 0;
	try {
		for await (const chunk of req) {
			const buffer = chunk;
			bytes += buffer.length;
			if (bytes > 268435456) {
				out.destroy();
				return;
			}
			if (!out.write(buffer)) await once(out, "drain");
		}
		await new Promise((resolve, reject) => {
			out.end(() => {
				resolve();
			});
			out.on("error", reject);
		});
		return bytes;
	} catch {
		out.destroy();
		return;
	}
}
/** Handle POST /skins (a raw video body plus name/ext query parameters). */
async function handleUpload(req, res, url) {
	const declared = (url.searchParams.get("name") ?? "").trim();
	const requestedExt = (url.searchParams.get("ext") ?? "").trim().toLowerCase();
	const ext = requestedExt !== "" ? requestedExt : extname(declared).toLowerCase();
	if (!CUSTOM_SKIN_EXTENSIONS.includes(ext)) {
		sendJson(res, 400, {
			error: "unsupported-extension",
			allowed: CUSTOM_SKIN_EXTENSIONS
		});
		return;
	}
	const displayName = declared === "" ? "Custom launch animation" : declared.replace(/\.[A-Za-z0-9]+$/, "");
	const requestedId = url.searchParams.get("id") ?? "";
	const id = isSkinId(requestedId) ? requestedId : uniqueSkinId(displayName);
	const tempPath = join(tmpdir(), "dsh-web-start-ui-" + id + "-" + Date.now() + ".upload");
	const bytes = await spoolUpload(req, tempPath);
	if (bytes === void 0) {
		rmSync(tempPath, { force: true });
		sendJson(res, 413, {
			error: "too-large",
			maxBytes: CUSTOM_SKIN_MAX_BYTES
		});
		return;
	}
	if (bytes === 0) {
		rmSync(tempPath, { force: true });
		sendJson(res, 400, { error: "empty-body" });
		return;
	}
	const skin = commitCustomSkin({
		id,
		name: displayName,
		ext,
		tempPath,
		bytes
	});
	if (skin === void 0) {
		rmSync(tempPath, { force: true });
		sendJson(res, 400, { error: "rejected" });
		return;
	}
	sendJson(res, 201, {
		skin,
		catalog: catalog()
	});
}
/** Serve one skin file, honouring a single byte range. */
function serveAsset(req, res, id, file) {
	const resolved = resolveSkinFile(id, file);
	if (resolved === void 0) {
		sendJson(res, 404, { error: "not-found" });
		return;
	}
	const stat = statSync(resolved.path);
	const size = stat.size;
	const etag = "\"" + size.toString(36) + "-" + Math.floor(stat.mtimeMs).toString(36) + "\"";
	const headers = {
		"content-type": resolved.mime,
		"accept-ranges": "bytes",
		"cache-control": "private, max-age=0, must-revalidate",
		etag
	};
	if (req.headers["if-none-match"] === etag) {
		res.writeHead(304, headers);
		res.end();
		return;
	}
	const range = req.headers.range;
	const match = typeof range === "string" ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
	if (match === null) {
		res.writeHead(200, {
			...headers,
			"content-length": String(size)
		});
		createReadStream(resolved.path).pipe(res);
		return;
	}
	const rawStart = match[1];
	const rawEnd = match[2];
	let start = rawStart === "" ? void 0 : Number(rawStart);
	let end = rawEnd === "" ? void 0 : Number(rawEnd);
	if (start === void 0 && end === void 0) {
		res.writeHead(416, {
			...headers,
			"content-range": "bytes */" + size
		});
		res.end();
		return;
	}
	if (start === void 0) {
		start = Math.max(0, size - (end ?? 0));
		end = size - 1;
	} else if (end === void 0 || end >= size) end = size - 1;
	if (start >= size || start > end) {
		res.writeHead(416, {
			...headers,
			"content-range": "bytes */" + size
		});
		res.end();
		return;
	}
	res.writeHead(206, {
		...headers,
		"content-range": "bytes " + start + "-" + end + "/" + size,
		"content-length": String(end - start + 1)
	});
	createReadStream(resolved.path, {
		start,
		end
	}).pipe(res);
}
/** The single prefix route: everything under /api/boot-animation. */
function bootAnimationRoute() {
	return {
		kind: "prefix",
		path: BOOT_ANIMATION_API,
		handler: (req, res) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const path = url.pathname;
			const method = req.method ?? "GET";
			if (method === "GET" && path === "/api/boot-animation/skins") {
				sendJson(res, 200, catalog());
				return;
			}
			if (method === "POST" && path === "/api/boot-animation/active") {
				if (!isLoopbackRequest(req)) {
					sendJson(res, 403, { error: "loopback-only" });
					return;
				}
				handleActive(req, res);
				return;
			}
			if (method === "POST" && path === "/api/boot-animation/skins") {
				if (!isLoopbackRequest(req)) {
					sendJson(res, 403, { error: "loopback-only" });
					return;
				}
				handleUpload(req, res, url);
				return;
			}
			if (method === "DELETE" && path.startsWith("/api/boot-animation/skins/")) {
				if (!isLoopbackRequest(req)) {
					sendJson(res, 403, { error: "loopback-only" });
					return;
				}
				const id = decodeURIComponent(path.slice(26));
				const found = listSkins().find((skin) => skin.id === id);
				if (found === void 0) {
					sendJson(res, 404, { error: "not-found" });
					return;
				}
				if (found.source !== "custom") {
					sendJson(res, 400, { error: "builtin-not-removable" });
					return;
				}
				const removed = deleteCustomSkin(id);
				if (removed && readStoredActive() === id) clearActiveSkin();
				sendJson(res, 200, {
					removed,
					catalog: catalog()
				});
				return;
			}
			if (method === "GET" && path.startsWith("/api/boot-animation/asset/")) {
				const rest = path.slice(26);
				const slash = rest.indexOf("/");
				if (slash <= 0) {
					sendJson(res, 404, { error: "not-found" });
					return;
				}
				serveAsset(req, res, decodeURIComponent(rest.slice(0, slash)), decodeURIComponent(rest.slice(slash + 1)));
				return;
			}
			sendJson(res, 404, { error: "not-found" });
		}
	};
}
/** Handle POST /active: { id: string | null }. */
async function handleActive(req, res) {
	let body;
	try {
		body = await readJson(req);
	} catch {
		sendJson(res, 400, { error: "bad-json" });
		return;
	}
	if (typeof body !== "object" || body === null) {
		sendJson(res, 400, { error: "bad-body" });
		return;
	}
	const value = body.id;
	if (value === null || value === void 0 || value === "") {
		writeActiveSkin(null);
		sendJson(res, 200, catalog());
		return;
	}
	if (typeof value !== "string" || !isSkinId(value)) {
		sendJson(res, 400, { error: "bad-id" });
		return;
	}
	if (!listSkins().some((skin) => skin.id === value)) {
		sendJson(res, 404, { error: "unknown-skin" });
		return;
	}
	writeActiveSkin(value);
	sendJson(res, 200, catalog());
}
//#endregion
//#region src/index.ts
/** Backdrop gradients, mirrored from the browser half's stylesheet. */
const DARK_BACKDROP = "radial-gradient(120% 82% at 50% 46%,#0c1526 0%,#070c17 55%,#04070d 100%)";
const LIGHT_BACKDROP = "radial-gradient(120% 82% at 50% 46%,#ffffff 0%,#eef2fa 46%,#e2e8f5 100%)";
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
function earlyCurtainBody(darkBackdrop, lightBackdrop, skinGlobal) {
	try {
		const P = "dsh:boot-animation:v1";
		const S = "dsh:boot-animation:played";
		const T = "dsh:boot-animation:theme";
		const raw = window.localStorage.getItem(P);
		const prefs = raw ? JSON.parse(raw) : {};
		if (prefs.enabled === false) return;
		if (prefs.frequency !== "always" && window.sessionStorage.getItem(S) === "1") return;
		let theme = window.localStorage.getItem(T);
		if (theme !== "dark" && theme !== "light") theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		const skin = globalThis[skinGlobal];
		if (!skin || !skin.videoUrl) return;
		const layer = document.createElement("div");
		layer.setAttribute("data-dsh-boot-curtain", "early");
		layer.setAttribute("aria-hidden", "true");
		layer.style.cssText = "position:fixed;inset:0;z-index:2147482990;pointer-events:none;background:" + (theme === "dark" ? darkBackdrop : lightBackdrop) + ";";
		{
			const video = document.createElement("video");
			video.muted = true;
			video.defaultMuted = true;
			video.autoplay = true;
			video.setAttribute("muted", "");
			video.setAttribute("playsinline", "");
			video.setAttribute("preload", "auto");
			if (skin.posterUrl) video.poster = skin.posterUrl;
			video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
			layer.appendChild(video);
			window.__DSH_BOOT_CURTAIN_VIDEO__ = video;
			video.src = skin.videoUrl;
			const kick = () => {
				const started = video.play();
				if (started && started.catch) started.catch(() => {});
			};
			kick();
			video.addEventListener("loadeddata", kick, { once: true });
		}
		document.documentElement.appendChild(layer);
		let gone = false;
		const drop = () => {
			if (gone) return;
			gone = true;
			if (layer.parentNode) layer.parentNode.removeChild(layer);
		};
		window.__DSH_BOOT_CURTAIN_DROP__ = drop;
		window.setTimeout(drop, 15e3);
	} catch {}
}
/** Serialize the early curtain into one inline script, with its inputs bound. */
function earlyCurtainScript() {
	return "(" + earlyCurtainBody.toString() + ")(" + JSON.stringify(DARK_BACKDROP) + "," + JSON.stringify(LIGHT_BACKDROP) + "," + JSON.stringify(EARLY_SKIN_GLOBAL) + ")";
}
/** Payload the early script and the browser half read, or null without a skin. */
function earlySkinPayload() {
	const active = resolveActiveSkinId();
	if (active === null) return null;
	const found = findSkin(active);
	if (found === void 0) return null;
	return {
		id: found.view.id,
		videoUrl: found.view.videoUrl,
		posterUrl: found.view.posterUrl,
		durationMs: found.view.durationMs
	};
}
/**
* Contribute the early curtain (and install the routes) on every index render.
* @param ctx - host root context.
*/
function apply(ctx) {
	let disposeRoutes;
	const installRoutes = () => {
		if (disposeRoutes !== void 0) return;
		const webServer = ctx.get("webServer");
		if (webServer === void 0) return;
		const unregister = webServer.register(bootAnimationRoute());
		disposeRoutes = () => {
			unregister();
			disposeRoutes = void 0;
		};
		ctx.effect(() => () => {
			disposeRoutes?.();
		}, "ui-web-start-ui: routes");
	};
	installRoutes();
	ctx.effect(() => ctx.on("internal/service", (name) => {
		if (name === "webServer") installRoutes();
	}), "ui-web-start-ui: routes when the webserver appears");
	ctx.effect(() => ctx.on("webserver/index-inject", (table) => {
		installRoutes();
		table.push({
			kind: "global",
			name: EARLY_SKIN_GLOBAL,
			value: earlySkinPayload()
		});
		table.push({
			kind: "script",
			placement: "head",
			text: earlyCurtainScript()
		});
	}), "ui-web-start-ui: early curtain row");
}
//#endregion
export { apply, earlyCurtainScript, earlySkinPayload };
