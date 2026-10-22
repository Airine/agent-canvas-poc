# Agent Canvas 调研 · Phase 4 交叉验证结果

调研主题：agent canvas 中 agent 节点（agent runtime）的可视化方式
维度文件：agent_canvas_dim01.md ~ dim12.md（共 12 个维度，≥270 次独立搜索）
验证日期：2026-09-22

---

## 一、High Confidence（≥2 个维度独立来源交叉确认）

1. **「对话/推理流 + 操作画面」双窗格联动是行业事实标准。** Devin（Follow Devin + Shell/Browser/Editor tabs）、Manus（chat + Computer 四 app）、Kimi OK Computer、ChatGPT agent、MiniMax 视窗（dim02）；OpenHands 官方论文（VNC/Browser/VSCode Web 三通道观察同一 runtime）（dim02/dim06）；编排画布侧"画布=执行视图"（dim01）。→ 节点内部必须含双视图，而非二选一。

2. **回放应基于事件流重建而非录屏。** Manus `?replay=1`、Devin Timelapse、OpenHands event-stream、NVIDIA ATOF「lossless replay」规范（dim02）；asciinema 字符流（体积为视频 1/100~1/1000）、rrweb 快照+增量、Playwright trace viewer（dim07）；Weave/AgentLens scrubber、LangGraph「append not upsert」（dim11）。三个维度独立收敛。

3. **三态展示（全局摘要/默认内嵌/专注全屏）= Semantic Zoom/LOD 体系 + 应用层全屏态，且是行业空档。** 主流 agent 画布只有折叠/展开两级（dim01）；tldraw/yFiles/React Flow Contextual Zoom/ComfyUI 低质渲染阈值提供成熟 LOD 模式（dim03）。差异化成立。

4. **节点内嵌活内容（iframe/视频流/终端）必须选 DOM 渲染架构，且有三个已验证的坑：拖拽吞事件（pointer-events:none 解法）、CSS transform 缩放坐标/模糊、隐藏即冻结（需遮罩保活或豁免疫裁剪）。** dim03 系统整理；dim04 沙盒渲染（iframe+CSP）独立佐证。

5. **noVNC + websockify + x11vnc/Xvfb 是操作画面 MVP 标准答案。** Anthropic computer-use-demo、E2B Desktop、docker-selenium、Browser Use WebUI 四方独立验证（dim06）；中文工程社区的云桌面实践（Phase 1 扫描）；OpenHands 集成 VNC Desktop（dim02）。

6. **节点执行状态需要显式多态模型（running/completed/failed/waiting/skipped/queued）+ 冗余编码（颜色+图标+位置）。** workflowbuilder 设计综述 + Dify/Coze/n8n/ComfyUI 交叉（dim01）；n8n 执行可视化回归 bug 引发大量 issue 反证其为核心功能（dim01）；observability 侧 span 状态徽章惯例（dim11）。

7. **渐进式披露三层信息（答复永显 → 步骤摘要默认折叠 → 完整 trace 深层开关）是全行业收敛模式。** Perplexity/ChatGPT/Claude Code（dim09）；编排画布 hover 展开详情（dim01）；trace 工具树/瀑布双视图（dim11）。

8. **Plan/Todo 是一等公民 UI，且需吸附式外显。** Manus checklist `6/6`、Kimi `[x]`/`[-]`、Devin Interactive Planning（dim02）；Claude Code todo 面板社区强需求（dim09）。

9. **Approval 至少四态（approve/edit/reject/respond），且必须是 harness 层结构性中断而非提示词约定。** LangChain HITL middleware 官方文档（dim08）；ChatGPT agent decision gate（dim02）；超时需外部 sweeper + 风险分级默认策略（dim08）。

10. **Takeover 期间必须停止截图/录屏（凭证不可见）。** OpenAI Operator/ChatGPT agent 官方「While you control the browser, no screenshots are captured」（dim02/dim06/dim08 三处独立引用）；browser-use sensitive_data placeholder（dim08）。

11. **版本管理默认线性链 + 旧版本编辑产生分支而非覆盖；恢复前自动保存当前态。** Claude Artifacts version selector + fork 语义、ChatGPT Canvas back button、Figma 自动 checkpoint+命名版本（dim04/dim05 交叉）。

12. **append-only 事件日志是回放/回滚/审计的地基。** 事件溯源投影 UI（dim02）；asciinema 3.0「录制=实时管道旁路」（dim07）；LangGraph「The moment you overwrite…you no longer have a recording」（dim11）；NervaFS 全量审计流（dim12）。

## 二、Medium Confidence（单一权威来源或单维度结论）

- tldraw 分层渲染/空间索引/embed shape/focus mode 细节（dim03，官方文档单维但一手）。
- ComfyUI DOM 化性能回退 60→<5FPS 的定量数据（dim03，官方 issue）。
- 400 行是全量重写 vs diff 的实证分界（dim04，三方收敛但均非严格学术）。
- ttyd/xterm.js「接近本地」的延迟定性结论（dim07，多源定性一致、无权威 benchmark）。
- 泳道视图用于并行 agent 时间重叠（dim11，社区需求代理证据）。
- NervaFS 数据模型（Agent Volume/Namespace Contract/Runtime Binding/Provider Adapters）与 M1 能力边界（dim12，一手站点抓取，v0.3.5 早期版本）。

## 三、Conflict Zone（冲突与消解）

| # | 冲突 | 双方来源 | 消解 |
|---|---|---|---|
| CZ1 | **实线/虚线语义惯例相反**：dim01（n8n/ComfyUI/LangGraph 生态：实线=主数据流、虚线=AI 挂载/条件边）vs dim10（SysML/UML：实线=控制流、虚线=依赖/消息） | dim01 Claim（n8n 虚线 ai_tool）、dim10 Claim 1.1/1.2（UML/BPMN） | **非事实冲突，是惯例分裂。** 用户设计（实线=强事务、虚线=弱通信）与 BPMN 消息流/UML dependency 同构，成立；但产品必须内置图例 + 双通道冗余编码（颜色+线宽+端口形状），不能依赖用户心智。 |
| CZ2 | **全量重写 vs diff 局部编辑**：dim04 内部证据张力（whole-code 更稳 vs unified diff 可审计省 token） | dim04 C02/C04 | **按产物大小与场景路由**：~400 行分界 + fast-apply 两段式；编辑应用结果必须显式暴露（applied N of M）。已消解为设计策略。 |
| CZ3 | **VNC vs WebRTC vs CDP vs DOM 重建**：延迟/成本/适用范围各异 | dim06 对比总表 | **场景路由而非单选**：MVP=noVNC；公网/多人围观=WebRTC（借道 mediamtx）；节点轻量预览=CDP screencast；回放审计=DOM 重建/事件流。已消解。 |
| CZ4 | **DOM vs Canvas 渲染架构**：DOM 才能嵌活内容，但 ComfyUI DOM 化翻车 | dim03 C11/C12 | **DOM + 虚拟化 + LOD + 活内容降级三件套**；ComfyUI 案例恰好证明裸 DOM 不可行而非 DOM 不可行。已消解。 |
| CZ5 | **React Flow vs tldraw 选型未定**：生态/许可/能力侧重不同 | dim03 对比表、C42 | **未消解，列为落地决策点**：React Flow（MIT、节点卡片自由度）vs tldraw（LOD/embed/协作最全、生产许可需核对）。建议原型期双轨验证。 |

## 四、未决问题（真实知识缺口，非冲突）

1. **NervaFS 跨机实时同步协议未披露**（M1 主打 local-first + snapshot/bundle handover）→ canvas 的"同步状态"展示语义需与 nervafs 路线图对齐，或按 dim12 建议用 audit 流 + awareness 组合自建。
2. **凭证是否 NervaFS 一等 namespace**：站点未明示 → 节点上先按"引用元信息 + 值级遮罩"展示（GitHub add-mask 模式）。
3. **多人审批的 claim/lock/通知机制在现有开源 HITL UI 中均缺失**（dim08）→ 机会点也是空白区，需自行设计。
4. **PPT 类产物的结构 diff** 资料稀缺（dim05 标注为外推）。
5. **tldraw 生产许可条款** 以官网最新为准（落地前核对）。

## 五、Phase 5 决定：跳过

所有 Conflict Zone 均为设计惯例分裂或场景路由问题，已通过证据消解为设计策略；未决问题属于"领域尚未公开的知识缺口"（NervaFS 未披露信息），追加外部搜索无法解决。故不触发 Phase 5，未决项原样带入报告。
