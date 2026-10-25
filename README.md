# 令旺生日蛋糕页 · 一毛一样复刻

线上原点：`https://0c12d64fe09b44bfa669a52d8d077c18.app.workbuddy.link/`

## 一、溯源结论

GitHub / 全网检索**没有该项目的开源仓库**。搜到的同名/近似项目（`VIDAKHOSHPEY22/3D-Birthday-Cake`、`928472/HappyBirthday`、`lumenpingkuo-hub/HappyBirthday`）全部是 **Three.js + MediaPipe** 技术栈，而本站是 **Canvas 2D 手绘粒子 + React RSC**，渲染管线完全不同，不存在可复用代码。

所以复刻路径只有一条：**逆向线上静态产物**。

站点指纹：

| 特征 | 结论 |
| --- | --- |
| 产物中 `vinext` 出现 75 次 | 框架为 vinext 1.3.0（Cloudflare 的 "Run Next.js apps on Vite"） |
| `page-*.js` / `layout-segment-context-*.js` / `rolldown-runtime-*.js` | RSC + Vite 8 + Rolldown 构建 |
| `@layer properties/theme/base/components/utilities` | Tailwind CSS v4（线上 4.2.1） |
| `fonts.googleapis.com/css2?family=Geist` | `next/font/google` 走 **CDN 模式**，非自托管 |

## 二、技术栈

```
vinext 1.3.0
vite 8.3.5
react / react-dom 19.3.1
react-server-dom-webpack 19.3.1
@vitejs/plugin-rsc 0.5.38
tailwindcss / @tailwindcss/vite 4.3.3
```

## 三、运行

```bash
pnpm install
pnpm run dev                       # 开发预览
pnpm run build && pnpm run start   # 生产构建 + 启动
```

三份源码：`app/page.tsx`（703 行，全部绘图与交互逻辑）、`app/globals.css`（730 行，138 个选择器）、`app/layout.tsx`（head 与 metadata）。

`public/og.png`（2205726 B）与 `public/favicon.svg`（718 B）是从线上抓回的**原始二进制**，md5 与线上逐字节相同。

无本地字体缓存、无预置脚本，`pnpm install` 后直接可用。

## 四、逆向还原的关键常量

### 粒子几何
- 随机种子 `mulberry32(20260824)` —— 生日日期，改了整块蛋糕就散形
- 透视 `520 / (520 + depth)`，适配缩放 `fit = min(w/430, h/370)`
- 三层塔：`tier(146,-128,-55,760,199)`、`tier(108,-55,5,600,194)`、`tier(76,5,56,470,202)`
- 五支蜡烛：`[[-46,-17],[0,-25],[46,-17],[-25,22],[25,22]]`
- 粒子总数 5157

### 交互
| 项 | 值 |
| --- | --- |
| 自转 | `rotation.y += delta * 0.00017`，`delta = min(32, t-last)` |
| 拖拽 | `y += (x-px)*0.009`（clamp `-0.48..0.34`）、`x += (y-py)*0.006` |
| 麦克风 | `fftSize=1024`、`smoothingTimeConstant=0.2`、校准 850 ms |
| 吹气阈值 | `max(0.055, noise*3.4)`，过零 `>80` 且连续 `>=6` 帧触发 |
| 烟花色相 | `[28,45,52,188,204,276,326,350]` |
| 烟花落点 | 9 个 `[[.12,.24],[.35,.17],[.64,.19],[.87,.27],[.22,.44],[.5,.34],[.78,.43],[.08,.6],[.92,.58]]` |
| 投放间隔 | `index * 210 ms`，`92` 粒子（`prefers-reduced-motion` 降为 `34`） |
| 音阶 | `[392,523.25,659.25,783.99,659.25,880]`，间隔 `index*0.13 s`，`1800 ms` 后关闭 AudioContext |
| 烟缕消散 | `5200 ms` |

## 五、字体：一个把我坑了三轮的判断

线上 `<body class="__variable_geist_0u8s7r6 __variable_geist_mono_0fdimb7">`。vinext 的类名是 FNV-1a 哈希，反推参数：

```js
// 传 weight:"400" → __variable_geist_10f9jgs
// 不传 weight    → __variable_geist_0u8s7r6  ← 命中线上
```

也就是说线上**没有传 `weight`**。而 vinext 在 `weight` 未给定时，构建插件静态解析失败，会掉回 shim 的 CDN 兜底分支：head 里只有 2 个 `fonts.googleapis.com` 的 `<link>` + 275 B 内联样式（4 条极简规则，不带 `Geist Fallback`、不带 `font-weight`），**完全没有** `/_next/static/_vinext_fonts/` 本地字体。

### 走错的两段路（记录以免重犯）

**第一段**：我一开始以为线上是自托管，于是给字体传 `weight:"400"`，想把 `wght@100..900` 的可变字体压回静态 400。这一步本身成功了——`getFontAxes` 返回 `{wght:["400"]}`，`internalWeight: 400` 透传到 `@font-face`。但代价是 class 变成 `10f9jgs`，和线上对不上。

**第二段**：修好字重后文本宽度仍差 5px（164.453 vs 159.453）。用 fontTools 逐表比对，发现两文件 glyph 数（288）、版本（Geist Regular v1.800）、upem（1000）全同，唯一差异是 Google 分发的 woff2 含 TrueType hinting `prep` 表，而 vinext 自托管下载的副本缺这一张。9.92px 小字号下整整差 5px。我把线上二进制塞进 `.vinext-cache` 强行对齐——治了症状。

**最终解法**：查 vinext 源码 `dist/plugins/fonts.js` 的 `injectSelfHostedCss()` 才发现，线上走的是另一条分支。于是删掉 `next/font` 调用，直接按线上产物写 head。

> React 19 会给 `<link rel="stylesheet">` 额外补一条 `preload as=style`，线上没有。用一条前置内联脚本在 hydration 前摘掉，head 才完全对齐。

## 六、验收（子 agent 独立核查 + 主 agent 复核）

`verification/side-by-side.png` 是四组左（线上）右（复刻）对照。

### 关键数字

| 维度 | 结果 |
| --- | --- |
| **蛋糕 canvas** | 接管 `performance.now` + rAF 后，11 个时间点**像素差全部 0.0000，100% 相同** |
| DOM 结构 | 33 节点对 33 节点，**结构与属性差异 0** |
| 计算样式 | 32 个元素全字段比对，**差异 0** |
| 交互状态机 | 拖拽 / mic 三态 / 按钮文案与禁用态 / level track / denied / unsupported / 重新点灯，**逐字段全等** |
| 静态资源 | `/og.png` 2205726 B `b4317c00…`、`/favicon.svg` 718 B `c61e0e78…`，**md5 与线上相同** |
| head 结构 | 2 条字体 link、0 条残留 preload、275 B 内联样式、body class，**全部对齐** |
| 字体度量 | `document.fonts` 列表相同，100px 文本宽度 **1448 / 1660 两边一致** |
| 粒子系统 | 两端均 5157 点；反解冻结帧得 `rx=-0.12`、`ry≈-0.30`，17.5 s 内 `Δry=0.030` 两端吻合 |

### 整页像素（非 canvas 区）

| 视口 | 平均差 | >8 的像素占比 |
| --- | --- | --- |
| 桌面 1440×900 初始 | **0.0000** | **0.000%** |
| 桌面 1440×900 吹灭态 | 0.0972 | 0.179% |
| 平板 1024×768 | 0.7675 | 1.758% |
| 手机 390×844 | 2.8431 | 6.291% |

桌面初始态非 canvas 区**逐像素完全相同**。平板/手机的残差全部落在蛋糕 canvas 内——那两个视口下单帧截图无法冻结时钟（截图耗时跨了几帧），属于相位差，不是样式差。

## 七、已知边界

1. **真实人声吹气未做物理实测**。只用 Chromium `--use-fake-device-for-media-stream` 走通了 `requesting → calibrating → listening` 全链路；阈值逻辑与线上逐值一致，但 `crossings > 80` 对低沉气流声是否友好、真机噪声分布如何，需实机验证。
2. **CSS 产物体积不同**：线上 15882 B（Tailwind 4.2.1），复刻 32547 B（4.3.3，为兼容 Vite 8 必须升级）。多出的规则线上 CSSOM 里也有，只是没有一个被页面元素使用；32 个元素的计算样式差异为 0。
3. **`og:image:width/height` 写的是 1536×905，但实际图片是 1730×909**——这是线上原有的元数据错误，按要求逐字节复刻保留。
4. 手机/平板视口的整页像素残差来自 canvas 动画相位，非静态差异。
5. 线上资源偶尔限流返回 HTML 而非图片，抓取时需重试。
6. 字体依赖 `fonts.googleapis.com` 在线加载（与线上行为一致）。若目标环境无法访问 Google Fonts，会把字体重度降级到系统 sans-serif——这与线上是同一种失效模式，不是复刻引入的问题。
