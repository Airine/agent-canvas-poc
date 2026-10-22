# 7. 底层架构：事件溯源、trace 数据模型与 substrate 可视化

前面六章分别讨论了三类节点的窗口形态与边的数据面，本章收束到共同底座：三类节点（产物/操作/对话）在数据层是否真是「三种东西」，节点常驻信息从哪个数据源来，画布引擎选谁、性能预算怎么花。结论先行：三类节点可统一在一条 append-only 事件流的不同投影上；节点信息架构展示「绑定关系」而非状态副本；DOM 渲染架构是唯一可行路线，但必须配虚拟化、LOD（Level of Detail，细节层次）与活内容降级三件套。

## 7.1 统一事件溯源：一条事件流，三种投影

### 7.1.1 三类节点共享 append-only agent 事件流，各自投影

本调研的跨维度交叉验证将「append-only 事件日志是回放/回滚/审计的地基」列为 High Confidence 共识：LangGraph 工程实践的表述最为直白——每个步骤后持久化 checkpoint、绝不在原地覆盖，「一旦覆盖，你拥有的只是崩溃恢复，而不再是一份记录」（append, not upsert）[^9^][^173^]。在此地基之上，本报告的核心架构推断（Insight 1，置信度 high）是：产物构建、操作执行、通用对话表面上是三种 UI，底层却可以是对同一条 agent 事件流（thought/action/observation/artifact-diff/env-op）的不同投影——产物节点投影 artifact 快照序列，操作节点投影环境画面（VNC 帧、终端字符流、DOM 快照作为富媒体附件），对话节点投影消息序列。NervaFS 的审计流天然扮演事件总线角色：每次 list/read/write 都产生带结构化 reason、target path、binding id、caller 的不可变事件[^14^]。

这一统一的直接收益是「实时」与「回放」同构：回放不是另一套系统，而是同一投影对历史事件区间的重放。开源项目 AgentLens 已验证可行性——实时 span 追加（SSE）与逐帧 scrubber 回放共用同一份 span 存储[^174^]。对产品形态的意义是「跳到某一步看当时的产物/环境状态」（time travel）成为零额外成本的能力，第 2 章的活窗降级阶梯、第 6 章的消息 trace 泳道都只是这条事件流上的又两种投影。

### 7.1.2 数据模型对齐 OTel GenAI：invoke_agent 根 span，chat/execute_tool 同级子 span

事件模型的词汇表应直接采用 OpenTelemetry GenAI 语义约定：一次 agent run 建模为 `invoke_agent` 根 span，`chat {model}`（LLM 调用）与 `execute_tool {tool}`（工具执行）作为其下的**同级**子 span[^13^]。这里有一条被多家实现反复确认的结构教训：tool span 是 agent span 的孩子，而不是 LLM span 的子级——模型返回工具调用请求时 chat span 即结束，工具执行发生在其后；若把 tool span 嵌入 LLM span，会扭曲时间线并高估模型延迟[^13^]。多 agent 层级则通过子 agent 嵌套为新的 `invoke_agent` 表达，「多 agent handoff 是一棵更深的树，而不是另一种数据」[^13^]。

「类型化 span 树 + trace 级上下文 + session 级分组」已是行业收敛事实：LangSmith 用 run tree 并以 run_type 决定 UI 渲染（llm 渲染消息气泡、tool 渲染参数/结果）[^175^]；Langfuse 的 observation 类型表（span/generation/agent/tool/retriever 等）与 OpenInference span kind 几乎一一对应[^176^]。鉴于 OTel GenAI 约定仍为 Development 状态、属性名可能变动[^13^]，本报告建议「采形状不采字符串」，在映射层隔离具体属性名。另需继承 OTel 的内容/元数据分层——prompt 与消息正文因 PII 风险以 opt-in 方式采集[^13^]，对应到节点 UI 即默认只展示模型、token、耗时、工具名等元数据，消息正文折叠为可展开的隐私敏感区。

## 7.2 节点信息设计：展示「绑定」而非「副本」

### 7.2.1 节点头 = AgentCard 子集 + env 生命周期态 + substrate 同步状态

在 agent = harness + env + substrate 的三分模型下，节点卡片不需要也不可能展示状态本体，它展示的是三组绑定关系的状态。身份区复用 A2A AgentCard 这一事实标准 schema 的子集（agent id、provider、harness 类型、版本），展开层再放 skills/capabilities/securitySchemes 与签名/attestation 状态；AgentCard 规范本身即明示不建议在卡内放明文 secret[^177^]。env 状态区照搬 E2B 沙盒状态机（Running/Paused/Snapshotting/Killed，含「快照积压时降级为 filesystem-only pause」的中间态）[^178^]。substrate 状态区采用 Kubernetes 的 conditions 数组模式：K8s 把 Pod 状态拆为 phase + conditions 数组（各带 type/status/lastTransitionTime/reason），比单一「健康点」信息量高一个量级[^179^]。映射到节点即 `SubstrateSynced / BindingActive / PolicyCurrent / SnapshotReady` 四个 condition 各为一行布尔态，鼠标悬停展示 lastTransitionTime 与 reason。本调研维度 12 的核心设计原则在此落地：生命周期状态 ≠ 一致性状态，两条线分开渲染[^14^]。

### 7.2.2 NervaFS 四对象、八 namespace 到节点信息架构的映射

NervaFS 的数据模型由四个核心对象构成：Agent Volume（`/agents/{agent_id}/...`，含 identity/memory/knowledge/skills/communication/data/logs/snapshots 八个 namespace）、Namespace Contract（声明式 mutability class 与 capability）、Runtime Binding（`rb-{8}`，携带 policy revision、cache revision、调用者 OS 上下文与 audit thread）、Provider Adapters（可替换存储后端）[^14^]。下表将其映射为节点全局模式的常驻字段：

| 节点字段（全局模式） | 展示内容 | 数据来源 | NervaFS 对象/namespace 映射 |
|---|---|---|---|
| 标题 + agent id | 用户命名 + `/agents/{agent_id}` | AgentCard / volume 根路径 | Agent Volume（identity）[^14^][^177^] |
| harness 徽标 | harness 类型 + 版本（如 Claude Code 2.x） | Runtime Binding 的 caller OS context | Runtime Binding（`rb-{8}`）[^14^] |
| env 状态点 | Running/Paused/Snapshotting/Killed 色点 | env runtime 状态机上报 | 无（env 侧数据源）[^178^] |
| binding 行 | `rb-a3f1c8 · policy r12 · cache r7` | Runtime Binding 的 revision 字段 | Runtime Binding[^14^] |
| substrate conditions 条 | Synced/BindingActive/PolicyCurrent/SnapshotReady | conditions 数组（K8s 模式） | 由 audit 流聚合派生[^14^][^179^] |
| namespace 健康摘要 | memory/skills 等八 namespace 最近写入时间与写者 | audit 事件流按路径前缀聚合 | Namespace Contract + audit[^14^] |
| 凭证行 | `🔒 OPENAI_API_KEY · via vault · synced 2m ago · rotated 30d` | 引用元信息（值永不出现） | identity 的 capability ref / policy 层[^14^][^180^] |

表中值得注意的三点。其一，七行字段中只有「env 状态点」来自 env 侧，其余全部可由 substrate 与 AgentCard 两个数据源拼出——「展示绑定而非副本」意味着画布无需向每个 env 建立重型数据通道。其二，binding 行的 policy/cache revision 是排查「同一 agent 的不同 env 行为不一致」的第一入口，revision 分叉本身就是可视化信号。其三，需诚实标注边界：NervaFS 当前为 M1 早期版本（v0.3.5），站点强调 local-first、audit 默认开启与 snapshot/bundle handover 迁移，**跨机实时同步协议未披露**[^14^]。因此 Synced condition 现阶段只能由 audit 流聚合派生（如「最近一次跨 env 写入距今多久」），而非来自真实复制协议状态；若产品依赖「多 env 实时同步同一 volume」，需与 NervaFS 路线图对齐。同理，凭证是否为一等 namespace 站点未明示，凭证行先按「引用元信息 + 值级遮罩」挂靠在 identity/policy 层之下[^14^]。

### 7.2.3 「谁在写」的可视化：audit 反推 + awareness 式 presence

「谁在写」是分布式状态同步中最难可视化的部分。现成答案分两类：CRDT 阵营的 Yjs Awareness 协议天然广播「谁在线、在编辑什么」，已有把 AI agent 注册为 CRDT peer（带 name/color/role/status）与人并列出现在 presence UI 的实践[^181^]；文件系统阵营则普遍「没有协作语义可看」——Letta 的共享 memory block 官方明示 last-write-wins，存储层根本读不出「冲突」，只能展示「最后写入者 + 时间」[^182^]。本报告的推断性建议是组合路线：以 audit 流反推当前写者（近 N 秒内对某 namespace 有 allowed write 事件的 binding/caller 即「活跃写者」），叠加 awareness 式 presence 通道呈现人与 env 的焦点；冲突指示器严格按 substrate 实际语义设计——LWW 语义下画「最后写入者徽标」即可，不要画出不存在的「冲突裁决 UI」。

### 7.2.4 凭证：只展示引用元信息，值级遮罩，denied 标红

凭证展示的行业惯例是「值永不展示、出现即遮罩」：GitHub Actions 的 `::add-mask::` 可将任意运行时值注册为遮罩对象，此后同一 job 日志流中所有出现处自动替换为 `***`[^180^]。由于凭证可能出现在任意文本（日志、终端回显、工具参数）中，canvas 需要内置同等的**值级**遮罩注册表，而非仅做字段级隐藏。节点上的凭证行只含元信息：名称、来源（vault/env/substrate）、scope（agent/env/run）、上次轮换时间、同步时间、审计链接；值只显示 `***` 或前后 4 位指纹。审计侧直接复用 NervaFS 原生模型——每次 read/write 产生 allowed/denied + reason + binding + caller 事件，按 binding 过滤即可回答「哪个 env 读过这个凭证」，其中 denied 事件单独标红，作为低成本高价值的异常访问信号[^14^]。

## 7.3 画布技术选型与性能预算

### 7.3.1 DOM 渲染架构是唯一可行路线

节点内要嵌 iframe、视频流、终端这三类活内容，就把渲染架构的选择收敛到了 DOM：纯 Canvas/WebGL 路线（LiteGraph、Excalidraw、Flutter/原生）要么不支持节点内嵌 DOM，要么需要手动同步叠层 DOMWidget 的位置与缩放，工程成本高[^183^][^184^][^185^]。主流候选的对比见下表：

| 框架 | 渲染架构 | LOD / Semantic Zoom | 活内容嵌入 | 画布基础设施 | 许可 |
|---|---|---|---|---|---|
| React Flow 12 | DOM 节点 + SVG 边，CSS transform 缩放 [^186^] | 官方 Contextual Zoom 示例；无内置 LOD 体系 [^2^] | 任意 React 组件；`nodrag`/`nopan` 解决事件冲突 [^187^] | MiniMap/Controls/Panel 内置；视口裁剪 `onlyRenderVisibleElements` [^67^] | MIT [^188^] |
| tldraw SDK | DOM shape 层 + Canvas 2D overlay + 空间索引裁剪 [^1^] | 内置 LOD：zoom 防抖、屏幕尺寸阈值、图片分辨率分级 [^1^] | 一等公民 embed shape：单击选中/双击交互、sandbox 分级 [^5^] | @tldraw/sync 协作、presence、focus mode 最全 [^189^] | 生产使用受 tldraw license 约束，非纯 MIT，条款待核对 [^188^] |
| LiteGraph.js | 单 Canvas2D 即时模式 [^183^] | ComfyUI 实践：低质渲染 zoom 阈值（默认 0.6）[^4^] | DOMWidget 叠 HTML 层，需手动同步变换 [^183^] | 无内置 minimap/协作 | MIT [^188^] |
| Excalidraw | Canvas 2D（rough.js）双 canvas [^184^] | 无 [^184^] | embeddable/iframe 元素类型，曾有 srcdoc XSS CVE [^184^] | 协作 + E2E 加密；扩展性弱 | MIT [^188^] |
| Rete.js v2 | 核心与渲染分离，React/Vue/Angular 渲染插件 [^190^] | 无内置，可用 zoom 信号自建 [^190^] | 取决于渲染器（React 渲染器=DOM，可嵌任意内容）[^190^] | minimap/虚拟化/协作均自建 [^190^] | MIT [^188^] |
| Drawflow | 纯 DOM + SVG 连线，vanilla JS [^191^] | 无；zoom 仅 0.5–1.6 [^191^] | 节点 HTML 任意（可放 iframe）[^191^] | 无 minimap/协作 [^191^] | MIT [^188^] |
| Flutter/原生（canvas_kit、Vyuh Node Flow 等） | Flutter Widget + CustomPainter（Skia/Impeller）；世界/视口双坐标系 [^185^] | Vyuh 宣称 LOD + 视口虚拟化 + viewport culling（厂商宣称，未独立验证）[^185^] | Web 端仅可走 HtmlElementView/PlatformView，存在合成/手势冲突，与活窗架构级冲突（推断，置信度中低）[^185^] | Vyuh 有 minimap/auto-pan；生态远弱于 Web，仅原生桌面/移动目标考虑 [^185^] | 视具体库而定 |

从表中可以看出两个结构性结论。其一，活内容嵌入能力与基础设施完整度正相关地集中在 React Flow 与 tldraw 两家：Rete 选 React 渲染器后嵌入能力等价于 DOM，但 minimap、虚拟化、协作全部要自建；Drawflow 虽可放 iframe，却缺一切大图基础设施，仅适合数十节点级原型；LiteGraph 与 Excalidraw 则与「活窗」存在架构级冲突；Flutter/原生仅当目标平台为原生桌面/移动时才进入候选，Web 目标直接排除[^185^]。其二，最终二选一是本调研遗留的未消解决策点，即冲突区（CZ5）：React Flow 胜在 MIT 许可、节点卡片自由度与生态（Retool、Builder.io 等有大量生产先例），tldraw 胜在 LOD、embed 交互模型、协作栈「开箱最全」，但生产许可条款非纯 MIT、需落地前核对官网最新条款[^188^]。本报告建议原型期双轨验证，以「活窗嵌入密度」和「协作需求强度」为裁决变量。

### 7.3.2 性能分档与三件套：虚拟化 + LOD + 活内容降级

DOM 架构能成立，靠的是裁剪与 LOD 而非 DOM 本身——ComfyUI Nodes 2.0 把节点从 Canvas 迁到 Vue DOM 后，中大型工作流帧率从 60+ 跌至 5 FPS 以下，官方与社区同时确认「每节点一 DOM 子树」在规模下的风险[^69^]。React Flow 侧的实测分档同样直接：<100 节点默认流畅，100–500 需开视口裁剪，500–1000 需简化节点 DOM，>1000 必须 LOD 或 WebGL 替代；100 个默认节点拖拽即降至约 10 FPS，100 个嵌重内容的节点未优化时仅约 2 FPS、优化后可回 35–40 FPS[^192^]。更隐蔽的瓶颈在 GPU 合成层：ComfyUI 的逐层 profile 显示，性能损耗的约 47% 来自浏览器 GPU 合成器与计算任务的竞争、约 23% 来自实时预览流、约 30% 来自进度事件驱动的 DOM 更新[^68^]——这解释了为什么「所有节点同时直播」在物理上不可行。

![DOM 画布在重节点/活内容下的帧率实测对比](agent_canvas_sec07_perf.png)

上图汇总了两组独立实测：React Flow 在百级节点下即逼近 30 FPS 可交互下限，重内容节点未优化时几乎不可用；ComfyUI 的 DOM 化案例给出「裸 DOM 不可行」的最强反例（60+ FPS → <5 FPS）。两组数据均来自官方 issue/工程博客披露的人工 profile，硬件场景各异、绝对值不宜横向精比，但数量级结论一致：DOM 节点数与活内容数是两条独立的帧率预算线。这指向同一处方——**三件套**：(a) 视口虚拟化（React Flow `onlyRenderVisibleElements` 或 tldraw 空间索引），但全局缩小视图会让所有节点重新进入视口、虚拟化被绕过，10k 节点场景曾因此直接崩溃[^65^]；(b) 语义 LOD，按「节点屏幕像素尺寸」而非绝对 zoom 设阈值（tldraw 模式：`shape.w × zoom < 50px` 时渲染简化版），zoom 值需防抖以避免缩放中途全图重渲染[^1^]；(c) 活内容降级阶梯，低 zoom/全局模式降级为静态缩略图或心跳帧，与第 2 章的活节点配额衔接。另有一个已知约束：被裁剪或 `display:none` 的 iframe 会被浏览器冻结，visibility/opacity/clip-path 等替代手段全部失效，唯一可靠的保活法是保持渲染并用遮罩盖住——被点亮的活节点必须豁免疫裁剪[^66^]。

### 7.3.3 画布基础设施：minimap、presence 与深缩放

三处基础设施有明确的正反例可循。minimap 必须用 Canvas 画像素点而非渲染真实节点：React Flow 默认 MiniMap 在 10k 节点时是「致命」热点，生产实践改用 HTML5 Canvas 自绘像素簇、零 DOM 开销[^65^]；ComfyUI 自研 minimap 因每帧全量扫描并序列化所有连线被点名为性能热点[^68^]。presence/协作光标走独立通道：tldraw sync 的 presence 记录仅存内存、不持久化、按 session 作用域，服务端 60fps 合批广播，协作光标渲染在 canvas 之上、UI 之下的独立 DOM 层[^189^]——这正是 7.2.3 节 presence 可视化的传输底座。深缩放方面，全局模式看全图时 minZoom 需设到 0.05–0.1 级，且 fitView 与 minZoom/maxZoom 必须一致，否则开始缩放瞬间会发生视口跳变[^193^]。最后，专注模式实现复用 2.3.1 确立的「移动 DOM 节点不重挂载」铁律。这与 7.1 的实时/回放同构原则共同保证「放大看清」与「状态连续」不互斥，也为第 8 章落地路线划出画布层的决策边界。
