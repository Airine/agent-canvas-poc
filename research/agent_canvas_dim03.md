# Agent Canvas 维度 03 调研：无限画布/节点编辑器前端技术选型与多层级渲染方案

- 调研范围：React Flow (xyflow)、tldraw SDK、Excalidraw、LiteGraph.js、Rete.js、Drawflow、Flutter/原生方案；渲染架构与分层、性能上限与虚拟化、Semantic zoom/LOD、节点内嵌活内容（iframe/WebRTC/视频流）、全屏专注模式、minimap/视口/协作光标。
- 调研方法：35+ 次独立中英文搜索，优先官方文档、GitHub issue/discussion、工程博客。
- 调研日期：2026（搜索索引中最新文档时间戳至 2026 年）。

---

## 一、技术选型对比表

| 框架 | 渲染架构 | 分层设计 | 虚拟化/裁剪 | 性能上限（节点量级） | Semantic zoom / LOD | 节点内嵌活内容 | 画布基础设施 | 适配 agent canvas 程度 |
|---|---|---|---|---|---|---|---|---|
| **React Flow 12 (xyflow)** | DOM（节点=HTML div，边=SVG）+ CSS transform 缩放（d3-zoom），zustand 状态 | 背景(Background)/节点层/边(SVG)层/Panel UI 层 | `onlyRenderVisibleElements` 内置视口裁剪 | <100 默认流畅；100–500 需开裁剪；500–1000 需简化节点；>1000 需 LOD/WebGL（见 C2、C3） | 官方 Contextual Zoom 示例（按 zoom 换内容） | 任意 React 组件（iframe/视频/终端均可），`nodrag`/`nopan` 类解决事件冲突 | MiniMap/Controls/Background/Panel 内置；fitView/minZoom/maxZoom API 完整 | ★★★★★ 节点即卡片+活窗口场景的首选之一 |
| **tldraw SDK (v3/v5)** | DOM 渲染器（每 shape 一个 React 组件）+ Canvas 2D 叠加层 + SVG；@tldraw/state (Signia) 信号系统 | 背景/世界(HTML shape 层)/overlay canvas(选择框、画笔)/UI 面板层；协作光标 DOM 层夹在 canvas 与 UI 之间 | 空间索引视口裁剪（display:none），10,000 shapes 只渲染 ~50 个 | 官方默认 maxShapesPerPage=4000（可调至 10000+）；>500 shapes 自动启用防抖 zoom | 内置 LOD：`getEfficientZoomLevel`、内置 shape 低 zoom 简化、图片分辨率 LOD | 一等公民 embed shape（iframe，YouTube/Figma/Maps…），双击进入交互模式 | @tldraw/sync 多人协作、presence/光标/viewport following；focus mode 内置 | ★★★★★ 白板型无限画布最完整底座；注意生产许可 |
| **Excalidraw** | Canvas 2D（rough.js 手绘风），双 canvas（元素层+UI 层） | 元素 canvas / UI canvas（选择框、远程光标） | 已有 culling，但每帧重绘整个视口 | M1 Air：4–8k 元素流畅，10–14k ~30FPS，Firefox 14–24k 不可用（见 C7） | 无官方 LOD | 有 embeddable/iframe 元素类型（曾有 srcdoc XSS CVE） | 协作、E2E 加密；扩展性弱、无插件体系 | ★★☆ 不适合"节点卡片+活窗口"，适合手绘草图 |
| **LiteGraph.js** | 单 Canvas2D 即时模式渲染 | 背景/节点/连线前景单次绘制；DOMWidget 在 canvas 上叠 HTML 层 | 视口外不绘制（draw 遍历裁剪） | 官方定位"数百节点"；ComfyUI 实测大工作流仍流畅（canvas 非瓶颈，见 C11） | ComfyUI 实践：低质量渲染 zoom 阈值（默认 0.6） | DOMWidget 可嵌 video/div，但需手动同步位置缩放；Live mode | 无内置 minimap/协作；ComfyUI 自研 minimap 曾成性能热点 | ★★★ 性能强但活内容嵌入成本高；ComfyUI 正迁向 DOM(Vue) |
| **Rete.js v2** | 核心与渲染分离；渲染插件化（React/Vue/Angular/原生） | area-plugin 负责视口；渲染层可替换 | 无内置虚拟化 | 取决于渲染层实现；官方无明确指标 | 无内置，可自行用 zoom 信号实现 | 取决于所选渲染器（React 渲染器=DOM，可嵌任意内容） | 框架无关；Editor/Engine 分离可服务端执行 | ★★★ 适合需要"可视化编程+服务端执行"的场景 |
| **Drawflow** | 纯 DOM（节点=HTML 字符串）+ SVG 连线，vanilla JS | 单层 DOM + SVG | 无 | 小图（数十节点）级；无虚拟化、无 LOD，zoom 仅 0.5–1.6 | 无 | 节点 HTML 任意（可放 iframe），`df-*` 数据同步 | 无 minimap/协作；editor_mode edit/fixed/view | ★★ 仅适合轻量原型 |
| **Flutter / 原生（canvas_kit、infinite_canvas、graph_edit、Vyuh Node Flow）** | Flutter Widget + CustomPainter（Skia/Impeller）；世界/视口双坐标系 | backgroundBuilder / CanvasItem 世界层 / overlay；Matrix4 变换 | Vyuh Node Flow 宣称视口虚拟化+LOD+Viewport Culling | "数百节点 60fps"（Vyuh 宣称，未独立验证） | Vyuh 列出 Level of Detail 特性 | **Web 端致命短板**：iframe/WebRTC 只能走 PlatformView(HtmlElementView)，组合/手势/性能坑多（推断，置信度中低） | Vyuh 有 minimap、auto-pan；生态远弱于 Web | ★★ 仅当目标平台是原生桌面/移动时考虑 |

---

## 二、设计启示（7 条）

1. **节点要内嵌 iframe/视频流/终端，就必须选 DOM 渲染架构（React Flow 或 tldraw），纯 Canvas/WebGL 路线（LiteGraph、Excalidraw、Flutter）与"活窗口"本质冲突。** ComfyUI 从 LiteGraph Canvas 迁向 Vue DOM（Nodes 2.0）正是因为 Canvas "限制 UI 表达能力"；但其 DOM 化在中大型工作流上又引发 60→<5 FPS 的性能回退——这预示了 agent canvas 的核心矛盾，必须用虚拟化+LOD+裁剪豁免来化解（见 C11、C12）。
2. **"全局摘要 → 默认卡片+活窗 → 专注全屏"三态可直接映射为 Semantic zoom/LOD 体系 + 一个应用层全屏态。** 业界成熟模式是按 zoom 阈值切换节点详略：tldraw `getEfficientZoomLevel`、yFiles 三级 detail/intermediate/overview 样式、React Flow 官方 Contextual Zoom、ComfyUI 低质量渲染阈值 0.6。阈值建议用"节点屏幕像素尺寸"而非绝对 zoom（tldraw `shape.props.w * zoom < 50` 模式），且 zoom 值必须防抖，否则缩放中途全图重渲染卡顿（见 C16–C21）。
3. **视口虚拟化与活内容存在根本冲突：被裁剪/unmount 的 iframe 会被浏览器冻结，display:none 会暂停其 JS 与解码。** 解法：(a) 对"活节点"豁免裁剪或降级为快照占位（tldraw 对选中/编辑中的 shape 永不裁剪）；(b) 隐藏时保持 iframe 渲染并用遮罩盖住，而非 display:none/opacity:0/clip-path（实测前三种均被浏览器优化冻结）（见 C30、C5、C4）。
4. **拖拽/平移与 iframe 事件穿透冲突有两个标准解法，建议都做**：(a) tldraw embed 模式——单击=选中形状，双击/Enter 进入"交互模式"指针事件透传 iframe，Esc/点外部退出；(b) 拖拽开始时 `pointer-events:none`、mouseup 恢复（否则 mousemove 被 iframe 吞掉）；React Flow 用 `nodrag`/`nopan` class 标记可交互子元素（见 C25、C26、C27）。
5. **专注/全屏模式必须复用同一个活内容实例：移动 DOM 节点，不要重挂载。** Adobe React Spectrum 的全屏+Portal 讨论给出定论式建议："Move the DOM node; do not re-target the React portal. Otherwise: remount, iframe reload, focus loss." 即全屏态用 React Portal 把**同一个 DOM 子树**（含 iframe/video/终端）搬到全屏容器，或提升 z-index/变换放大原节点；任何 unmount/remount 都会导致 iframe 重载、WebRTC 断流、终端会话丢失（见 C33、C34）。
6. **CSS transform 缩放是 DOM 画布的标配，但对活内容有三个坑**：(a) iframe/canvas 内部鼠标坐标需乘 1/zoom 校正（React Flow 官方文档确认）；(b) 放大时内容模糊（WebKit 对含 fixed 定位内容的 iframe 有长期 bug）；(c) 每个被 scale 的 iframe 都是独立合成层，数量多时 GPU 合成开销大——ComfyUI 实测显示浏览器合成器与 GPU 任务竞争可使生成慢 30–60%。建议低 zoom 时把活窗降级为静态缩略图（见 C28、C29、C11）。
7. **minimap 用 Canvas 画点，不要渲染真实节点；协作光标/ presence 用独立通道 60fps 合批。** 反例：React Flow 默认 MiniMap 在 10k 节点时致命（VisualFlow 改为 Canvas 像素点）；ComfyUI minimap 每帧全量扫描+JSON.stringify 所有连线成为热点。正例：tldraw/sync 的 presence 记录独立存储不持久化、服务端 60fps 合批广播（见 C33–C36）。

---

## 三、分维度调研结论（Claim / Source / URL / Date / Excerpt / Context / Confidence）

### 1. 渲染架构、分层设计、性能上限、虚拟化

**C1. React Flow 是 DOM 架构：节点为 HTML div、边为 SVG，缩放平移由 d3-zoom/d3-drag 驱动 CSS transform，内部状态用 zustand。**
- Source: reactflow npm 官方包说明（Credits）
- URL: https://www.npmjs.com/package/reactflow
- Date: 2024-06-20（页面快照）
- Excerpt: "Under the hood, React Flow depends on these great libraries: d3-zoom - used for zoom, pan and drag interactions with the graph canvas; d3-drag - used for making the nodes draggable; zustand - internal state management"
- Context: 官方包文档确认渲染与交互底座。React Flow 官方 troubleshooting 文档进一步确认 "React Flow uses CSS transforms to scale nodes as you zoom in and out"（见 C29）。
- Confidence: 高

**C2. React Flow 内置视口虚拟化 `onlyRenderVisibleElements`，仅渲染视口内节点和边。**
- Source: React Flow 官方文档（Svelte Flow API reference，同 xyflow 代码库）+ Synergy Codes 工程博客
- URL: https://svelteflow.dev/api-reference/svelte-flow ; https://www.synergycodes.com/blog/react-flow-everything-you-need-to-know
- Date: 2026-08-24 / 未标注
- Excerpt: "onlyRenderVisibleElements | boolean — You can enable this optimisation to instruct Svelte Flow to only render nodes and edges that would be visible in the viewport. This might improve performance when you have a large number of nodes and edges but also adds an overhead."；"React Flow offers built-in support for virtualization… skips rendering nodes and edges that are outside the viewport"
- Context: React/Svelte 同一 xyflow monorepo，prop 语义一致。对 agent canvas 意味着"全局模式下千级节点卡片"可行，但需配合 C3 的 LOD。
- Confidence: 高

**C3. React Flow 性能分档经验：<100 默认；100–500 开 onlyRenderVisibleElements；500–1000 简化自定义节点减少 DOM；>1000 考虑虚拟化+WebGL 替代。实测 100 个默认节点拖拽降至 ~10FPS，100 个"重"节点降至 2FPS（优化后可回 35–40FPS）。**
- Source: React Flow 架构技能库（社区整理的性能分档表）；Synergy Codes 工程师 Medium 长文
- URL: https://skillselion.com/skills/existential-birds/beagle/react-flow-architecture ; https://medium.com/@lukasz.jazwa_32493/the-ultimate-guide-to-optimize-react-flow-project-performance-42f4297b2b7b
- Date: 2026-07-21 / 未标注
- Excerpt: "|Nodes|Strategy| < 100 Default settings | 100-500 Enable onlyRenderVisibleElements | 500-1000 Simplify custom nodes, reduce DOM elements | > 1000 Consider virtualization, WebGL alternatives|"；"100 default nodes: Decrease to 10 FPS. 100 'heavy' nodes: Decrease to 2 FPS. … 35–40 FPS"
- Context: 分档表为社区二次整理（与 xyflow 官方性能指南口径一致）；Medium 实测数据说明"节点内嵌重内容（iframe/视频）时百级节点就会撞墙"——这正是 agent canvas 默认模式必须做 LOD 的直接证据。
- Confidence: 中（分档为社区整理）、高（实测趋势）

**C4. 虚拟化的失效边界：缩到全局视图时所有节点都进入视口，虚拟化被绕过；10k 节点场景必须叠加语义缩放 LOD。**
- Source: VisualFlow 工程博客《Architecting for Massive Scale in React Flow》
- URL: https://www.visualflow.dev/blogs/scale-studio-pro
- Date: 2026-05-24
- Excerpt: "When a user zooms all the way out to see the entire 10,000 node map, every node becomes visible, bypassing the virtualization logic and instantly crashing the page… you listen to the React Flow useStore hook to track the current zoom level. If the zoom level drops below 0.5, you swap out your complex React components for a drastically simplified, lightweight placeholder node—perhaps just a solid colored div. This reduces the DOM complexity by orders of magnitude."
- Context: 直接对应 agent canvas "全局模式"——全局摘要卡片本质就是 LOD 占位节点，而非虚拟化能解决的问题。
- Confidence: 中高（厂商博客，方案与 xyflow 官方建议一致）

**C5. tldraw 渲染架构：DOM 渲染器（每个 shape 一个 React 组件）+ 空间索引视口裁剪（display:none），官方称 10,000 shapes 时可能只渲染 50 个。**
- Source: tldraw 官方性能文档（tldraw.dev/sdk-features/performance，GitHub docs mdx）
- URL: https://tldraw.dev/sdk-features/performance ; https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/performance.mdx
- Date: 2026-01-31
- Excerpt: "The editor maintains a spatial index that tracks which shapes are visible, and hides off-screen shapes by setting display: none on their DOM elements. This means a canvas with 10,000 shapes might only render 50 if the rest are out of view… Selected shapes and the shape being edited are never culled."
- Context: tldraw GitHub README 自述 "DOM canvas — web rendering supports anything the browser supports, including embedded websites from YouTube, Figma, GitHub"（https://github.com/tldraw/tldraw）。注意 display:none 裁剪对 iframe 活内容意味着冻结——需要豁免策略（见启示 3）。
- Confidence: 高

**C6. tldraw 分层：背景/Grid 组件层 → HTML shape 世界层（CSS transform 随相机）→ Canvas 2D overlay 层（选择框/手柄/吸附线/协作光标提示）→ 协作光标 DOM 层（canvas 之上、UI 面板之下）→ UI 面板层。**
- Source: tldraw 官方文档 Overlay utils / Cursors / Custom canvas components；社区架构教程（johnxie/awesome-code-docs）
- URL: https://tldraw.dev/sdk-features/overlay-utils ; https://tldraw.dev/sdk-features/cursors ; https://tldraw.dev/examples/custom-components ; https://github.com/johnxie/awesome-code-docs/blob/main/tutorials/tldraw-tutorial/02-editor-architecture.md
- Date: 2026-01-31 前后 / 2025-09-04
- Excerpt: "Overlay utils render ephemeral UI on the canvas — selection handles, brush rectangles, snap lines, scribbles… They draw directly to a <canvas> element using the Canvas 2D API"；"Remote cursors render as DOM elements in a dedicated layer stacked above the canvas and below the UI panels. A collaborator whose cursor is outside your viewport shows as a small hint arrow clamped to the viewport edge"；"The HTML layer applies CSS transforms based on the camera position, achieving smooth panning and zooming without re-rendering shapes."
- Context: 这是题目所问"tldraw 背景/世界/叠加/UI 层"的官方依据。agent canvas 可直接套用此四层模型：背景网格层 / 节点世界层 / 覆盖绘制层（框选、连线预览）/ UI 层。
- Confidence: 高

**C7. Excalidraw：Canvas 2D + rough.js，双 canvas（元素层 + UI 层），有 culling，但每帧重绘整个可见视口；实测 M1 Air Chrome 4–8k 元素流畅、10–14k 降至 ~30FPS、Firefox 14–24k 不可用，元素变更 ~10FPS。**
- Source: GitHub excalidraw issue #8136（含基准）、issue #6262（双 canvas 拆分）
- URL: https://github.com/excalidraw/excalidraw/issues/8136 ; https://github.com/excalidraw/excalidraw/issues/6262
- Date: 2024-06-13 / 2023-02-18
- Excerpt: "From 4k-8k Object performs quite well, when it gets to 8k starts to struggle… From 10-14k Objects noticed the FPS dropped significantly (~30FPS)… Mutating and Managing Objects gets really slow (~10FPS)"；"we should have at least 2 <canvas> elements: one for elements (shapes) themselves. Sitting below. one for UI things, such as selection/bounding boxes, remote client cursors, etc. Sitting above."
- Context: 双 canvas（内容/交互 UI 分离）是多层级渲染的经典手法，与 tldraw 的 shape 层/overlay 层同构；Excalidraw 无节点内嵌 DOM 能力，不适合活窗口场景。
- Confidence: 高

**C8. Excalidraw 重绘模型：每帧重绘整个可见视口，"hundreds of elements 流畅，thousands 明显变慢"。**
- Source: pkgpulse 对比评测（Excalidraw vs tldraw vs Miro SDK 2026）
- URL: https://www.pkgpulse.com/blog/excalidraw-vs-tldraw-vs-miro-sdk-collaborative-2026
- Date: 2026-03-09
- Excerpt: "Excalidraw uses a rough.js canvas renderer that redraws the entire visible viewport on every frame — performant for hundreds of elements but noticeably slow for diagrams with thousands of elements. Tldraw uses a hybrid approach with SVG for interactive elements and Canvas 2D for performance-critical rendering, combined with spatial indexing that only renders elements in the current viewport… tldraw's level-of-detail system simplifies small elements when zoomed out."
- Context: 第三方对比，定量部分以 C7 官方 issue 为准。
- Confidence: 中

**C9. LiteGraph.js：单 Canvas2D 即时模式渲染，官方定位"优化以支持数百节点"，带 Live mode（隐藏图形、节点自绘 UI）与 DOMWidget（canvas 上叠 HTML 层）。**
- Source: LiteGraph.js GitHub README；ComfyUI-Lora-Manager DOMWidget 开发指南
- URL: https://github.com/jagenjo/litegraph.js/ ; https://git.aehoo.net/alphard/ComfyUI-Lora-Manager/src/commit/5e91073476effc6280ea61c2a6414c473537cc0d/docs/dom_widget_dev_guide.md
- Date: README 长期有效 / 2026-08-15
- Excerpt: "Renders on Canvas2D (zoom in/out and panning…) Optimized to support hundreds of nodes per graph"；"Live mode system (hides the graph but calls nodes to render whatever they want, useful to create UIs)"；"It maintains an HTML layer on top of the Canvas, making complex interactions and media displays significantly easier to implement than pure Canvas drawing."
- Context: "Live mode" 与 agent canvas 的"专注模式"概念同构（隐藏图、只留节点 UI）；"数百节点"是官方自报上限。
- Confidence: 高

**C10. LiteGraph 大图的已知瓶颈与优化：>500 节点或高连线复杂度时未优化会 CPU>80%、<15fps；工程对策为事件节流、增量渲染、拖拽时简化渲染（关阴影、连线降级直线）。**
- Source: CSDN 工程博客（LiteGraph.js 高性能交互处理）
- URL: https://blog.csdn.net/gitblog_01010/article/details/154329809
- Date: 2025-11-03
- Excerpt: "在节点数量超过500个或连线复杂度较高时，原始事件处理会导致：CPU占用率飙升至80%以上、帧率下降至15fps以下… LiteGraph.js通过三级优化策略解决：事件节流、增量渲染、状态缓存… 拖拽时简化渲染：临时禁用节点阴影、连线使用简化的直线渲染模式"
- Context: 中文二手工程文，数字为作者实测（i5-8250U/300 节点），方向性可信。
- Confidence: 中

**C11. ComfyUI 案例（上）：Canvas(LiteGraph) 本身不是性能瓶颈——实测 `pause_rendering=true` 对推理速度无影响；真正的开销是装饰性 CSS 动画引发的 GPU 合成器竞争（~47%）、实时预览流（~23%）、进度事件驱动的 DOM 更新（~30%）。**
- Source: GitHub Comfy-Org/ComfyUI_frontend issue #14599（含逐层 profile 数据）
- URL: https://github.com/Comfy-Org/ComfyUI_frontend/issues/14599
- Date: 2026-08-03
- Excerpt: "The slowdown is not caused by LiteGraph canvas rendering, the minimap, or Vue Nodes. It decomposes into three independent layers: 1. Browser GPU compositing competing with CUDA… (~47%). 2. Live preview stream (~23%). 3. Progress-event-driven DOM updates (~30%). … pause_rendering = true changed nothing"
- Context: 对 agent canvas 的警示：大量节点同时播放视频/运行动画时，**浏览器合成器与 GPU 任务的竞争**会成为隐性瓶颈；低 zoom/全局模式应暂停活内容（降级缩略图）。
- Confidence: 高

**C12. ComfyUI 案例（下）：Nodes 2.0 把节点从 Canvas 改为 Vue DOM 后，中大型工作流出现 60+→<5 FPS 的掉帧——"每节点一 DOM 子树"在规模下的风险被官方与社区同时确认。**
- Source: GitHub ComfyUI_frontend issue #10831；ComfyUI 官方 Nodes 2.0 文档/博客
- URL: https://github.com/Comfy-Org/ComfyUI_frontend/issues/10831 ; https://docs.comfy.org/interface/nodes-2 ; https://blog.comfy.org/p/comfyui-node-2-0
- Date: 2026-04-02 / 2026-08-26 / 2025-12-04
- Excerpt: "rendering node graphics as individual DOM elements introduces significant performance and interaction problems… fps drops from 60+ down to below 5 regularly"；官方："Performance: Still optimizing toward Canvas-level performance."
- Context: 这是 DOM 派最重要的反面教材，直接支撑"虚拟化 + LOD + 活内容降级"三件套的必要性。React Flow/tldraw 的 DOM 架构能成立，靠的正是裁剪与 LOD 而非 DOM 本身。
- Confidence: 高

**C13. Rete.js v2：TypeScript-first 重写，核心（@retejs/core）与渲染严格分离，渲染插件支持 React/Vue/Angular；Editor（可视化）与 Engine（执行）分离，图可在服务端无头执行。无内置虚拟化/LOD，性能取决于所选渲染层。**
- Source: Rete.js 官方迁移文档；作者 Medium 文章
- URL: https://retejs.org/docs/migration/ ; https://medium.com/@ni55an/rete-js-2-visual-programming-for-react-js-angular-and-vue-js-d36d7abe0f46
- Date: 2023-04-24（Medium）
- Excerpt: "V2 strictly separates the core logic from the rendering (area-plugin, render-utils, or framework-specific renderers)… Plugin-First Architecture"；"an alternative to event-based architecture and a cascading plugin system… signals… transmitted from the parent plugin to all child plugins"
- Context: 选 React 渲染插件则等价于 DOM 架构，活内容嵌入能力与 React Flow 类似，但画布基础设施（minimap、虚拟化、协作）都要自建。
- Confidence: 高

**C14. Drawflow：vanilla JS、零依赖，节点=HTML 字符串/注册组件（支持 Vue 组件），SVG 连线，无虚拟化/无 LOD，zoom 范围仅 0.5–1.6，有 edit/fixed/view 三种编辑器模式。**
- Source: Drawflow GitHub README
- URL: https://github.com/jerosoler/Drawflow
- Date: 2024-09-03（最近更新）
- Excerpt: "Vanilla javascript (No dependencies)… Zoom in / out… Editor mode edit, fixed or view… editor.zoom_max = 1.6; editor.zoom_min = 0.5; … var html = `<div><input type='text' df-name></div>`; editor.addNode('github', 0, 1, 150, 300, 'github', data, html);"
- Context: DOM 架构使其天然可放 iframe，但缺少一切大图基础设施，仅适合数十节点级原型。项目维护频率低。
- Confidence: 高

**C15. Flutter/原生：世界/视口双坐标系 + Matrix4 变换是标准模式（canvas_kit）；InteractiveViewer+CustomMultiChildLayout 社区方案强调 tiling、viewport culling、lazy child generation；商业级 Vyuh Node Flow 宣称虚拟化视口渲染、Level of Detail、Viewport Culling、"数百节点 60fps"。**
- Source: canvas_kit GitHub README；rodydavis Flutter infinite canvas 方案（技能市场收录）；Vyuh Node Flow 官网
- URL: https://github.com/vento007/canvas_kit ; https://lobehub.com/en/skills/rodydavis-skills-snippets_flutter-infinite-canvas ; https://flow.vyuh.tech/
- Date: 2026-03-06（技能市场）/ 官网未标注
- Excerpt: "world/viewport layers, draggable items, boundaries, and high‑performance rendering… Solves coordinate transformation math for you"；"strategies for performance (tiling, viewport culling, and lazy child generation)"；"Virtualized viewport rendering… Render hundreds of nodes at 60fps with optimized virtualization and efficient canvas rendering… Level of Detail, Viewport Culling"
- Context: Vyuh 数字为厂商宣称，未独立验证。Flutter Web 端嵌 iframe/WebRTC 只能走 HtmlElementView/PlatformView，存在合成与手势冲突的已知限制（此条为基于 Flutter 平台常识的推断，未单独检索验证，置信度中低）。若 agent canvas 目标是 Web，Flutter 方案基本可排除。
- Confidence: 中（性能宣称）/ 中低（Web 端活内容限制，推断）

### 2. Semantic zoom / Level-of-detail（节点内容随缩放切换详略）

**C16. tldraw 官方 LOD 体系：(a) `Editor.getEfficientZoomLevel()` 在文档 >500 shapes 时（`debouncedZoomThreshold`）相机运动中返回稳定 zoom，停止后才更新真值，避免缩放中途全图重渲染；(b) 内置 shape 低 zoom 自动简化（便签去阴影、虚线变实线、纹理填充变纯色、zoom<0.35 关文字描边）；(c) 图片按屏幕尺寸阶梯式降分辨率（4000px 图在 200px 显示时只加载 250px×dpr）。**
- Source: tldraw 官方性能文档
- URL: https://tldraw.dev/sdk-features/performance ; https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/performance.mdx
- Date: 2026-01-31
- Excerpt: "On documents with many shapes, recalculating everything mid-zoom causes jank. The editor provides Editor#getEfficientZoomLevel, which returns a stable value during camera movement when the document has more than 500 shapes… Sticky notes drop their box shadow… Dashed and dotted freehand strokes render as solid lines… A 4000px-wide photo zoomed out to take up 200px on screen has a screen scale of 0.05, which steps up to 0.0625, so you'd serve a 250px-wide image (times dpr)"
- Context: "zoom 防抖 + 屏幕尺寸阈值 + 资源分辨率分级"三件套可直接移植到 agent canvas 的全局/默认态切换。
- Confidence: 高

**C17. tldraw 自定义 shape 的 LOD 推荐模式：用"屏幕像素尺寸"（shape 宽 × zoom）做阈值，小于 ~50px 时渲染简化版。**
- Source: tldraw 官方性能文档（Simplify at small sizes）
- URL: https://tldraw.dev/sdk-features/performance
- Date: 2026-01-31
- Excerpt: "const isSmall = useValue('is small', () => { const zoom = editor.getEfficientZoomLevel(); return shape.props.w * zoom < 50 }); if (isSmall) { return <rect … /> } return <ComplexShapeContent shape={shape} />"
- Context: 屏幕尺寸阈值优于绝对 zoom 阈值——不同尺寸节点在同一 zoom 下应呈现不同详略。agent canvas 可设两档阈值：屏幕宽 <80px→全局摘要卡；80–400px→卡片+活窗（或快照）；进入专注→全屏活窗。
- Confidence: 高

**C18. React Flow 官方 Contextual Zoom 示例：自定义节点读取 zoom（useViewport/useStore），在内容视图与占位视图间切换。**
- Source: reactflow.dev 官方示例
- URL: https://reactflow.dev/examples/interaction/contextual-zoom
- Date: 2026-08-31（页面快照）
- Excerpt: 示例中 ZoomNode 按当前 zoom "toggle content and placeholder"（`defaultViewport = { x: 0, y: 0, zoom: 1.5 }`，节点 data.content 随 zoom 切换渲染）
- Context: 官方背书的最小实现；社区（C4）进一步给出 zoom<0.5 换纯色 div 的生产实践。
- Confidence: 高

**C19. yFiles 的 LOD 是商业图表库的成熟参照：三级 detail/intermediate/overview，每级 = 阈值 + 样式；且可按 zoom 在 WebGL（远景、硬件加速）与 SVG（近景、高保真）两种渲染模式间切换（SVG threshold 可配 ≥25%/50%/100%）。**
- Source: yFiles 官方 LOD demo 页；yFiles WebGL2 文档；性能调优页
- URL: https://www.yfiles.com/demos/style/level-of-detail-style/ ; https://docs.yworks.com/yfiles-html/dguide/advanced/webgl2.html ; https://www.yfiles.com/resources/how-to/smooth-visualization-of-large-diagrams-in-javascript
- Date: 2026-01-23（WebGL2 文档）
- Excerpt: "three levels of zooming are implemented: detail level, intermediate level and overview level… In overview level, only the basic information is rendered"；"you can switch between the two rendering modes depending on the zoom level… The Large Graphs demo showcases the level of detail switch from WebGL to SVG rendering and vice versa."
- Context: "三级详略 + 阈值"与题目三态（全局/默认/专注）结构同构；"按 zoom 换渲染器"是更激进的变体。yFiles 同时印证 LOD 对性能的意义："render the item details only when zoomed-in above a certain threshold… When zoomed-out, more items are visible and have to be rendered, making it necessary to switch to a plain visualization."
- Confidence: 高

**C20. ComfyUI/LiteGraph 的低质量渲染阈值：zoom 低于阈值（默认 0.6，可调 0.1–1.0）时节点进入低质量渲染模式以省内存减卡顿。**
- Source: ComfyUI 官方设置文档（LiteGraph Canvas Settings）
- URL: https://docs.comfy.org/interface/settings/lite-graph
- Date: 2026-09-02
- Excerpt: "Low quality rendering zoom threshold — Default Value: 0.6… When rendering the interface, especially when the workflow is particularly complex… you can control elements to enter low quality rendering mode when scaled to a specific percentage, thereby reducing memory consumption."
- Context: Canvas 阵营同样收敛到"按 zoom 降质"的 LOD 模式；另有 Maximum FPS 限帧设置（活内容密集画布可借鉴）。
- Confidence: 高

**C21. 3D 场景的语义缩放研究（ExplorViz 硕士论文）：用 Semantic Zoom Manager 按相机距离在离散 LoD 间切换，聚类预处理降低运行时计算——"离散档位 + 管理器统一调度"模式。**
- Source: GEOMAR 仓库硕士论文《Semantic Zoom With Immersive Detail View for ExplorViz》
- URL: https://oceanrep.geomar.de/61118/1/MSc-Bamberg.pdf
- Date: 未标注（检索快照）
- Excerpt: "The Semantic Zoom enables the concealment and revelation of information based on the distance between the camera and the object… A manager instance was utilized to switch between the discrete Level of Details (LoDs) based on the camera distance to the cluster centroids."
- Context: 佐证"集中式 LOD 管理器"优于各节点各自为政——agent canvas 可实现一个 ViewModeManager 统一下发 global/default/focus 档位，避免每节点独立监听 zoom 造成 N 个订阅。
- Confidence: 中

### 3. 节点内嵌活内容（iframe / WebRTC / 视频流 / 终端）的工程实践与坑

**C25. tldraw embed shape 是"节点内嵌 iframe"最完整的官方参照：(a) 支持 YouTube/Figma/Google Maps/CodePen 等 20+ 服务 + 粘贴任意 iframe HTML 自动提取 src；(b) 交互模型：单击=选中形状，双击/Enter 进入编辑模式后指针事件才透传 iframe，Esc/点外部退出；锁定的 embed 仍可交互（canEditWhileLocked）；(c) 未知来源 iframe 用更严格 sandbox（禁 allow-same-origin/forms/popups）；(d) SVG 导出时 embed 渲染为占位矩形。**
- Source: tldraw 官方 Embed shape 文档
- URL: https://tldraw.dev/sdk-features/embed-shape
- Date: 检索快照 2026
- Excerpt: "Clicking an embed selects the shape rather than interacting with the content. Double-click it (or press Enter while it's selected) to enter editing mode. In editing mode, pointer events pass through to the iframe… Iframes pasted this way receive a stricter sandbox than the built-in providers (unknownEmbedShapePermissionOverrides: no allow-same-origin, no forms, no popups)… Embed shapes render as blank rectangles in SVG exports."
- Context: "选中态/交互态分离"直接回答了 agent canvas 默认模式下"卡片可拖动 vs 窗口可操作"的冲突；sandbox 分级是安全基线。
- Confidence: 高

**C26. React Flow 节点内交互元素的事件冲突解法：`nodrag`（阻止触发节点拖拽与选中）与 `nopan`（阻止触发视口平移）两个工具 class。**
- Source: reactflow.dev 官方 Utility Classes / Custom Nodes 文档
- URL: https://reactflow.dev/learn/customization/utility-classes ; https://reactflow.dev/learn/customization/custom-nodes
- Date: 2026-08-31（页面快照）
- Excerpt: "Adding the class nodrag to an element ensures that interacting with it doesn't trigger a drag… To prevent unexpected behaviours, add a nodrag class name to elements with an event listener."；"If an element in the canvas does not stop mouse events from propagating, clicking and dragging that element will pan the viewport. Adding the 'nopan' class prevents this."
- Context: 终端/视频控制条等可交互子区域逐个加 nodrag 很繁琐——更系统的做法是学 tldraw 的整窗交互态（C25）。
- Confidence: 高

**C27. 拖拽经过 iframe 时 mousemove 被吞的经典坑及标准解法：mousedown 时 `iframe { pointer-events: none }`，mouseup 恢复 auto。**
- Source: 掘金工程博客
- URL: https://juejin.cn/post/6885588334182137870
- Date: 2020-10-20
- Excerpt: "当一个div中嵌入一个iframe，我们又需要对这个div进行放大缩小或者拖拽时…当鼠标移动至iframe中时，无法监听onmousemove事件。解决方法：1. 在onmousedown事件中设置iframe样式：iframe.css('pointer-events','none'); 2. 在onmouseup事件中设置 iframe.css('pointer-events','auto');"
- Context: 凡 DOM 画布拖含 iframe 的节点必踩；tldraw 的非编辑态相当于默认对 iframe pointer-events:none，从根上规避。
- Confidence: 高

**C28. CSS transform 缩放坐标坑：React Flow 官方确认节点用 CSS transform 缩放，"from the DOM's perspective, the element is still the same size"——节点内 <canvas> 的鼠标坐标需手动乘 1/zoom 校正（getZoom()）。**
- Source: reactflow.dev 官方 Common Errors 文档
- URL: https://reactflow.dev/learn/troubleshooting/common-errors
- Date: 2026-08-31（页面快照）
- Excerpt: "React Flow uses CSS transforms to scale nodes as you zoom in and out. However, from the DOM's perspective, the element is still the same size… you can scale your computed relative position by 1 / zoom where zoom is the current zoom level of the flow."
- Context: 终端 canvas 渲染器（xterm.js）、自绘视频帧叠加层等在缩放画布内都要做此校正。
- Confidence: 高

**C29. iframe 缩放模糊的已知浏览器 bug：CSS scale 放大含 fixed 定位内容的 iframe 会导致整体模糊（WebKit 长期未修）。通用做法是反向补偿：iframe 宽高设为 1/scale 倍 + transform: scale(s) + transform-origin: 0 0。**
- Source: WebKit Bugzilla #133801；Stack Overflow #166160 高票答案
- URL: https://bugs.webkit.org/show_bug.cgi?id=133801 ; https://stackoverflow.com/questions/166160/how-can-i-scale-the-content-of-an-iframe
- Date: 2014-06-12（bug，2019 仍有活动）/ 2018-01-28（答案）
- Excerpt: "CSS scale transform causes blurry content when iframe contains fixed positioned content… all of the content in the outer div will become blurry when scaled up"；"iframe { width: 76.92% !important; height: 76.92% !important; transform: scale(1.3); transform-origin: 0 0; }"
- Context: 专注模式下把 400px 活窗放大到全屏，若仅靠外层 scale 会糊；正确做法是专注态改用真实宽高布局（配合 C31 的 DOM 搬迁），或在 iframe 内做反向缩放。
- Confidence: 高（bug 存在性）/ 中高（补偿方案通用性）

**C30. 隐藏 iframe 会被浏览器冻结——display:none/visibility/opacity:0/clip-path+scale(0.01) 全部失效，唯一可靠方案是保持完整渲染、用背景色遮罩盖住（z-index 层管理）。**
- Source: Medium 工程文《Keeping iframes Running When Hidden: A Journey Through Browser Optimizations》
- URL: https://medium.com/raw-fun-gaming/keeping-iframes-running-when-hidden-a-journey-through-browser-optimizations-18f83ac0a334
- Date: 2025-06-20
- Excerpt: "browsers aggressively optimize hidden content, often suspending JavaScript execution and resource loading in hidden iframes… opacity: 0; pointer-events: none — browsers still optimized away the 'invisible' content… The solution that finally worked was counterintuitive: instead of trying to hide the iframe, we kept it fully rendered but visually concealed behind a background-matching overlay."
- Context: 对 agent canvas 三条直接推论：(1) 虚拟化 unmount 的节点其 iframe 必死 → 活节点需豁免或接受重载；(2) 全局模式下若想"后台保活"，需遮罩法而非 display:none；(3) 保活 N 个 iframe 有合成开销（C11），需要上限策略。
- Confidence: 中高（单一来源但方案具体可复现，与浏览器节流机制公知一致）

**C31. iframe 缩放的缩放补偿与视频画布流的性能手段：Canvas.captureStream() 可把 canvas 转为 MediaStream；优化手段含 OffscreenCanvas 移出主线程、动态帧率/分辨率、Web Workers。**
- Source: Ant Media WebRTC 开发者指南；CSDN WebRTC 媒体转换技术文
- URL: https://antmedia.io/webrtc-media-stream-api/ ; https://blog.csdn.net/gitblog_00088/article/details/150714828
- Date: 2025-10-07 / 2025-08-24
- Excerpt: "return canvas.captureStream(30); // 30 FPS output"；"离屏Canvas 使用OffscreenCanvas处理 减少主线程阻塞；帧率控制 合理设置captureStream FPS 平衡质量与性能；分辨率适配 动态调整Canvas尺寸 降低处理负载"
- Context: 若 agent 的输出是 canvas 视频流（如生成式画面），节点内 <video srcObject> 直挂即可，无需 iframe；低 zoom/全局态时降低 captureStream fps 与分辨率即"流媒体版 LOD"。
- Confidence: 中高

**C32. 安全教训：Excalidraw web embed 曾出存储型 XSS（CVE-2024-32472）——未消毒的 srcdoc + allow-same-origin sandbox 组合导致宿主域任意 JS 执行；修复原则：严格解析内容、最小权限 sandbox。**
- Source: GitHub Security Advisory（经 NVD/Wiz 转载）
- URL: https://github.com/excalidraw/excalidraw/security/advisories/GHSA-m64q-4jqh-f72f ; https://www.wiz.io/vulnerability-database/cve/cve-2024-32472
- Date: 2024-04-17
- Excerpt: "One rendering untrusted string as iframe's srcdoc without properly sanitizing… in conjunction with allowing allow-same-origin sandbox flag… resulted in the XSS. This vulnerability is fixed in 0.17.6 and 0.16.4."
- Context: agent canvas 节点内嵌第三方 iframe 时：sandbox 属性逐服务白名单（tldraw 的 unknownEmbedShapePermissionOverrides 模式）、禁 srcdoc 拼接用户输入。
- Confidence: 高

### 4. 全屏/专注模式：节点内容放大复用的状态管理

**C33. 全屏复用活内容的定论式实践：移动 DOM 节点，不要重定向 React Portal 容器——否则 remount、iframe reload、焦点丢失。（Adobe React Spectrum 关于 fullscreen API + Portal 的官方 issue 讨论总结）**
- Source: GitHub adobe/react-spectrum issue #10506
- URL: https://github.com/adobe/react-spectrum/issues/10506
- Date: 2026-08-24（讨论活跃时间）
- Excerpt: "Move the DOM node; do not re-target the React portal. (Ariakit, Angular CDK) Otherwise: remount, iframe reload, focus loss."
- Context: 同时揭示另一坑：元素进入 fullscreen 后，挂在 document.body 的 portal 内容（弹窗等）会不可见，portal 容器需指向 fullscreenElement。agent canvas 专注模式推荐实现：专注时把节点 DOM 子树（含 iframe/video/终端）物理搬迁到全屏容器（同节点引用，不重建），退出时搬回；React 层用 createPortal 到同一稳定容器或 ref 操作 appendChild。
- Confidence: 高

**C34. 路由/视图切换保活 iframe 的社区共识：不 unmount，用 CSS 隐藏/显示切换（同一页面内 useState 控制可见性）。**
- Source: Reddit r/react 讨论《React Router: Keeping Iframes Alive During Route Changes》
- URL: https://www.reddit.com/r/react/comments/1hm9570/react_router_keeping_iframes_alive_during_route/
- Date: 检索快照（2025）
- Excerpt: "Use a single page and import all components, use CSS to hide and show based on useState values"
- Context: 与 C30/C33 互证：iframe 生命周期 = 挂载次数，任何视图态切换设计都要围绕"单实例 + 可见性/位置变换"。注意 CSS 隐藏会冻结内容（C30），所以"卡片↔全屏"之间应保持渲染、只改布局。
- Confidence: 中

**C35. tldraw 内置 focus mode（隐藏全部 UI 的无干扰模式）可作为专注模式的框架级参照：`editor.updateInstanceState({ isFocusMode: true })`，或 toggle-focus-mode action。**
- Source: tldraw 官方示例与 actions 文档
- URL: https://tldraw.dev/examples/focus-mode ; https://tldraw-tldraw.mintlify.app/api/ui/actions-and-tools
- Date: 2026-03-01（actions 页快照）
- Excerpt: "editor.updateInstanceState({ isFocusMode: true }) … Focus mode provides a distraction-free environment by hiding the UI elements and focusing on the canvas content."；"Toggle actions: … toggle-focus-mode"
- Context: 这是"画布级"专注（藏 UI），与"节点级"专注（单节点全屏）不同层级；两者可组合：进入节点专注 = 节点 DOM 全屏化 + 画布 isFocusMode。
- Confidence: 高

**C36. 多实例/多编辑器的焦点管理：tldraw 官方要求手动管理 focus/blur（editor.focus()/blur()），blur 时自动 complete() 终止进行中的拖拽/绘制交互。**
- Source: tldraw 官方 Focus 文档
- URL: https://tldraw.dev/sdk-features/focus
- Date: 检索快照 2026
- Excerpt: "When you have multiple editors on the same page, you'll need to manage focus yourself… When you call editor.blur(), it calls editor.complete() to finish any ongoing interaction like a drag or draw operation."
- Context: 对应 agent canvas 焦点语义：专注模式进入/退出时，画布与被放大活窗的键盘/滚轮焦点归属需要显式仲裁（否则滚轮既缩放画布又滚动 iframe）。
- Confidence: 高

### 5. Minimap、视口管理、协作光标等画布基础设施

**C37. React Flow 内置 MiniMap/Controls/Background/Panel 四件套；MiniMap 支持 nodeColor 自定义。**
- Source: reactflow.dev 官方 Built-In Components 文档
- URL: https://reactflow.dev/learn/concepts/built-in-components
- Date: 2026-08-31（页面快照）
- Excerpt: "The MiniMap provides a bird's-eye view of your flowgraph… You can customize the appearance of nodes in the minimap by providing a nodeColor function."
- Context: 开箱即用但属 SVG/组件级渲染，规模上限见 C38。
- Confidence: 高

**C38. 默认 MiniMap 在 10k 节点时是性能杀手；生产实践改用 HTML5 Canvas 自绘像素点/簇的 minimap，零 DOM 开销。**
- Source: VisualFlow 工程博客
- URL: https://www.visualflow.dev/blogs/scale-studio-pro
- Date: 2026-05-24
- Excerpt: "A standard Minimap attempts to draw a tiny version of every node on the canvas. For 10k nodes, this is fatal. … we implemented a custom HTML5 Canvas-based minimap. Instead of rendering React components into the minimap, we use the raw canvas API to draw simple pixels representing the data clusters. This results in zero DOM overhead."
- Context: 反例互证：ComfyUI 自研 minimap 曾被点名 "per-frame full scan + JSON.stringify of all links" 是明显热点（issue #14599）。minimap 三原则：Canvas 绘制、增量/防抖更新、隐藏时停 RAF。
- Confidence: 中高

**C39. 视口管理 API：React Flow 的 fitView 受 minZoom/maxZoom props 约束（官方 discussion 确认两者需一致否则跳变）；useReactFlow 暴露 setViewport/getViewport/fitView/fitBounds/screenToFlowPosition 等全套相机 API。**
- Source: xyflow GitHub Discussion #2849；Svelte Flow API reference（同 xyflow API 面）
- URL: https://github.com/xyflow/xyflow/discussions/2849 ; https://svelteflow.dev/api-reference/hooks/use-svelte-flow
- Date: 2023-02-17 / 2026-08-24
- Excerpt: "You can pass minZoom and maxZoom as props to the ReactFlow component, these values would then be used by fitView… if it doesn't match with the prop min/max you'd have a jump as soon as you start zooming"
- Context: agent canvas 需要深缩小（全局模式看到全部节点）时 minZoom 要设到 0.05–0.1 级；"进入专注"也可用 setCenter/zoomTo 动画飞向节点作为过渡。
- Confidence: 高

**C40. tldraw 协作基础设施：presence（光标位置/选中/视口）走独立 presence 记录，服务端仅内存存储、不持久化、按 session 作用域；服务端 60fps 合批广播；协作光标 DOM 层渲染 + 视口外协作者显示为边缘钳制提示箭头（overlay canvas 绘制）；支持 viewport following（跟随他人视角）与 cursor chat。**
- Source: tldraw 官方 Cursors 文档 + collaboration.mdx；tldraw sync 架构分析（grida/nothing.graphics 镜像）
- URL: https://tldraw.dev/sdk-features/cursors ; https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/collaboration.mdx ; https://nothing.graphics/docs/wg/research/crdt/tldraw
- Date: 2026-07-23（sync 分析）
- Excerpt: "Remote cursors render as DOM elements in a dedicated layer stacked above the canvas and below the UI panels… shows as a small hint arrow clamped to the viewport edge"；"Presence records (cursors, selections) are: Stored in-memory only on the server… Not persisted… Server debounces data messages at 60 fps (DATA_MESSAGE_DEBOUNCE_INTERVAL = 1000/60)"
- Context: 若 agent canvas 要多人协作：presence 与文档数据分离传输、60fps 合批、视口外光标边缘提示，都是可直接抄的设计。
- Confidence: 高

**C41. tldraw sync 生产栈：@tldraw/sync 自托管，Cloudflare Durable Objects 后端（WebSocket + 自动持久化 + 资产管理），与 tldraw.com 同架构；也可用 Liveblocks 或自建后端。**
- Source: tldraw.dev 官网首页/collaboration 文档
- URL: https://tldraw.dev/ ; https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/collaboration.mdx
- Date: 检索快照 2026
- Excerpt: "Self-hosted tldraw with real-time multiplayer collaboration built with Cloudflare Durable Objects. Production-ready backend that handles WebSocket connections, automatic persistence, and asset management. The same architecture that powers hundreds of thousands of collaborative sessions on tldraw.com."
- Context: 协作非本期核心，但"复用经过大规模验证的 sync 栈"比自己写 Yjs/WebSocket 省数月。
- Confidence: 高

**C42. 许可注意：tldraw SDK 生产使用受 tldraw license 约束（非纯 MIT；starter kits 为 MIT），需在选型时评估；React Flow、Excalidraw、LiteGraph、Rete、Drawflow 均为 MIT。**
- Source: Hysen Labs 开源分析《tldraw SDK…With a License Catch》；tldraw 技能市场条目
- URL: https://hysenlabs.com/en/projects/tldraw-tldraw ; https://lobehub.com/it/skills/agentskillexchange-skills-tldraw-infinite-canvas-whiteboard-sdk
- Date: 2026-08-17 / 2026-04-15
- Excerpt: "Licensing and Production Use: The Critical Caveat"；"MIT-licensed and scaffoldable with npx create-tldraw@latest（指 starter kits）"
- Context: tldraw.dev 当前条款需以官网为准（可能随版本变化，建议落地前核对 tldraw.dev/legal）。React Flow 在 Retool、Builder.io 等有大量生产先例，npm 周下载 ~3.5M（starterpick 2026 数据，置信度中）。
- Confidence: 中（以官网最新条款为准）

---

## 四、落地建议小结（与三态模型对照）

| 展示态 | 推荐实现 | 关键依据 |
|---|---|---|
| 全局模式（摘要卡） | zoom < 阈值1（按节点屏幕像素宽，如 <80px）→ 渲染纯摘要 DOM 占位；活内容暂停/缩略图化；配合 onlyRenderVisibleElements | C4、C17、C18、C11 |
| 默认模式（卡片+活窗） | DOM 节点内嵌 iframe/video/xterm；单击选中、双击进交互态（pointer-events 透传）；拖动用 pointer-events:none 技巧；活节点豁免疫裁剪 | C25–C30、C5 |
| 专注模式（全屏） | 同一 DOM 子树物理搬迁到全屏容器（不 remount），真实宽高布局避免 scale 模糊；配合画布 isFocusMode；显式仲裁焦点 | C33–C36、C29 |
| 底层选型 | Web 首选 React Flow（MIT、生态、内嵌自由）或 tldraw SDK（分层/LOD/embed/协作最全，注意许可）；LiteGraph/Excalidraw/Flutter 仅特定场景 | 对比表、C42 |
