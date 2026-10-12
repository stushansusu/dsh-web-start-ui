# dsh-web-start-ui · DeepSeek Harness（DSH）Web GUI 启动动画插件

[English](README.md) | 中文

<p align="center">
  <img src="https://github.com/stushansusu/dsh-web-start-ui/actions/workflows/ci.yml/badge.svg" alt="CI">
  &nbsp;
  <img src="https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.2-4c6ef5?style=flat-square&amp;labelColor=454a54" alt="DSH">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="License">
</p>

<p align="center">
  <strong>DeepSeek Harness（DSH）启动动画</strong><br>
  <em>启动视频皮肤 · 壳还没画就先起播 · 点击或 Esc 跳过 · 自带设置页</em>
</p>

DSH Web GUI / 桌面端插件：打开界面时先看到一段**启动视频**，而不是一片尚未绘制的空白或半截界面；视频播完才落帘。包内自带一段皮肤，也可以自己上传；并在设置里占一个一级页面（设置 → 启动动画）。不改任何 DSH 源码，不请求任何第三方。

## 是什么

- **比界面更早起播。** 宿主半区往 index.html 里注入一段内联脚本，导航开始约 30ms 视频元素就已经在建、在取流。0.2.0-rc.2 真壳实测（用包内皮肤）：元素 3ms、元数据 211ms、起播 622ms，而界面自己首绘是 191ms —— 动画早就盖住它了。
- **接管而不是重播。** 浏览器半区接管的是同一个 `<video>` 元素，缓冲与 `currentTime` 都保留，不会跳回开头。
- **视频播完才落帘**（且不会早于壳首绘，等待有上限）。浏览器解不出的皮肤走兜底计时器落帘：坏视频永远不会变成挡在界面前面的一堵墙。
- **两个皮肤来源。** 一个随包发布，其余在设置页上传、也在设置页删除。见 [启动皮肤](#启动皮肤)。
- **随时可以跳过。** 点击任意处或按 Esc 立刻落帘。
- **跟随主题。** 明暗由壳的主题决定，并记住它供下次启动的底色使用；尊重 `prefers-reduced-motion`。

## 工作机制

| 半区 | 做什么 |
| --- | --- |
| 宿主（`src/index.ts`） | 提供启动皮肤目录与视频本体（`src/host/routes.ts`：列表 / 选择 / 上传 / 删除，以及支持 Range 的资产 GET；写操作除平台自身的浏览器鉴权外再限 loopback），并往服务出去的 index 里注入首屏：一个带当前皮肤 URL 的全局，加一段内联脚本，在模块图被请求之前就铺底、并把视频起播。 |
| 浏览器（`src/client/index.ts`） | 接管宿主已经起播的 `<video>`，把它包进帘幕（主题底色 + 跳过提示 + 淡出），移除它盖住的底色层，并注册设置分区。 |

交接刻意做得很窄：底色层 `pointer-events: none`、z-index 比真帘幕低一档，并在真帘幕出现的那一刻就被移除 —— 落帘是淡出到透明，留着底色层就会让界面回来时又冒出一层底。浏览器半区万一没装载也不会把界面永久盖住：那条注入脚本自带兜底移除。

## 启动皮肤

启动皮肤就是**一段视频**：一个目录里放一个 `skin.json` 清单 + 视频（可再带一张海报帧）。视频是唯一形态（没有风格引擎），所以没选皮肤就什么都不播。两个来源，同一种形状：

| 来源 | 放在哪 | 怎么进去 |
| --- | --- | --- |
| 内置 | 本包 `assets/launch/<id>/` | `node scripts/add-launch-skin.mjs <视频> --name "名字"`（可选 `--poster`、`--duration`、`--name-en`） |
| 自定义 | `<DSH_HOME>/launch-animations/<id>/` | 设置页：选一个文件，上传到宿主，立刻可选 |

选中的 id 是**宿主状态**（`<DSH_HOME>/launch-animations/state.json`），所以同一套安装下所有浏览器打开都是同一段开场；而且宿主能在**模块图还没请求之前**就把视频起播：服务出去的 index 里带着该皮肤的 URL 和一段内联脚本，脚本建 `<video>`、设 `src`、直接 `play()`。浏览器半区随后**接管这个元素本身**，不会重头播（0.2.0-rc.2 真壳实测：视频元素约 100ms 就在，界面自己首绘约 230ms，带动画的帘幕约 600ms）。

**选中规则。** 有显式选择就听选择；什么都没存过（新装、或存的 id 对应的皮肤已被替换）则播**第一段内置皮肤**。选「不用皮肤」写入的是显式 null，所以这个兜底不会覆盖用户的选择。资产路由带 `ETag`，装过一次之后二次启动是 304，不会再下一遍几十兆。

**当前内置：** `assets/launch/qinghua` —— 青花瓷 · 水墨，12.28s，2024×1080 HEVC，约 16 MB，带海报帧。这一个文件就是整个包下载量的大头（见[安装](#安装)），也是下面「规格建议」里体积预算的两倍。

> **编码提醒。** 这段皮肤是 HEVC（H.265），浏览器靠**平台硬件解码**播它。Chrome 的 `canPlayType('video/mp4; codecs="hvc1"')` 会报不支持，但只要机器有解码器就播得动（实测：元数据 211ms、整段播到 12.28s）。反过来，没有 HEVC 解码的机器上它会报错，兜底计时器落帘，等于没有动画。要覆盖所有机器就再加一段 H.264 皮肤：`node scripts/bake-skin-video.py <源视频> <输出目录> --width 1920 --crf 26 --tune animation` 会转成 H.264 并顺手抽一张海报帧。

**规格建议**（新皮肤）—— 这段视频首次使用要下载、每次开机都要播，是这个插件里唯一可能让界面**更慢**出现的资产：

| 项 | 建议 |
| --- | --- |
| 容器 | H.264 mp4（自定义上传也收 webm / mov） |
| 画面 | 1920×1080、无音轨 |
| 时长 | 几秒就够 —— 帘幕会等整段放完 |
| 体积 | 8 MB 以内 |
| 末帧 | 帘幕是从末帧淡出的，所以收在一个平静的画面上 |

自定义皮肤可以在设置页删除；内置的删不掉（它们是包内文件）。

## 设置项

| 项 | 取值 | 说明 |
| --- | --- | --- |
| 启用启动动画 | 开 / 关 | 关掉后直接进界面 —— 底色层也一起不出现。 |
| 启动皮肤 | 不用皮肤 · 内置皮肤 · 每个上传的皮肤 | 决定用哪段视频开场；自定义的在同一页上传与删除。 |
| 播放频率 | 每个会话一次 · 每次刷新 | 「会话」会在 sessionStorage 留一个标记。 |
| 点击任意处跳过 | 开 / 关 | Esc 始终可以落帘。 |
| 预览动画 | 按钮 | 立刻把选中的皮肤播一遍。 |
| 恢复默认 | 按钮 | 清掉本地播放偏好，回到默认值。 |

## 安装

本插件**刻意做成独立插件**：不并入 `@linxin666/dsh-web-all` 全家桶，所以它不会跟着全家桶一起装进来。想要启动动画的装，不想要的不用装，卸载也是一条命令。

### 1 · 装包

本包**还没发到 npm**，所以从仓库安装 —— 商店里没有 `npm` 字段的条目，一键安装跑的就是这条命令：

```sh
# Web 档案
dsh plugin --profile web add https://github.com/stushansusu/dsh-web-start-ui

# 桌面客户端档案
dsh plugin --profile desktop add https://github.com/stushansusu/dsh-web-start-ui

# 或者本地 checkout 开发时
dsh plugin --profile web add link:<本包目录>
```

> **安装体积约 17 MB，其中 16 MB 是随包那段皮肤**（约为上面「规格建议」里体积预算的两倍）。
> 视频每个安装只下一次，之后每次开机是 304 校验，不会重下。
>
> **安装时不需要构建。** `lib/` 已提交、按原样发布，整个安装过程不编译任何东西，
> 不需要编译器、不需要装工具链，也不会被 pnpm 的构建脚本门控拦下 ——
> 这条约定由 `scripts/check-package-contract.mjs` 与 CI 一起钉住。
>
> 要改插件？改完 `src/` 仍必须重新构建 `lib/`，而且**这个构建不能独立跑**：
> `tsdown.config.ts` 里的 `shared/tsdown.client.ts` 只存在于 dsh-web 主仓。
> 请在主仓里把本包放在 `packages/dsh-web-start-ui` 重建、把 `lib/` 拷回来，
> 再跑 `node scripts/lib-artifact-check.mjs --write`；`src/` 动过而指纹没刷新时 CI 会红。
> （`pnpm install` 与 typecheck / 测试在本仓可以独立跑。）

### 2 · 重启宿主

退出并重新打开桌面客户端，或重启 `dsh web`。插件的宿主半区是**启动时装载**的 —— 皮肤目录与「界面首绘前就把视频起播」都靠它，刷新页面不够。

### 3 · 打开设置页

**设置 → 启动动画。** 默认选中随包发布的那段皮肤（青花瓷 · 水墨）；点 **预览动画** 可以当场看一遍，也可以换成别的皮肤。

### 日常操作

| 我想… | 怎么做 |
| --- | --- |
| 换成自己的视频 | **添加自定义皮肤** → 选 mp4 / webm / mov（≤ 256 MB），上传到宿主后自动选中 |
| 什么都不播 | 选 **不用皮肤** |
| 永久关掉 | **启用启动动画** 开关，或直接卸载 |
| 再看一遍 | **预览动画** |
| 一个窗口只播一次 | 播放频率 → **每个会话一次** |
| 跳过这段 | 点击任意处，或按 **Esc** |
| 删掉上传的皮肤 | 那个格子上的 **删除** |

### 文件都在哪

| | |
| --- | --- |
| 随包皮肤 | `<安装目录>/node_modules/@linxin666/dsh-web-start-ui/assets/launch/<id>/` |
| 你上传的 | `<DSH_HOME>/launch-animations/<id>/`（默认 `~/.dsh/launch-animations`） |
| 当前选中的 | `<DSH_HOME>/launch-animations/state.json` |
| 播放偏好 | 浏览器本地存储 —— 见 [偏好存在哪](#偏好存在哪) |

### 卸载

```sh
dsh plugin --profile web remove @linxin666/dsh-web-start-ui
```

如果连上传的视频也一起清掉，删掉 `<DSH_HOME>/launch-animations` 即可。

## 偏好存在哪

刻意分成两半：

- **播放偏好**在浏览器里：`dsh:boot-animation:v1`（localStorage：启用、播放频率、点击跳过）、`dsh:boot-animation:theme`（localStorage：上次帘幕用的明暗 —— 底色层在壳的明暗属性出现之前唯一能知道主题的办法）、`dsh:boot-animation:played`（sessionStorage：每会话一次的标记）。
- **选中的皮肤与皮肤本体**是宿主状态：`<DSH_HOME>/launch-animations/state.json` 与 `<DSH_HOME>/launch-animations/<id>/` —— 这样同一套安装的所有浏览器打开都是同一段开场，宿主也才能在模块图被请求之前就把视频起播。两者都不写 profile 配置。

## 反馈 / 进群

<p align="center">
  <img src="docs/group-qrcode.jpg" alt="反馈群二维码" width="240">
</p>

扫码进群：**报 bug、提问题、投稿皮肤都走这里。** 报告问题时请带上三件事 —— 哪段皮肤（格子上的名字）、浏览器 / 客户端版本、动画到底有没有出现：这三条直接决定问题出在宿主路由、编码还是接管交接上。

## 许可

Apache-2.0

