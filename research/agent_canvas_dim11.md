# Agent Canvas 维度 11：Agent 可观测性工具的 Trace/Span 可视化调研

调研范围：LangSmith、Langfuse、Arize Phoenix、Braintrust、OpenTelemetry GenAI 语义约定、Weights & Biases Weave（另含 LangGraph time-travel、AgentLens、Datadog/Grafana 等参照）。
方法：28 次独立中英文搜索（6 批并行），优先官方文档、OTel 规范解读、工程博客与 GitHub issue/discussion。
日期说明：以下 Date 为来源页面标注的发布/更新日期（本环境时钟为 2026 年，故出现 2026 年日期属正常）。

---

## 一、设计启示（对"节点窗口执行过程展示与回放"）

1. **数据模型用"类型化 Span 树"，对齐 OTel GenAI 命名。** 根 = `invoke_agent`（一次 agent run），子节点按类型区分：`chat`（LLM 调用）、`execute_tool`（工具）、`retrieval`、`plan`、`invoke_workflow`。关键结构约束：**tool span 是 agent span 的孩子，与 LLM span 同级，而不是 LLM span 的子级**——否则时间线失真、LLM 延迟被高估。每类 span 配专属渲染（LLM→消息气泡、tool→参数/结果、retriever→文档列表），这是 LangSmith run_type、Langfuse observation type、OpenInference span kind 三家的共同做法。

2. **视图分层：树（结构）× 瀑布（时间）× 火焰图（热点）× Agent 图（拓扑），且支持切换而非单选。** Langfuse 2025 重做 trace 视图后 Tree/Timeline 平权切换；Weave 提供 树/code composition/flame graph/graph 四视图；Datadog 以 Flame Graph 为默认。单节点窗口内建议：默认"树+迷你时间轴"，深挖切火焰图，多 agent 并行切泳道。

3. **泳道（swimlane）定位：跨并行单元共享时间轴。** Langfuse 社区明确提出"每条 trace 一条 lane、共享时间轴、一眼看重叠"的需求（并行 agent run、语音 agent 的 STT/LLM/TTS 分层同理）。泳道不是单 trace 内嵌套展示的最佳形态（嵌套交给树/瀑布），而是**并行 agent/并行工具调用**的时间重叠可视化。

4. **实时流式 = 事件增量追加 + 明确的"直播中"状态。** 参照 Braintrust Live tail：新行到达时闪烁高亮、浏览器 tab 隐藏时自动暂停拉流。Agent 运行中，span 以 start/end 两事件增量渲染（进行中的 span 显示为"进行中条"），token 流走独立通道（LangGraph 的 `stream_mode="messages"` vs `updates` 分离思想：进度事件与逐 token 内容分开订阅，避免刷屏）。

5. **指标三级展示：span 徽章 → trace 头聚合 → 项目 dashboard。** Span 上直接贴 latency/token/cost 徽章（Langfuse/Arize 均如此）；trace 头显示 span 数、总 token、总成本、总延迟、状态；dashboard 层做 p50/p99、TTFT、按 run_type 分组、Top5 工具、错误率。成本统一靠"模型定价表 × token 数"在写入时计算，ingested 真实值优先于推断值。

6. **回放分两级，先实现"事件级回放（视觉 time-travel）"。** 第一级：只读 scrubber——Weave 的 Timeline/Peers/Siblings/Stack/Path 五种 scrubber、AgentLens 的 frame-by-frame scrubber，纯前端重放已存事件，无重执行。第二级：真实重执行——LangGraph checkpoint 的 Replay（从检查点原样续跑）与 Fork（改状态后分叉）。对 canvas"操作回放节点"，第一级（append-only 事件日志 + 时间轴 scrubber）成本最低、覆盖最广。

7. **append-only 是回放能力的地基。** "Persist a checkpoint per step… never overwrite in place… The moment you overwrite, you have crash recovery and you no longer have a recording"（LangGraph time-travel 工程博客）。节点窗口若要支持 undo/fork/审计，环境操作与产物变化必须按步骤追加存储快照，而非原地覆盖。

8. **内容（prompt/消息/工具参数）与元数据分层采集，内容 opt-in。** OTel GenAI 明确因 PII 把 prompt/response 内容排除在标准 span 属性之外，作为 opt-in 的 `gen_ai.input.messages` / `gen_ai.output.messages`（或事件）。canvas 节点应默认显示结构化元数据（模型、token、耗时、工具名），消息正文折叠为可展开的隐私敏感区。

---

## 二、Claim 明细

### 主题 1：Agent trace 数据模型

**Claim 1.1 — LangSmith 用 Run Tree 模型：每个步骤是一个 run，父子嵌套成树，run_type 决定 UI 渲染与功能。**
- Source: Run (span) data format — LangChain Docs
- URL: https://docs.langchain.com/langsmith/run-data-format
- Date: 2026-09-21（页面标注）
- Excerpt: "The `run_type` field identifies the kind of operation a span represents. LangSmith uses it to apply appropriate rendering in the trace UI and to enable type-specific features." Run types: `chain` / `llm` / `embedding` / `prompt` / `tool` / `retriever` / `parser`。"Some run types have specialized trace views in the LangSmith UI: Log LLM calls, Log retriever traces."
- Context: 数据模型基准。LangSmith 侧"A parent run might be an entire agent execution. Child runs include tool calls, prompt formatting, LLM calls, and output parsing"（cubeapm 对比文佐证）。
- Confidence: 高（官方文档）

**Claim 1.2 — Langfuse 数据模型：Session → Trace → Observation（span/generation/event + 扩展类型），构建于 OTel 之上，物理上用宽表（trace 属性冗余进每行 observation）加速聚合。**
- Source: Observability Data Model — Langfuse Docs；Additional Observation Types — Langfuse Changelog
- URL: https://langfuse.com/docs/observability/data-model ；https://langfuse.com/changelog/2025-08-27-enhanced-observation-types
- Date: 2026-09-14 / 2025-08-27
- Excerpt: "`Observations` are the individual steps of your application: LLM calls, tool calls, retrieval steps… They can be nested… Conceptually, Langfuse stores one observations table, and each row holds the observation-level data plus a copy of the trace-level attributes. This keeps queries and aggregations fast." Observation types 全列表：event / span / generation / agent / tool / chain / retriever / evaluator / embedding / guardrail。
- Context: generation 是"专为 LLM 调用设计的特化 span"，附带 model、model_parameters、usage_details(tokens)、cost_details（SDK overview 文档）。Langfuse 的 agent/tool 等扩展类型与 OpenInference span kinds 几乎一一对应。
- Confidence: 高（官方文档 + changelog）

**Claim 1.3 — OTel GenAI 约定建模 agent run 为：`invoke_agent`（INTERNAL，根）→ `chat {model}`（CLIENT）与 `execute_tool {tool}`（INTERNAL）作为同级子 span；tool span 不嵌在 model span 内。**
- Source: OpenTelemetry GenAI Semantic Conventions Implementation Guide — hidekazu-konishi.com；OpenTelemetry GenAI Semantic Conventions Explained — Dash0
- URL: https://hidekazu-konishi.com/entry/opentelemetry_genai_semantic_conventions_guide.html ；https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained
- Date: 2026-08-02 / 2026-09-15
- Excerpt: "1. `invoke_agent {agent}` (INTERNAL) opens as the root of the agent's work. 2. `chat {model}` (CLIENT) runs as its child. The model returns a tool call. 3. `execute_tool {tool}` (INTERNAL) runs as a sibling of the first chat span, under the same invoke_agent parent… **Tool spans are children of the agent, not of the model call.** The model span ends when the model returns its tool call request; tool execution happens afterwards… Nesting the tool span inside the model span misrepresents the timeline and inflates the model's apparent latency."
- Context: 这是最重要的结构教训，直接影响 canvas 节点内时间线的正确性。Dash0 给出的标准树形：`invoke_agent "research-assistant" ├── chat gpt-4 ├── execute_tool "web_search" ├── chat gpt-4 ├── execute_tool "summarize_doc" └── chat gpt-4`。"A sub-agent nests as another invoke_agent span, so a multi-agent handoff is a deeper tree and not a different kind of data."
- Confidence: 高（规范解读，两源一致）

**Claim 1.4 — OTel GenAI 约定定义 8 类操作 span；token 用属性记录、用量/时长用直方图指标；全部仍为 Development 状态。**
- Source: OpenTelemetry GenAI Semantic Conventions Explained — Dash0；OTel GenAI Conventions — TrueFoundry；A 2026 Guide — sentryml
- URL: https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained ；https://www.truefoundry.com/de/blog/opentelemetry-genai-semantic-conventions ；https://sentryml.com/posts/opentelemetry-genai-semantic-conventions-instrumenting-llm-apps/
- Date: 2026-09-15 / 2026-08-22 / 2026-08-20
- Excerpt: 操作词汇表：`chat`/`generate_content`/`text_completion`（推理）、`embeddings`、`create_agent`/`invoke_agent`（agent 生命周期与单次运行）、`invoke_workflow`（编排）、`plan`（规划/分解）、`execute_tool`（工具）、`retrieval`（向量/RAG 查询）、`create_memory`/`search_memory`/`upsert_memory`。"Every GenAI span attribute and metric in the spec still carries Development status rather than Stable." 关键指标：`gen_ai.client.token.usage`、`gen_ai.client.operation.duration`、`time_to_first_chunk`、`time_per_output_chunk`。
- Context: v1.42.0 起 GenAI 约定迁入独立仓库（semantic-conventions-genai），属性名仍可能变；设计 canvas 数据模型时应"采形状不采字符串"，在映射层隔离。
- Confidence: 高（多源一致）

**Claim 1.5 — 消息内容建模有两代方案：事件式（`gen_ai.system/user/assistant/tool.message` + `gen_ai.choice`，正在退场）与属性式（`gen_ai.input.messages` / `gen_ai.output.messages`，JSON parts schema，opt-in）。**
- Source: livekit/agents issue #6364（GitHub）；OpenTelemetry — PromptLayer Docs；GenAI Semantic Conventions for LLM Monitoring — OneUptime
- URL: https://github.com/livekit/agents/issues/6364 ；https://docs.promptlayer.com/features/observability/traces/opentelemetry ；https://oneuptime.com/blog/post/2026-02-06-genai-semantic-conventions-llm-monitoring/view
- Date: 2026-07-09 / 2026-08-04 / 2026-02-06
- Excerpt: "under the latest GenAI semconv, message content is recorded as the `gen_ai.input.messages` / `gen_ai.output.messages` span attributes rather than span events"。事件式缺陷："since the whole history is re-emitted on every request, a session with n turns produces O(n²) span events"。内容采集开关：`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`。
- Context: 后端（Braintrust、PromptLayer、MLflow）同时解析两套格式并优先属性式。Canvas 展示消息流时应以 message 数组（role + parts）为一等数据，而非文本 blob。
- Confidence: 高

**Claim 1.6 — Arize Phoenix 基于 OpenTelemetry + OpenInference：trace 是 span 树，span kind 为 LLM/EMBEDDING/CHAIN/RETRIEVER/RERANKER/TOOL/AGENT/GUARDRAIL/EVALUATOR/PROMPT 十类；属性按扁平命名空间（`llm.input_messages.0.message.role`）。**
- Source: Introduction to OpenInference；Tracing Concepts — Arize AX Docs；A 2026 Guide — sentryml
- URL: https://mintlify.com/explore/Arize-ai/openinference ；https://arize.com/docs/ax/instrument/what-are-traces ；https://sentryml.com/posts/opentelemetry-genai-semantic-conventions-instrumenting-llm-apps/
- Date: 2026-03-02 / 2026-09-14 / 2026-08-20
- Excerpt: "OpenInference… defines ten span kinds — LLM, EMBEDDING, CHAIN, RETRIEVER, RERANKER, TOOL, AGENT, GUARDRAIL, EVALUATOR, and PROMPT"；"Traces are trees of spans connected by parent–child relationships… span carries Name, Timestamps (nanosecond precision), Span kind (`openinference.span.kind`), Attributes, Status (OK/ERROR/UNSET)"。Chain span 的定位："general-purpose grouping spans… its value is purely structural, giving you a named parent in the trace tree."
- Context: OTel GenAI 已覆盖大部分 OpenInference span kind，独有 reranker/guardrail/evaluator 三类。Phoenix UI 按 span kind 渲染 AI 感知的富视图。
- Confidence: 高（官方文档）

**Claim 1.7 — Braintrust：span 树 + 类型图标（llm/score/function/eval/task/tool/review），且生产日志与离线实验共用同一 span 数据结构。**
- Source: Advanced tracing patterns — Braintrust Docs；Observe your application — Braintrust Docs
- URL: https://www.braintrust.dev/docs/instrument/advanced-tracing ；https://www.braintrust.dev/docs/observe
- Date: 2026-09-10 / 2026-09-16
- Excerpt: "`span_attributes`… `type` should be one of `\"llm\"`, `\"score\"`, `\"function\"`, `\"eval\"`, `\"task\"`, `\"tool\"`, or `\"review\"`"；"Logs use the same data structure as experiments… Traces capture identical data in production and testing… Production data seamlessly becomes evaluation datasets."
- Context: 典型树形：`conversation (root) ├─ handle_message (function, turn 1) │ └─ Chat Completion (LLM) ├─ handle_message (turn 2)…`——turn 用 function span 分组。
- Confidence: 高（官方文档）

**Claim 1.8 — Weave：`@weave.op` 装饰函数 → Call 树（op/call 层级）；Agent 场景心智模型为 Agent → Conversation → Turn → LLM Call + Tool Call，并原生接收 OTel GenAI span。**
- Source: W&B Weave Documentation；Trace your agents — W&B Docs
- URL: https://docs.wandb.ai/weave ；https://docs.wandb.ai/weave/guides/tracking/trace-agents
- Date: 2026-08-06 / 2026-08-11
- Excerpt: "The Weave SDK emits OTel spans that conform to the GenAI semantic conventions and GenAI agent span conventions. Weave accepts any OTel span, stores all attributes, and makes them queryable." UI 呈现："Conversations tab shows all conversations with a minimap of turn activity. The Conversation detail view… shows all turns, its LLM calls, tool executions, token counts, and any attached feedback."
- Context: W&B 视频资料佐证心智模型："Agent → Conversation → Turn → LLM Call + Tool Call"。Weave 的 session 级分组（conversation_id）对应 Langfuse session / OTel `gen_ai.conversation.id`。
- Confidence: 高（官方文档）

### 主题 2：Trace 可视化 UI 范式

**Claim 2.1 — Langfuse trace 详情：Tree/Timeline(waterfall) 平权切换 + Agent Graph + Log 视图；Agent Graph 有"聚合/展开"双模式。**
- Source: New Trace View — Langfuse Changelog；AI Agent Observability — Langfuse Blog
- URL: https://langfuse.com/changelog/2025-03-19-new-trace-view ；https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse
- Date: 2025-03-19 / 2026-08-17（更新）
- Excerpt: "Tree/Timeline Toggle: Switch between chronological and hierarchical views that are now fully on par in terms of metrics and scores." Agent Graph 双模式：Aggregated（"one unique step name… Repeated calls collapse into a single node with a counter… Loops drawn as cycles… grasping structure and complexity at a glance"）vs Expanded（"as it ran… every call is its own node and loops unroll in execution order… pinning down exactly where something happened"）。"The layout is deterministic, so a trace draws the same way every time you open it."
- Context: "聚合看结构、展开看执行"的双模式直接适用于 canvas 节点：节点概览用聚合图，回放/调试用展开序列。确定性布局（同一 trace 每次打开渲染一致）也是值得借鉴的细节。
- Confidence: 高（官方）

**Claim 2.2 — Weave trace 视图四种可视化 + 五种 scrubber；默认树带 per-op cost、耗时、状态指示。**
- Source: Navigate the Weave Trace view — W&B Docs
- URL: https://docs.wandb.ai/weave/guides/tracking/trace-tree
- Date: 2026-08-31
- Excerpt: "Use code composition view to understand call logic, flame graph view to understand performance over time, and graph view to understand structure." "The default view of the trace tree shows stack hierarchy, cost per op (if available), execution time, and status indicators." Scrubbers: "Timeline: Chronological order of events；Peers: Ops sharing the same type… jump to the next execution of predict；Siblings: Ops with the same parent；Stack: Traverse up or down the call stack；Path: Iterate through all calls with the same code path."
- Context: scrubber 是"低成本 time-travel"的范本——Peers scrubber（跳到下一个同名 op）对循环中第 N 次工具调用的定位特别有用，canvas 回放可直接借用。
- Confidence: 高（官方文档）

**Claim 2.3 — 业界成熟 APM 范式：Flame Graph（默认，回答"时间去哪了"）/ Waterfall（每行一 span，聚焦局部）/ Span List / Map；火焰图与瀑布是同一数据的两种投影（y 轴=深度 vs y 轴=树序）。**
- Source: Trace View — Datadog Docs；langfuse issue #16219（flame graph 提案）；Visualize spans — Coralogix Docs
- URL: https://docs.datadoghq.com/tracing/trace_explorer/trace_view/ ；https://github.com/langfuse/langfuse/issues/16219 ；https://coralogix.com/docs/user-guides/data_exploration/spans/visualize/
- Date: 2026-08-06 / 2026-08-17 / 2026-09-03
- Excerpt（Langfuse issue，对优缺点论证最清晰）: "Hotspot detection — bar width = duration, so the most expensive span… is visible by area at a glance. In a waterfall you have to sum durations across rows mentally. Parallelism & cost peaks — agents execute spans concurrently… A flame view stacks parallel spans vertically… Nesting depth abuse — y-axis encodes depth, so pathological nesting (agent → sub-agent → tool → LLM → …) shows up as tall columns"；"A flame view is the same data re-projected: y = nesting depth instead of row order"。
- Context: 瀑布优点（Datadog/Coralogix）："each row corresponds to a span… useful for isolating and focusing on relevant parts"。树状优点：不受时间布局假设影响（见 2.4）。
- Confidence: 高

**Claim 2.4 — 瀑布图的已知失效模式：root span 早于后代结束（流式 handler、长活 agent 会话）时按 root 时长缩放会溢出；树视图不受影响。**
- Source: traceroot-ai/traceroot issue #1003（GitHub）
- URL: https://github.com/traceroot-ai/traceroot/issues/1003
- Date: 2026-06-01
- Excerpt: "The timeline scales every bar by the root span's own duration… For traces where the root finishes before its descendants… a long-lived agent session whose root operation is just one early slice… each child bar's offset/width is divided by a too-small denominator and overflows the viewport. The tree view is unaffected because it doesn't use timing for layout."
- Context: Canvas 节点的 agent 会话极可能"根先结束、后台任务继续"，时间轴缩放应基于 max(span.end) 而非 root.duration。
- Confidence: 中高（单一开源项目 issue，但机理明确、可复现）

**Claim 2.5 — 泳道范式：社区明确要求"每条并行 trace 一条 lane、共享时间轴"看执行重叠；分层泳道（call/turn/STT/LLM/TTS）也是语音 agent 的推荐分层。**
- Source: langfuse discussions #16924；OpenTelemetry for AI Voice Agents — Hamming AI
- URL: https://github.com/orgs/langfuse/discussions/16924 ；https://hamming.ai/resources/opentelemetry-voice-agents-tracing-guide
- Date: 2026-09-02 / 2026-02-25
- Excerpt: "one lane per selected trace/root observation, all using the same time axis, so I can see the overlap at a glance. A simple Gantt-style view… this would be for comparing several independent traces side by side."（Hamming 分层表：Call → Turn → Audio input(STT/VAD) → Reasoning(llm.inference, llm.tool_call) → Audio output(TTS) → Side effects(webhook/db) → Evaluation）
- Context: 未见主流 LLM 观测工具把泳道作为单 trace 主视图；泳道的公认价值在"并行/多单元共享时间轴"。Canvas 多 agent 并行执行时泳道是正确选择。
- Confidence: 高（需求真实存在）/ 中（作为主流 UI 范式尚少落地）

### 主题 3：实时流式 trace

**Claim 3.1 — Braintrust Live tail：实时追加新 trace 行、闪烁高亮、tab 隐藏自动暂停；另有终端 live view。**
- Source: View your logs — Braintrust Docs
- URL: https://www.braintrust.dev/docs/observe/view-logs
- Date: 2026-09-17
- Excerpt: "Select **Live tail** to stream new rows as they arrive. New rows are highlighted with a flash animation, and streaming pauses automatically when the browser tab is hidden." "Use `bt view logs` to open a live, scrollable view of your project's logs from the terminal."
- Context: 实时 trace 列表层范式。细节（闪烁提示新行、隐藏 tab 暂停）直接可用于 canvas 节点"直播中"状态设计。
- Confidence: 高（官方文档）

**Claim 3.2 — 实时内容流分层：进度事件流（on_tool_start/on_chain_start）与 token 流（on_chat_model_stream）分通道订阅；LangGraph 用 stream_mode 区分 messages/updates/custom/values。**
- Source: LangChain Interview Q&A — interviewcoder.co；Streaming in LangGraph — neurals.ca
- URL: https://www.interviewcoder.co/blog/langchain-interview-questions ；https://neurals.ca/tech/langchain/langgraph/streaming/
- Date: 2026-05-14 / 未标注
- Excerpt: "`astream_events` (v2)… streams every intermediate event in the whole chain: each model start, each token, each tool call… filter for the event types you care about (`on_chat_model_stream` for tokens, `on_tool_start` for 'calling tool X'), and render a live activity feed. The senior point: stream intermediate steps so a multi-second agent run feels responsive instead of a frozen spinner, and so users can see and trust what the agent did." LangGraph metadata "tells you which node and which LLM call it came from, so a UI with multiple agents can route tokens to the right bubble."
- Context: SSE/WebSocket 推送 + 事件过滤是通用实现路径。多 agent 下 token 必须带节点归属 metadata 路由。
- Confidence: 中高（二手工程博客，与官方 API 一致）

**Claim 3.3 — AgentLens（开源参照）：SSE 实时 span 追加 + frame-by-frame scrubber 回放 + DAG 拓扑图，证明"实时流与回放共用同一份 span 存储"可行。**
- Source: Show HN: AgentLens — Hacker News
- URL: https://news.ycombinator.com/item?id=47205382
- Date: 2026-03-01
- Excerpt: "Topology graph — see your agent's tool calls, LLM calls, and sub-agent spawns as an interactive DAG; Time-travel replay — step through an agent run frame-by-frame with a scrubber timeline; Live streaming — watch spans appear in real-time via SSE."
- Context: 自描述（Show HN），但功能组合（live + replay 同源）与 Phoenix "supports live streaming of trace logs"（zenml 对比文）相互印证。
- Confidence: 中（自述性来源）

### 主题 4：成本/延迟/token 指标聚合

**Claim 4.1 — LangSmith 仪表盘指标模型：Latency(p50/p99/avg)、TTFT、Tokens（total/input/output × sum/avg/percentile）、Cost、Feedback、Ratio（自定义分子分母）；预置 dashboard 按 Traces/LLM Calls/Cost&Tokens/Tools(top5)/depth-1 Run Types/Feedback 分节。**
- Source: Monitor projects with dashboards — LangChain Docs
- URL: https://docs.langchain.com/langsmith/dashboards ；https://docs.smith.langchain.com/observability/how_to_guides/dashboards
- Date: 2026-09-21 / 未标注
- Excerpt: "Cost & Tokens: Total and per-trace token counts and costs, broken down by token type"；"Tools: Run counts, error rates, and latency stats for tool runs broken down by tool name… Limits to top 5"；"Run Types: …runs that are immediate children of the root run. This helps in understanding the high-level execution path of agents."
- Context: "depth-1 run 聚合看 agent 高层执行路径"是优秀的聚合思路——canvas 节点概览可只聚合第一层子步骤的耗时/类型分布。
- Confidence: 高（官方文档）

**Claim 4.2 — Langfuse 成本模型：per-generation 记录 usage_details 与 cost_details，按 usage type 细分（input/output/cached/audio/reasoning tokens）；ingested 值优先于 inferred 值；推断靠模型定义表（regex 匹配 model 名 × 单价），每日自动审计官方定价。**
- Source: Token & Cost Tracking — Langfuse Docs
- URL: https://langfuse.com/docs/observability/features/token-and-cost-tracking
- Date: 2026-08-17
- Excerpt: "For every LLM generation, Langfuse records two things, each broken down by usage type (for example input and output, or more specific types like cached_tokens and audio_tokens)… When both are available, ingested values take priority over inferred ones"；"A daily automated audit checks official provider sources for changed prices… Because inferred costs are calculated at ingestion time, updated defaults apply only to new generations."
- Context: 支持 pricing tiers（如 >200k input tokens 单价上调）。reasoning 模型（o1 系）无法靠 tokenizer 推断，必须 ingestion。
- Confidence: 高（官方文档）

**Claim 4.3 — Weave 成本：每个 call 的 summary["weave"]["costs"] 按模型聚合 prompt/completion 成本；项目级成本=对 trace_roots_only 的 calls 求和。**
- Source: Track costs — W&B Docs
- URL: https://docs.wandb.ai/weave/guides/tracking/costs
- Date: 2026-06-11
- Excerpt: "aggregate the per-call costs returned by Weave… `client.get_calls(filter={\"trace_roots_only\": True}, include_costs=True)`… `cost[\"prompt_tokens_total_cost\"]`, `cost[\"completion_tokens_total_cost\"]`."
- Context: 只聚合 root call 避免重复计数——canvas 聚合子树成本时同理（每层级只算一次）。
- Confidence: 高（官方文档）

**Claim 4.4 — trace 头/详情页聚合范式：span 数、起止时间、状态、总 token、总延迟、总成本置顶；左侧层级列表每节点带 duration 与 token/cost 徽章；右侧选中节点详情（Preview/Scores/Attributes tabs）。**
- Source: Traces — Kubesense Docs；OpenInference Best Practices — Arize AX Docs
- URL: https://docs.kubesense.ai/docs/14-llm-observability/observability/traces ；https://arize.com/docs/ax/cookbooks/tracing/openinference-best-practice
- Date: 未标注 / 2026-07-31
- Excerpt: "The header shows the span count, start and end times, status, total tokens, latency, and total cost. The left side displays the parent operation and its child generations or tools, with duration and token/cost badges for each node."
- Context: 三栏（头聚合 / 层级+徽章 / 详情 tab）是 Langfuse、Arize、Phoenix 趋同的布局，canvas 节点窗口可直接套用。
- Confidence: 中高

### 主题 5：Replay / time-travel

**Claim 5.1 — LangGraph time travel：每个 super-step 后持久化 checkpoint（checkpoint 元数据 + 完整 state values + 待执行任务 tasks + next 节点），支持 Replay（从检查点原样续跑，之前节点不重执行）与 Fork（update_state 改状态后分叉，原历史不动）。**
- Source: Time travel — LangChain Docs；Use time-travel — LangChain Docs（py/js）
- URL: https://docs.langchain.com/oss/python/langchain/frontend/time-travel ；https://docs.langchain.com/oss/python/langgraph/use-time-travel
- Date: 2026-07-29 / 2026-06-11
- Excerpt: "Every state change in a LangGraph agent creates a checkpoint, a complete snapshot of the agent's state at that moment. Time travel lets you inspect any checkpoint, view the exact state the agent held, and resume execution from that point to explore alternative paths. It's a debugger, an undo button, and an audit log all in one." "Nodes before the checkpoint are not re-executed (results are already saved). Nodes after the checkpoint re-execute… (which may produce different results)." "This creates a linear timeline of every decision the agent made… Your UI can render this timeline and let users jump to any point."
- Context: 官方明确说"你的 UI 可以渲染这条时间线并让用户跳到任意点"——这正是 canvas 回放节点的产品形态。注意重放后段是非确定性的（LLM 会重跑）。
- Confidence: 高（官方文档）

**Claim 5.2 — 工程原则：回放能力 = append-only 步骤快照；原地覆盖则退化为 crash recovery。Fork-with-edit 是检验假设的"受控实验"。**
- Source: Time-Travel Debugging for AI Agents with LangGraph.js Checkpoints — dev.to (Gabriel Anhaia)
- URL: https://dev.to/gabrielanhaia/time-travel-debugging-for-ai-agents-with-langgraphjs-checkpoints-42ie
- Date: 2026-08-06
- Excerpt: "Persist a checkpoint per step, keyed by run and sequence, never overwrite in place… `append`, not `upsert`. The moment you overwrite, you have crash recovery and you no longer have a recording." "`updateState` writes a new checkpoint descending from that one… The original history is untouched, so you can fork the same frame repeatedly with different values. That is the closest thing to a controlled experiment available on a system whose core component is nondeterministic."
- Context: 对"环境操作与产物变化"的记录尤其适用：文件 diff/产物版本也应 append-only 存快照。
- Confidence: 中高（高质量工程博客，原则与 Temporal event sourcing 一致）

**Claim 5.3 — 观测平台的 replay 现状：Braintrust 是"读 trace + playground 重跑 prompt"（非真 replay）；Kitaru 类工具做"录制应答式真 replay"（tool policy: history/static/passthrough，on_miss=fail，防止副作用重复）。**
- Source: Braintrust vs Langfuse vs Kitaru — ZenML Blog；Kitaru vs Braintrust — ZenML
- URL: https://www.zenml.io/blog/braintrust-vs-langfuse ；https://www.zenml.io/compare/kitaru-vs-braintrust
- Date: 2026-09-16 / 未标注
- Excerpt: "You can replay the exact sequence of decisions, tool calls, and outputs that led to the failure. That is reading the trace, not re-executing it… From a trace, you can re-run a prompt or send logged prompts and inputs into a playground. There you can swap the prompt or edit instructions, and the LLM call runs again." Kitaru："Re-executes a recorded production session with tool calls answered from the recording… Tool policy on replay: history, static, passthrough, with on_miss set to fail… So a refund is not issued twice."
- Context: 重要区分：**回放（查看）≠ 重放（重执行）**。重执行时副作用工具（退款、发邮件）必须有策略门控。Canvas 若做"从某步重跑"，需为副作用节点提供 mock/passthrough 策略。
- Confidence: 高（对比评测，事实性描述）

**Claim 5.4 — 纯视觉回放的低成本实现：把 astream_events 全事件记录为 JSONL，之后回放进 Langfuse/LangSmith 查看器；Weave 用多种 scrubber 在已存 trace 内"时间旅行"。**
- Source: Streaming in LangGraph — neurals.ca；Navigate the Weave Trace view — W&B Docs
- URL: https://neurals.ca/tech/langchain/langgraph/streaming/ ；https://docs.wandb.ai/weave/guides/tracking/trace-tree
- Date: 未标注 / 2026-08-31
- Excerpt: "Debugging & replay: Subscribe to `astream_events`. Record every `on_*` trace event to a JSONL file, later, replay it into a Langfuse / LangSmith viewer."（Weave scrubber 引文见 Claim 2.2）
- Context: 证实"事件日志 → 回放 UI"链路无需运行时框架支持，纯数据回放即可交付 canvas 回放节点 MVP。
- Confidence: 中（博客建议性内容）/ 高（Weave 官方）

---

## 三、综合结论

1. **数据模型趋同已是事实**：LangSmith run tree / Langfuse observation / OpenInference span kind / OTel GenAI / Braintrust span type / Weave call，全部收敛为"类型化 span 树 + trace 级上下文 + session 级分组"。canvas 节点数据模型直接采用 OTel GenAI 词汇（invoke_agent/chat/execute_tool/retrieval/plan），同时保留内容（messages）与元数据分离、内容 opt-in 的分层。
2. **UI 范式没有银弹，主流做法是"树+瀑布"双视图打底，火焰图与 Agent 图补充**；泳道用于并行单元共享时间轴（社区有明确需求、落地尚少，是差异化机会）。
3. **实时体验的关键细节**：span start/end 增量渲染、新事件闪烁高亮、tab 隐藏暂停、进度事件与 token 流分通道、多 agent token 按节点路由。
4. **指标聚合三级制**：span 徽章 → trace 头（span 数/总 token/总成本/总延迟）→ dashboard（p50/p99、TTFT、按类型分组、Top5 工具、depth-1 路径分布）。成本=定价表×token，写入时计算，真实上报值优先。
5. **回放两级路线**：先做事件级 scrubber 回放（纯前端、append-only 事件日志，参考 Weave scrubbers / AgentLens），再做 checkpoint 级 fork/replay（参考 LangGraph；副作用节点需 mock 策略门控，参考 Kitaru 的 tool policy）。

## 四、局限与未决问题

- 未实测各工具 UI（基于文档/changelog/issue 的二手证据）；"用户偏好"无权威调研数据，以社区 issue/discussion 需求作为代理证据。
- OTel GenAI 约定仍处 Development 状态（v1.42.0 起独立仓库），属性名可能变化；报告中属性名以 2026 年中版本为准。
- Braintrust、Weave 的 trace 详情页视觉布局缺乏公开细节文档，以数据模型与相邻文档推断。
- Phoenix 的实时流式 UI 仅见二手描述（"supports live streaming of trace logs"），未找到官方文档原文，置信度中。
