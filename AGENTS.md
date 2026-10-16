# AGENTS.md — dsh-web-start-ui

DSH Web GUI plugin `@linxin666/dsh-web-start-ui`（显示名 dsh web start ui，功能是启动动画）。
包级规则：只写本包特有约定，不重复根 AGENTS.md 与 packages/AGENTS.md 的全局/包级规则。

## 本包要点

- **两个半区各管一半，别把职责搞混：**
  - **宿主半区**（`src/index.ts` + `src/host/*`）做两件事：提供皮肤目录 / 视频本体 / 上传删除
    等路由，以及订阅 `webserver/index-inject` 把「当前皮肤 URL + 一段内联起播脚本」塞进 index.html
    的 head —— 在模块图还没请求之前视频就已经在建、在取流。
  - **浏览器半区**（`src/client/index.ts`）**接管**宿主已经起播的 `<video>`（`runtime/splash.ts`）、
    移除底色层、跟随主题、播完落帘，并注册设置分区。
  - 为什么必须有宿主那一段：浏览器半区跟着 GUI 的模块图一起加载，实测壳在 191ms 就首绘，
    而浏览器半区要到 ~600ms 才跑起来 —— 只靠浏览器半区会先闪一下半成品界面。
  - **帘幕只有视频这一种形态**：没有风格引擎，没选皮肤就什么都不播（也没有底色层）。
- **交接契约（改任一半都要一起看）：** 底色层 `pointer-events:none`、z-index 低一档；
  浏览器帘幕一挂上就把 `window.__DSH_BOOT_CURTAIN_VIDEO__` 那个元素**搬进自己的 stage**
  （不要新建 video，否则重播），再调 `window.__DSH_BOOT_CURTAIN_DROP__` 摘掉底色层
  （落帘是淡出，留着会露底）；注入脚本自带 15 秒兜底移除，浏览器半区没装载也不会盖住界面。
- **播放偏好在浏览器，皮肤是宿主状态**：`dsh:boot-animation:v1`（启用 / 播放频率 / 点击跳过）、
  `dsh:boot-animation:theme`（上次帘幕的明暗，底色层唯一能提前知道主题的办法）、
  `dsh:boot-animation:played`（每会话一次标记）；皮肤与选中的 id 在 `<DSH_HOME>/launch-animations/`。
- **设置页走 `settings.section`**（id `boot-animation`，order 130）：卡片是
  `src/client/BootAnimationCard.tsx`，字典在 `src/client/locales.ts`（namespace `bootAnimation`）。
- **帘幕的时长 = 视频时长**（`splash.ts` 用 `ended` 事件落帘，不是计时器）；兜底计时器只负责
  「视频卡住 / 解不出来」时把界面还回来。改落帘相关数值前先读 `splash.ts` 顶部那段注释。
- **给帘幕加元素时注意继承色**：曾经有个真坑 —— 激活某些皮肤时，皮肤那条被强制定域的
  `html[data-dsh-skin=…] body svg { color: … }`（特异性 0,1,2）能把帘幕里的 svg 压成图标灰。
  现在帘幕里只有 video + 一行提示，但颜色仍要么内联、要么在 `.curtain` 上定死，别指望继承。
- CSS Modules 由 tsdown 内联并自动注入 `<style data-plugin="...">`；类名一律走
  `import css from './x.module.css'`，不写全局选择器。

## 启动皮肤（视频）

- 一个皮肤 = 一个目录 + `skin.json`：内置在 `assets/launch/<id>/`（随包发布），自定义在
  `<DSH_HOME>/launch-animations/<id>/`（设置页上传）。**选中的 id 是宿主状态**
  （`<DSH_HOME>/launch-animations/state.json`），所以同一套安装的所有浏览器共用同一段开场。
- 加内置皮肤：`node scripts/add-launch-skin.mjs <视频> --name "名字" [--poster x.jpg] [--duration 3.5]`。
  资产是**运行时**读的，不用重新构建；但 `package.json` 的 `files` 必须含 `assets`（已含）。
  需要转码 / 抽海报帧用 `scripts/bake-skin-video.py`（`--width 1920 --crf 26 --tune animation`，
  要 numpy + av 的 python，本机是 ComfyUI 的 venv：
  `D:/Comfy-Desktop/ComfyUI-Installs/ComfyUI (1)/ComfyUI/.venv/Scripts/python.exe`）。
- **选中规则**：`resolveActiveSkinId()` —— 存了 id 且皮肤存在就用它；什么都没存（新装 / id 失效）
  就播第一段内置皮肤；`{"active": null}` 是「显式不用皮肤」，兜底不会覆盖它。
  删除皮肤时如果它正被选中，走的是 `clearActiveSkin()`（回到内置默认），不是写成 null。
- **当前内置两段皮肤**：`assets/launch/qinghua`（青花瓷，12.28s / 2024×1080 / HEVC / ~16MB）与
  `assets/launch/whale-senren`（鲸鱼娘 · 千恋万花，12.25s / 2560×1440 / H.264 / ~44MB）。
  HEVC 那段靠平台硬件解码播它：Chrome 的 `canPlayType` 报不支持但本机实测能整段播完，
  没有 HEVC 解码的机器会走兜底计时器、等于没有动画；H.264 那段正好覆盖这种机器。
  **兜底默认是 `resolveActiveSkinId()` 里的 `listBuiltinSkins()[0]`（id 排序第一段）**，
  现在 `qinghua` 排在 `whale-senren` 前面所以默认没变 —— 以后加内置皮肤时留意 id 排序会把新的顶成默认。
- 路由（`src/host/routes.ts`，前缀 `/api/boot-animation`）：列表 / 选择 / 上传 / 删除 / 资产（带单段 Range）。
  **写操作限 loopback**（桌面端 LAN 模式会 bind 0.0.0.0）；读走平台自身的浏览器鉴权。
  资产路由的允许清单就是 manifest 本身：只服务 manifest 里点名的文件，越权路径与陌生文件名一律 404；
  响应带 `ETag` 并处理 `If-None-Match` → **304**（几十兆的视频不能每次开机重下）。
- **路由注册时机**：`apply()` 里先试一次（`ctx.get('webServer')`），再挂 `ctx.on('internal/service')`
  等 `webServer` 出现，最后才靠首次 index 注入兜底。**别只留注入那条** —— 缓存过的 index 或一次
  API 探测会在第一次页面渲染之前打进来，只靠它会 404。
- 规格：H.264 mp4、1920×1080、无音轨、几秒就够、≤8MB（视频每次开机都要下/播，越大开机越慢）。
  上传上限 `CUSTOM_SKIN_MAX_BYTES` = 256MB。
- **类型边界**：宿主半区用 node API，所以本包 `tsconfig.json` 是 `"types": ["node"]` 且 devDependency
  带 `@types/node`；只有纯 client 的包才是 `"types": []`。tsdown 不做类型检查，忘改就会在 CI 的
  `pnpm typecheck` 上炸。

## 本机操作的两个坑

- 跑真壳验证时注意 **`DSH_WEB_URL` 会从桌面客户端环境里继承**（它指向 :19387），
  必须显式覆盖成自己那个实例的 URL，否则 cookie 与端口对不上，页面会 401。
- **Windows 上别用 `fs.rmSync(递归)` 删 junction**：Node 把 junction 当目录，会**沿着链接删掉目标目录里的**
  文件（本包真的丢过一次 `AGENTS.md` / 海报 / `skin.json`）。要摘链接用 `cmd /c rmdir <link>`，
  或 `fs.unlinkSync`；同理，包目录被运行中的宿主/webview 占用时 `Move-Item` 会被拒（`intro.mp4` 就被占过），
  此时用「复制 + 回填 + 稍后清理」而不是硬改名。

## 安装契约（商店一键安装，别打破）

条目只带 `repo`（没有 `npm` 字段），商店的一键安装跑的是
`dsh plugin --profile <profile> add <repo-url>`：pnpm 把仓库拉到**用户机器上**再打包，
所以用户机器上能成立的东西只有仓库里已经有的东西。

- **不许有安装期构建脚本**（`prepare` / `preinstall` / `install` / `postinstall`）。
  2026-10-11 的两次安装失败就是 `prepare: tsdown` 造成的：先被 pnpm 11 的
  `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 拦下，放行之后又倒在
  `tsdown.config.ts` 的 `../../shared/tsdown.client.ts` —— 那条相对路径只在 dsh-web 主仓
  `packages/` 布局下成立。**`lib/` 已经提交，本来就不需要再构建。**
- **`lib/` 是发布产物，必须和 `src/` 一起动。** `scripts/lib-artifact-check.mjs` 记的是
  `src/` 的指纹、不是产物字节：客户端包会把仓内相对路径焊进 CSS Module 类名哈希，
  逐字节比对跨机器不成立（主仓 `scripts/lib-artifact-check.mjs` 出于同一个理由）。
- 改过 `package.json` 的 `exports` / `main` / `icon` / `dsh.bundle.patch` 之后，跑
  `node scripts/check-package-contract.mjs`：它检查「没有安装期脚本」「声明的路径都存在」
  「`lib/client.js` 的模块 id 没变」「`dsh.client.platform` 仍是 web」。
- CI（`.github/workflows/ci.yml`）跑上面两条 + typecheck + 测试，另加
  `pnpm run build:types && git diff --exit-code -- lib/types`（d.ts 是本仓唯一能精确复现的产物）。

## 验收（本仓可独立跑）

```sh
pnpm install --frozen-lockfile
pnpm run check:package-contract
pnpm run check:lib-artifacts
pnpm run build:types && git diff --exit-code -- lib/types
pnpm run typecheck
pnpm test
```

## 重建 lib/（只能在主仓布局里做）

要重建两个 bundle 时：把本包放进 dsh-web 主仓的 `packages/dsh-web-start-ui`
（复制或 junction 都行，`packages/*` 在 workspace 里），然后

```sh
pnpm install                                             # 主仓内
pnpm --filter @linxin666/dsh-web-start-ui build           # tsdown + tsc -p tsconfig.build.json
# 把产出的 lib/ 同步回本仓，再记指纹：
node scripts/lib-artifact-check.mjs --write
```

> 为什么不就地构建：`tsdown.config.ts` import 的是主仓的 `shared/tsdown.client.ts`，
> 而这个 preset 按「仓内相对路径」生成 CSS Module 类名哈希 —— 包不在
> `packages/dsh-web-start-ui` 这个位置时，产物和已提交的字节不一致。
> 已核对（2026-10-12）：按上面的位置重建，`lib/index.js` / `lib/client.js` /
> `lib/client.js.map` 与已提交版本逐字节相同。
