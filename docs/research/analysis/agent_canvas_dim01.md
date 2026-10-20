# 维度 01：现有 Agent 编排画布类产品——节点与执行可视化设计调研

- 调研人：调研子 agent（维度 01）
- 日期：2026（工作流执行时间）；检索以英文+中文混合查询完成，独立搜索 24 次 + 官方文档直读
- 覆盖产品：LangGraph Studio、Dify、Flowise、Langflow、Coze/扣子、n8n、ComfyUI、CrewAI/AutoGen Studio（另含 Make.com、KNIME、Sim Studio 等旁证）
- 置信度标注：High = 官方文档/GitHub issue 直接证据；Medium = 第三方深度评测/多源一致；Low = 单源或推断

---

## 〇、对本产品（agent canvas）的设计启示（5-8 条）

1. **"画布 = 执行视图"是最被验证的信任建立机制。** 几乎所有主流产品都把"运行时状态投影到用户自己编排的同一张画布上"作为核心调试/观测体验（Dify 画布高亮执行路径、Coze 试运行实时进度、n8n 节点绿/红标记、ComfyUI 绿色执行边框）。workflowbuilder.io 的设计综述总结：一瞥画布应能回答三个问题——"什么在跑、什么完成了、什么出错了"，其余信息一键展开（High）。**对本产品：三种展示态中，"默认内嵌窗口"必须能在不打断画布的前提下回答这三个问题。**

2. **节点状态集是行业共识的六态模型，且要显式区分"未到达"与"被跳过"。** 执行态 overlay 的共识字段为：State（running/completed/failed/waiting/skipped/queued）、已耗时（运行中节点）、总耗时（完成节点）、重试次数、等待原因、失败一行摘要；未到达节点保持中性无 overlay（Medium-High，workflowbuilder + Dify/Coze/n8n 交叉验证）。分支未执行的节点若无"skipped"态会被误读为"还没跑到"——这是被点名的典型设计失误。

3. **多层级展示是普遍需求，但现有产品普遍只做了"折叠/展开"两级，没人做好三级。** ComfyUI 支持节点 collapse 为细条 + 自定义节点"compact mode"双击切换 + 子图（subgraph）折叠成单节点；Langflow/Dify 均为节点内字段滚动+右侧配置面板；n8n 只有固定大小节点+配置弹层。而学术/工程侧的"语义缩放"（semantic zoom，细节随缩放分层：high→medium→sketch→low）只在独立图引擎 demo（Grafloria）中出现，主流 agent 画布均未落地（High）。**这正是本产品"全局摘要/默认内嵌/专注全屏"三态的差异化空档。**

4. **边的语义编码已收敛为两套惯例，可直接采用并扩展：** (a) **颜色=数据类型**（ComfyUI：每种数据类型一个颜色，同色端口才能连接，强类型安全）；(b) **线型=关系类型**（n8n：实线=主数据流，虚线=AI 子节点挂载如 ai_tool/ai_memory/ai_languageModel，红色虚线=错误路由；LangGraph 可视化生态：实线=直接边，虚线=条件边）。条件分支的标签普遍放在分支出口（Dify 的 IF/ELIF/ELSE 出口标签、CrewAI 的 Router 节点）（High）。**建议：数据流/控制流/循环回边用线型区分，类型兼容用颜色区分，并支持边上"条件标签"内联编辑。**

5. **单节点/单步调试是 2025-2026 的军备竞赛焦点，且"变量缓存+重放"是正确架构。** Dify 1.5.0 的"Last Run（每个节点自动保存上次成功执行的输入/输出/元数据）+ Variable Inspect 面板（画布底部全局变量监视器，可直接编辑变量后只重跑单个节点，类似 Jupyter cell）"是被中文社区广泛报道的明星功能；n8n 的 pin data + test step 是同类但更原始的机制（且社区抱怨"必须从起点重跑"，issue #13767）；Coze 支持点击任意节点查看该次试运行的输入输出；LangGraph Studio 提供 checkpoint time-travel + 在节点执行前后编辑 state（High）。**对本产品：每个 agent 节点应有"飞行记录器"，展示态切换时默认展示上次运行的产物而非空态。**

6. **节点上的产物内联预览（而非跳转日志）是 ComfyUI 的最大口碑点，也是各 LLM 画布的短板。** ComfyUI 的 Preview Image 节点直接在节点体内渲染生成图片、KSampler 有节点内进度条（comfy.utils.ProgressBar 驱动 UI 进度）；而 Flowise/Langflow 的输出检查在 Playground 侧栏，Dify/Coze 在节点下方或点击面板查看（High）。**本产品三类节点（产物可视化/操作可视化/通用对话）应按 ComfyUI 模式把"产物"直接渲染进节点体，缩略态保留产物缩略图。**

7. **长耗时节点"看起来卡死"是普遍痛点，必须显示 elapsed time 而不仅是 spinner。** ComfyUI 自定义节点文档明确"40 秒无反馈像死机，这就是要加进度条的原因"；workflowbuilder 指出 90 秒 LLM 调用与挂起节点默认外观相同，解法是 running 节点上显示已耗时甚至预估时长（High）。

8. **主流产品的画布在大图上集体崩坏——这正是机会窗口。** Flowise 最被诟病"复杂多节点流程视觉混乱、报错信息晦涩"（2026 年多篇评测综合）；Langflow 被诟病性能/内存；ComfyUI"spaghetti workflow"催生了整套 reroute/UE 无线节点/子图整理生态；n8n 2.14.x 出现画布完全不显示执行状态的回归 bug（issue #27961）；AutoGen Studio 官方承认需要"更好的 agent 内部独白可视化"且 2025-10 起进入维护模式；LangGraph Studio 被抱怨强绑 LangSmith、定制天花板低（High/Medium）。**本产品若以"无限画布+三级展示态"系统性解决规模可读性，属于直击行业空白。**

---

## 一、各产品画布节点展示哪些信息（端口/状态/进度/token/耗时/错误）

### 1.1 LangGraph Studio（LangChain）

**Claim：Studio 的节点可视化以"图结构 + 状态快照"为核心，提供 Graph Mode（全细节：经过的节点、中间状态、LangSmith 集成）与 Chat Mode（简化对话测试）两种模式；节点本身不内嵌 token/耗时，状态数据在 checkpoint 体系里。**
- Source: LangChain 官方文档 LangSmith Studio
- URL: https://docs.langchain.com/langsmith/studio
- Date: 2026-09-21（页面抓取时间）
- Excerpt: "Graph mode exposes the full feature-set... including the nodes traversed, intermediate states, and LangSmith integrations... Chat mode is a simpler UI for iterating on and testing chat-specific agents."
- Context: 官方特性列表含 "Visualize your graph architecture / Run and interact / Manage assistants / Debug agent state via time travel"。
- Confidence: High

**Claim：Studio 的差异化调试能力是 interrupt（节点执行前后编辑 AgentState）+ time-travel（回放执行历史任意步）。**
- Source: mem0.ai 深度指南《LangGraph Studio: Complete Guide To Debugging Visual AI Agents》
- URL: https://mem0.ai/blog/visual-ai-agent-debugging-langgraph-studio
- Date: 2025-12-29
- Excerpt: "LangGraph Studio's interrupt functionality allows you to edit `AgentState` before and after node execution, while time-travel debugging lets you step through execution history to understand exactly why your agent made specific decisions at any point in time."
- Context: 同时确认 hot-reload；Graph Mode "detailed visualization with execution paths, intermediate states, and full debugging features"。
- Confidence: High（官方文档 + 多篇第三方一致）

**Claim（旁证，生态惯例）：LangGraph 图可视化的节点/边编码惯例为——绿=起点、蓝=普通节点、红=终点、紫=条件节点、橙=工具节点；实线=必执行直接边、虚线=条件边。**
- Source: VS Code 插件 LangGraph Visualizers 文档（Cytoscape.js 实现，反映 LangGraph 可视化生态惯例）
- URL: https://marketplace.visualstudio.com/items?itemName=smazee.langgraph-visualizer
- Date: 2026-09-20
- Excerpt: "🟢 Green = Start/Entry Point ... 🟣 Purple = Conditional Node ... 🟠 Orange = Tool/Action Node / Solid Line = Direct Edge - Always executed / Dashed Line = Conditional Edge - Executed based on condition"
- Context: 该第三方插件还提供 step/breakpoint/time capsule/state panel，说明社区对"逐节点调试"需求强烈。
- Confidence: Medium（非 LangChain 官方，但惯例与官方 Studio 截图一致）

### 1.2 Dify

**Claim：Dify 工作流日志/节点展示的信息维度为：每节点输入、输出、耗时、token 消耗、状态；运行历史含"结果/详情/追踪（trace）"三段，trace 展示节点顺序、单节点耗时与数据流动。**
- Source: Dify 官方文档（运行历史）+ 腾讯云实践文章交叉验证
- URL: https://docs.dify.ai/zh/cloud/use-dify/debug/history-and-logs ; https://cloud.tencent.com/developer/article/2678691
- Date: 2026-07-13（文档抓取）；2026-05-30（文章）
- Excerpt: "追踪：准确显示工作流的执行过程，包括哪些节点按什么顺序运行、每个节点耗时多长，以及数据在节点间如何流动。" / "节点执行轨迹 | 工作流画布高亮执行路径 ... Token 消耗 | 每次调用的输入/输出 token ... 延迟分解 | 每个节点的耗时统计"
- Context: Dify Agent 节点还有树状思考日志："总耗时 / Token 消耗、多轮思考过程、工具调用轨迹"（toutiao.com 2025-04-23，官方发布稿转载）。
- Confidence: High

**Claim：Dify 1.5.0（2025-06）引入"Last Run 飞行记录器 + 画布底部变量检查面板（Variable Inspect）"，实现 Jupyter cell 式单节点重跑，变量可直接编辑以模拟下游影响而不重跑上游昂贵节点。**
- Source: Dify 官方博客 + 中文社区报道
- URL: https://dify.ai/blog/dify-1-5-0-real-time-workflow-debugging-that-actually-works ; https://www.cnblogs.com/vipstone/p/18950422
- Date: 2025-06-25 / 2025-06-26
- Excerpt: "Every node now saves its last successful execution automatically... Think of it as a flight recorder for every node." / "它工作原理类似于在 Jupyter Notebook 中运行单个单元——选择任意节点，点击运行...你可以直接在此编辑大多数变量的值，从而在不重新运行昂贵或耗时的上游节点的情况下，模拟不同数据对下游节点的影响。"
- Context: 这是全行业对"逐节点调试"最完整的一次产品化，且官方自述旧流程要"翻历史、手填变量、整流重跑"，说明此前痛点真实存在。
- Confidence: High

### 1.3 Coze / 扣子

**Claim：Coze 试运行时画布实时展示"执行状态 + 单节点消耗时间"，可点击任意节点查看该次运行的详细输入输出；黄色感叹号标记缺配置的节点。**
- Source: 扣子官方文档 + 新浪教程
- URL: https://docs.coze.cn/guides_ai_powered_workflow_development ; https://k.sina.com.cn/article_7879922980_1d5ae152406801k6v8.html
- Date: 2026-08-13 / 2026-08-25
- Excerpt: "在试运行过程中，画布会实时展示运行进度，包括执行状态、单节点消耗时间等信息...你还可以单击画布中的任意节点，查看该节点在此次试运行中的详细输入与输出信息。" / "黄色感叹号代表缺少配置，必须补全"
- Context: Coze API 返回 debug_url 可打开可视化试运行界面看每节点输入输出（docs.coze.cn/developer_guides_workflow_run）。
- Confidence: High

### 1.4 n8n

**Claim：n8n 节点执行状态可视化=节点图标绿（成功）/红（失败）/转圈（执行中），数据在节点 INPUT/OUTPUT 面板查看；n8n 2.0 画布刷新加厚连接线、悬停高亮、慢节点圆形加载动画。**
- Source: GitHub issue #27961（反向证明预期行为）+ n8n 2.0 完全指南
- URL: https://github.com/n8n-io/n8n/issues/27961 ; https://note.com/yuji_yasuno/n/nfc8933ef545b
- Date: 2026-04-02 / 2025-12-10
- Excerpt: "Expected behavior: Live: nodes should highlight as they execute; History: completed nodes should be green, failed nodes red" / "Circular loading animation displayed during slow node execution ... Thicker node connectors for better visibility"
- Context: #27961 报告 2.14.x 回归 bug——画布完全无执行高亮，说明该机制是用户深度依赖的核心功能。
- Confidence: High

**Claim：n8n 节点级调试靠 pin data + test step（单节点测试），但"修改节点后必须从起点重跑/loop 存在时 pin 失效"是高频社区抱怨。**
- Source: GitHub issue #13767 + n8n 社区帖
- URL: https://github.com/n8n-io/n8n/issues/13767 ; https://www.reddit.com/r/n8n/comments/1lf0jtt/
- Date: 2025-03-07 / 未知
- Excerpt: "the 'test step' stopped working, and now it runs the full workflow... The only way to test is to run the whole workflow which is a bit time consuming when I just want to test on change." / Reddit: "It will always execute from the start if you have a LOOP in place or change something in existing nodes."
- Context: 对比 Dify 1.5.0 的变量监视器，n8n 的单点重跑体验明显落后。
- Confidence: High

### 1.5 ComfyUI

**Claim：ComfyUI 节点的信息设计是最"产物内联"的：端口+连线按数据类型着色（MODEL 薰衣草紫、CLIP 黄、VAE 玫瑰、CONDITIONING 橙、LATENT 粉、IMAGE 蓝、MASK 绿、数字灰/浅绿），仅同色端口可连接（类型安全）；错误节点红描边+未连接端口红圈；节点体内可内嵌 widget 与图片预览。**
- Source: ComfyUI 官方文档（nodes/links）+ ComfyUI Wiki
- URL: https://docs.comfy.org/basic-concepts/nodes ; https://docs.comfy.org/basic-concepts/links ; http://comfyui-wiki.com/zh/interface/node-options
- Date: 2026-08-26 / 2026-09-16 / 2024-08-09
- Excerpt: "You can only connect ports of the same color. This ensures type safety across your workflow." / "当节点存在错误时，将会展示...外框展示红色描边，对应连接节点将存在一个红圈提示"
- Context: 节点右键支持 Convert widget↔input（参数可转为外部连线输入），"convert widget to input" 是 ComfyUI 特有的一等公民交互。
- Confidence: High

**Claim：ComfyUI 支持节点内进度条——后端 comfy.utils.ProgressBar 驱动 UI 上的实时进度百分比（如 KSampler 采样进度），这是"长任务节点内联进度"的标杆实现。**
- Source: ComfyUI Cloud 节点文档（Fill Example Progress Bar）
- URL: https://comfy.icu/node/FLExampleProgressBar
- Date: 2026-08-25
- Excerpt: "ComfyUI turns those updates into the progress percentage you see in the UI - same mechanism your KSampler uses, minus the actual diffusion... when you're writing your own long-running node and it feels like ComfyUI is frozen for 40 seconds with no feedback, this is the pattern that fixes it."
- Context: 明确把"40 秒无反馈=像死机"作为设计动机。
- Confidence: High

### 1.6 Flowise / Langflow

**Claim：Langflow 节点=可编辑 Python 组件（display_name/description/icon/name），画布基于 React Flow，节点有输入/输出端口与配置字段；输出检查走 Playground（逐步 trace），而非节点体内预览。**
- Source: Langflow 官方文档（custom components）+ Microsoft Tech Community + 多评测
- URL: https://docs.langflow.org/components/custom ; https://techcommunity.microsoft.com/blog/azure-ai-services-blog/prototyping-agents-with-visual-tools/4375379
- Date: 未知（官方文档现行版）/ 2025-02-14
- Excerpt: "display_name: Shown in node header / description: Tooltip text / icon: Visual identifier" / "Playground mode allows interactive testing with detailed trace output at each node"（workforceplaybook）
- Context: 评测一致认为 Langflow"每节点配置项更多、更透明但更复杂"（200+ 节点 vs Flowise ~130）。
- Confidence: High

**Claim：Flowise 节点信息展示偏"快速跑通"——节点+左侧入/右侧出连线（React Flow），执行日志与 human-in-the-loop 节点被表扬用于调试；缺内置 token/耗时 on-canvas 展示，观测靠 LangSmith/Langfuse 外接。**
- Source: altaitools 2026 综合评测 + justsimple.tools 评测
- URL: https://altaitools.com/langflow-vs-flowise/ ; https://www.justsimple.tools/compare/langflow-vs-flowise
- Date: 2026-08-30 / 2026-06-12
- Excerpt: "execution logs and human-in-the-loop nodes praised for debugging" / Flowise cons: "Less built-in observability and eval tooling than Dify; Complex flows get visually unwieldy"
- Context: Flowise 三模式（Assistant/Chatflow/Agentflow），Agentflow V2 支持非顺序推理环。
- Confidence: Medium-High

### 1.7 CrewAI / AutoGen Studio

**Claim：AutoGen Studio Team Builder 是拖拽画布（agents/tools/models/termination 拖上画布、内联配置、可切 JSON）；Playground 流式展示 agent 动作、agent 间消息流，可暂停并中途改向。CrewAI Studio（企业版）是"AI 生成流程"路线，三种节点：single-agent / crew（内嵌多 agent 团队）/ router（条件分支）。**
- Source: madappgang 2026 框架决策指南 + CrewAI 官方博客
- URL: https://madappgang.com/blog/ai-agent-framework-decision-guide-2026/ ; https://crewai.com/blog/crew-studio-automated-agent-builder
- Date: 2026-05-04 / 2026-07-28
- Excerpt: "The Playground streams real-time agent actions, shows message flow between agents, and lets you pause and redirect mid-execution." / "Router nodes handle conditional branching, so different outcomes take different paths."
- Context: 注意 AutoGen Studio 自 2025-10 进入维护模式（"Maintenance mode since October 2025. Research prototype only"）。
- Confidence: Medium-High（madappgang 为单源深度评测；CrewAI 为官方）

---

## 二、执行时可视化（高亮/动画/日志流/逐节点调试）

**Claim：执行时节点高亮是全员标配——ComfyUI 当前执行节点绿色高亮边框、n8n 成功绿/失败红、Coze 画布实时进度、Dify 画布高亮执行路径；执行动画（脉冲/marching ants 蚂蚁线）在 Make.com 与独立引擎 demo 中最成熟。**
- Source: ComfyUI GitHub issue #4573 + ComfyUI 术语文档 + 腾讯云 Dify 文 + Grafloria demo + aiagentsquare Make 对比
- URL: https://github.com/Comfy-Org/ComfyUI/issues/4573 ; https://www.earngenix.com/glossary/queue-prompt ; https://grafloria.com/demos/index.html ; https://aiagentsquare.com/compare/n8n-vs-make
- Date: 2024-08-23 / 2026-09-17 / 未知 / 2026-05-06
- Excerpt: "each node turns green to indicate which node is currently being executed" / "A progress bar appears underneath it while a job executes, and the node currently being processed gets a highlighted outline on the canvas." / Grafloria: "nodes pulse while running, the active wire animates in your chosen style (marching ants / flow / pulse / dash flow, any speed, either direction)... a live run can be paused, stepped while paused, and continued — and every status keeps a static affordance under reduced motion" / Make: "Animated module connections, color-coded operations... a satisfying animation when scenarios run."
- Context: Grafloria 的 reduced-motion 静态降级是易被忽略的可访问性细节。
- Confidence: High（ComfyUI/n8n）；Medium（Grafloria 为 demo 引擎非产品）

**Claim：流式日志/思考过程的位置分两派——节点内派（Dify Agent 节点树状思考日志内嵌）与侧栏派（Langflow Playground、AutoGen Studio message flow 面板、Coze 左侧面板逐步日志）。**
- Source: Dify Agent 节点官方发布稿（头条转载）+ 新浪豆包教程 + madappgang
- URL: http://toutiao.com/article/7496474574389871145 ; https://k.sina.com.cn/article_7879922980_1d5ae152406801k6v8.html ; https://madappgang.com/blog/ai-agent-framework-decision-guide-2026/
- Date: 2025-04-23 / 2026-08-25 / 2026-05-04
- Excerpt: "这个机制创建了代理思考过程的树状结构，实现了代理执行路径的可视化...总耗时/Token消耗、多轮思考过程、工具调用轨迹" / "左侧面板实时查看每一步执行日志" / "The Playground streams real-time agent actions, shows message flow between agents"
- Context: 对本产品"操作可视化"节点类型：树状思考日志是值得借鉴的节点内嵌形态。
- Confidence: High

**Claim：逐节点 step-through 的能力梯度：LangGraph Studio（checkpoint time-travel + interrupt 编辑 state，最强）> Dify 1.5.0（单节点重跑+变量编辑）> n8n（pin data + test step，有断链痛点）> Coze（试运行+点节点看输入输出，不能任意点续跑）> Flowise/Langflow（Playground 逐步 trace，偏事后查看）> ComfyUI（无 step-through，靠输出缓存只重算变更节点）。**
- Source: 前述各来源综合 + ComfyUI 缓存机制说明
- URL: https://www.earngenix.com/glossary/queue-prompt 等
- Date: 2026-09-17
- Excerpt: "ComfyUI caches each node's output and only reruns the nodes whose inputs actually changed since the last click, which is why re-queueing after a small tweak often finishes much faster."
- Context: ComfyUI 的"输入指纹缓存→增量重算"是另一种降低重复调试成本的机制，适合产物流水线。
- Confidence: Medium-High（梯度排序为基于多源证据的综合判断）

---

## 三、缩略态 vs 展开态（多层级展示、双击/缩放行为）

**Claim：ComfyUI 有三层节点形态：(1) 完整节点（widget+端口）；(2) Collapse 折叠为细条（左上角灰点或右键 Collapse，保留连线）；(3) Subgraph 子图——多选节点折叠成单个可复用子图节点。自定义节点还流行"双击切 compact mode"。**
- Source: ComfyUI 官方文档（nodes 页 Subgraphs 节）+ ComfyUI Wiki + AUN 节点文档
- URL: https://docs.comfy.org/basic-concepts/nodes ; http://comfyui-wiki.com/zh/interface/node-options ; https://comfy.icu/node/AUNMultiUniversal
- Date: 2026-08-26 / 2024-08-09 / 2026-07-20
- Excerpt: "You can collapse a selection of nodes into one reusable subgraph node to tidy complex graphs and reuse the same structure across workflows." / "点击灰色的按钮，可以切换节点折叠状态" / "double-click the body to collapse the widget rows once it's stable. Double-clicking is AUN's 'compact mode' toggle"
- Context: 折叠是解决大图混乱的第一手段，但 collapse 后完全丢失信息密度（只余标题条），不是真正的"摘要态"。
- Confidence: High

**Claim：真正的"语义缩放/LOD（细节随缩放分层）"在主流 agent 画布中缺位，仅独立图引擎 demo（Grafloria）实现 high→medium→sketch→low 四级随缩放切换渲染。**
- Source: Grafloria demo gallery
- URL: https://grafloria.com/demos/index.html
- Date: 未知（抓取于本次调研）
- Excerpt: "The detail tier follows the zoom: high → medium → sketch → low. Both the reported tier and the amount of text in the DOM drop as you zoom out — the tiers are genuinely different renders, not one picture with 17 names."
- Context: Dify/Coze/n8n/Langflow 缩放只改变节点像素大小（信息密度不变），这是"无限画布+多层级展示"产品的明确空档。
- Confidence: Medium（demo 证据 + 对主流产品的负面观察）

**Claim：LangGraph Studio 的双模式（Graph/Chat）本质是"面向开发者的全细节态 vs 面向业务用户的对话态"——与三态展示中"专注全屏 vs 通用对话"的产品分层思路一致。**
- Source: LangChain 官方文档 + mem0 指南
- URL: https://docs.langchain.com/langsmith/studio
- Date: 2026-09-21
- Excerpt: "Chat Mode offers a simplified conversational interface that's perfect for testing and iterating on chat-specific agent interactions."
- Context: 佐证"同一 agent 按用户角色切换展示密度"是已被验证的产品模式。
- Confidence: High

**Claim（旁证）：KNIME（老牌节点工作流平台）用交通灯三态（配置完成黄/已执行绿/错误红）置于节点下方，且"右键→输出端口"直接查看节点产物——说明"状态灯+端口级产物查看"是 20 年验证的稳健模式。**
- Source: KNIME 官方培训材料
- URL: https://www.knime.com/sites/default/files/2021-01/2021-01-slides-l1-dw.pdf
- Date: 2021-01
- Excerpt: "If execution is successful, status shows green light; If execution encounters errors, status shows red light ... Right-click node to inspect the execution results by selecting output ports"
- Context: 非 agent 产品，但节点工作流 UX 的鼻祖之一。
- Confidence: Medium

---

## 四、边的设计语义（数据流/条件分支/循环的视觉区分）

**Claim：两套主流编码已收敛：(a) 颜色=数据类型（ComfyUI 9+ 类型色、同色才可连）；(b) 线型=关系语义（n8n：实线=main 数据流，虚线=AI 挂载 ai_languageModel/ai_memory/ai_tool/ai_embedding/ai_vectorStore，红虚线=错误路由；LangGraph 生态：实线=直接边、虚线=条件边）。**
- Source: ComfyUI 官方 links 文档 + n8n AI 节点教程 + n8n skill 文档 + LangGraph Visualizers
- URL: https://docs.comfy.org/basic-concepts/links ; https://flowagenz.com/blog/n8n-ai-node-automate-decisions-with-llms ; https://fastmcp.me/skills/details/294/n8n
- Date: 2026-09-16 / 2026-07-21 / 2026-03-06
- Excerpt: "It is a root node with sub-nodes attached through special AI-specific connection types, ai_languageModel, ai_memory, ai_tool... Visually this shows up as dashed lines instead of solid ones on the canvas." / "Main connection - Primary data flow (solid line); Error connection - Failure routing (dashed red line)"
- Context: n8n 社区证实虚线 ai_tool 连接的数据流语义与实线完全不同（不能跨 ai_tool 节点直接传 item，需 agent 中转），说明线型承载的是真实执行语义而非装饰。
- Confidence: High

**Claim：条件分支的通用做法是"分支出口内联标签"而非特殊边样式——Dify 的 IF/ELIF/ELSE 各自出口右侧加号挂分支；CrewAI Router 节点专司分流；循环在 Dify/Coze 中是"容器型节点"（循环体=内嵌子图，item/index 为循环内局部变量）而非回边。**
- Source: Dify 官方文档（If-Else/Loop 节点页）+ Coze 节点详解 + CrewAI 官方博客
- URL: https://docs.dify.ai/zh/cloud/use-dify/nodes/ifelse ; https://adg.csdn.net/6a6977c8662f9a54cb959871.html ; https://crewai.com/blog/crew-studio-automated-agent-builder
- Date: 2026-06-22 / 2026-06-20 / 2026-07-28
- Excerpt: "IF 路径...ELIF 路径...ELSE 路径作为没有条件匹配时的后备选项" / Coze 循环节点内置局部变量 "item：当前遍历单条数据；index：当前下标；loop_result：已执行完成的结果数组" / "Router node in a lead routing flow splitting into two branches"
- Context: "容器节点内嵌子图"（Dify 循环/迭代、Coze 循环/批处理、ComfyUI subgraph）是避免画布回边乱线的主流解；LangGraph 例外（允许真实回边，用虚线条件边表达）。
- Confidence: High

**Claim：边的执行态动画（数据流动效果）是感知"活着"的关键但仅少数产品做到——Make.com 执行时模块连接有动画；Grafloria 支持 active wire 多风格动画（marching ants/flow/pulse/dash flow）；workflowbuilder 建议"outgoing edge that brightens as data flows along it"。**
- Source: aiagentsquare + Grafloria + workflowbuilder
- URL: https://aiagentsquare.com/compare/n8n-vs-make ; https://grafloria.com/demos/index.html ; https://www.workflowbuilder.io/blog/live-workflow-execution-visualization
- Date: 2026-05-06 / 未知 / 2026-06-19
- Excerpt: "a canvas with movement on it – a pulsing border, an outgoing edge that brightens as data flows along it, a checkmark appearing on a finished step – communicates working software better than any progress bar."
- Context: Dify/Coze 执行时主要是节点状态变化，边动画弱；n8n 2.0 加厚了连接线但无流动动画。
- Confidence: Medium-High

---

## 五、明显短板与用户抱怨

**Claim：Flowise——画布规模失控 + 报错晦涩 + 云计费不可预测 + 被 Workday 收购后的开源方向疑虑。**
- Source: altaitools 2026 综合（约 10 篇独立评测+GitHub issue 聚合）+ madappgang
- URL: https://altaitools.com/langflow-vs-flowise/ ; https://madappgang.com/blog/ai-agent-framework-decision-guide-2026/
- Date: 2026-08-30 / 2026-05-04
- Excerpt: "the recurring gripe is that complex multi-node flows become visually messy and error messages get cryptic" / "the single most-cited Flowise complaint was two-way — canvas clutter at scale and unpredictable prediction-metered cloud cost" / "Workday acquisition raises long-term open-source direction questions"
- Confidence: Medium-High

**Claim：Langflow——生产性能与扩展性（延迟/CPU/内存泄漏/上传上限）是最被引用抱怨；单画布组件多导致"更强也更乱"。**
- Source: altaitools 2026 综合 + workforceplaybook
- URL: https://altaitools.com/langflow-vs-flowise/ ; https://workforceplaybook.ai/platform-guides/flowise-vs-langflow
- Date: 2026-08-30 / 2026-07-02
- Excerpt: "the single most-cited Langflow complaint was production performance and scaling (latency, CPU, memory leak, upload cap)" / "The canvas is more complex, but also more transparent about what is happening at each node."
- Confidence: Medium-High

**Claim：n8n——执行可视化回归 bug 频发（2.14.x 画布完全无状态高亮 #27961；1.107 底部逐步执行日志消失 #18414；1.123 起节点图标不再点亮）；错误指示"小红点"太 subtle 导致用户找不到问题节点（13 个社区帖中约 6 例根因）。**
- Source: GitHub issues #27961 / #18414 + n8n 社区帖 + altaitools 排错指南
- URL: https://github.com/n8n-io/n8n/issues/27961 ; https://github.com/n8n-io/n8n/issues/18414 ; https://community.n8n.io/t/execute-workflow-ui-keeps-running-with-success-or-failures-no-icon-light-up/237523 ; https://altaitools.com/n8n-workflow-has-issues-and-cannot-be-executed/
- Date: 2026-04-02 / 2025-08-15 / 2025-12-17 / 2026-09-02
- Excerpt: "roughly 6 of those 13 accounts — wasn't an exotic bug at all: it was that the person simply couldn't see which node was invalid, because the flag was a small icon they'd missed" / "the node icons stopped light up and data was only visible in the Executions tab"
- Context: 教训：状态视觉信号必须冗余编码（颜色+图标+位置），且执行可视化是核心功能而非锦上添花——回归即引发大量 issue。
- Confidence: High

**Claim：ComfyUI——"spaghetti workflow"是公认痛点，催生 reroute 节点、UE（use everywhere）无线节点、group/subgraph、颜色编码等整套自救生态；学习曲线陡峭。**
- Source: Apatero 整理指南 + edvardtoth 工作流文章
- URL: https://apatero.com/blog/fix-messy-comfyui-workflows-reroute-nodes-organization-guide-2025/ ; https://edvardtoth.com/technology/starter-character-workflow/
- Date: 2025-09-15 / 2025-01-28
- Excerpt: "Default ComfyUI settings show curved connection lines (splines) that create visual complexity even in simple workflows. When multiple connections cross over each other, it becomes impossible to trace data flow" / "Relies heavily on UE ('use everywhere') nodes which are amazingly useful, and dramatically reduce messy 'link spaghetti'... 'wireless' nodes that plug into matching inputs without visible links"
- Context: "无线/隐形连接"（UE 节点）是社区对连线混乱的激进解法，值得作为画布"远程数据引用"机制的参考（但牺牲可见性，需 Show links 开关）。
- Confidence: High

**Claim：LangGraph Studio——强绑 LangSmith、面向最终用户的定制天花板低、本地持久化困惑（SQLite checkpointer 配置了但 langgraph dev 仍内存态）、subgraph interrupt resume 行为反直觉；社区另起 Agent Chat UI / React Flow 自建是常见路径。**
- Source: workflowbuilder.io LangGraph Studio 指南（聚合 Reddit/GitHub）+ DataCamp 教程
- URL: https://www.workflowbuilder.io/blog/langgraph-studio-guide ; https://www.datacamp.com/tutorial/langgraph-studio
- Date: 2026-09-17 / 2024-09-17
- Excerpt: "Two frustrations kept surfacing: 1. a dependency on LangSmith they didn't want, 2. and limited customization for their specific workflow." / "'visualize and debug my graph' and 'give my product's users a way to see or operate this workflow' are, in practice, two different products" / "resuming execution re-ran an earlier step and duplicated interrupts"
- Context: 关键产品论断：开发者调试画布 ≠ 最终用户操作画布——本产品定位更偏后者，差异化成立。
- Confidence: Medium-High（聚合源，但引用了具体 issue/帖）

**Claim：Dify——Agent 仅支持有向无环调用、复杂多 Agent 协作不支持；应用颗粒度只能参数控制、无法算法插拔；监控仅有 token 用量与模型延迟等有限指标。**
- Source: 学术 PDF（doria.fi 平台对比研究）+ 山东省软件行业协会报告 PDF
- URL: https://www.doria.fi/bitstream/handle/10024/193122/serafim_de_oliveira_mariana_celi.pdf ; https://www.sdie.org.cn/staticjt/upload/file/20260122/1769045517896909.pdf
- Date: 未知（2024-2025 研究）/ 2026-01-22
- Excerpt: "Agents monitoring is provided in a limited form, offering insights on token usage and model latency, but not comprehensive performance metrics" / "其Agent只能有向无环调用，复杂多Agent协作尚不支持"
- Confidence: Medium（学术/行业报告，非一手用户帖）

**Claim：Coze——单工作流 1000 节点/1000 次执行上限、20MB 请求上限、代码节点 50 个上限；图像插件并发共享限制（主账号+子账号共享 4 并发）导致批量场景频繁踩坑；上手门槛高（需熟悉节点体系）。**
- Source: 扣子官方限制文档 + 知乎踩坑帖 + CSDN 并发绕过文 + 火山引擎教程
- URL: https://docs.coze.cn/guides_workflow_limits ; https://zhuanlan.zhihu.com/p/1926191196713223746 ; https://developer.volcengine.com/articles/7543193070491074606
- Date: 2026-06-24 / 2025-07-09 / 2025-08-27
- Excerpt: "每个低代码工作流中最多添加 1000 个节点。每次运行低代码工作流时...每次最多执行 1000 个节点" / "缺点：上手有一定难度，对开发者要求较高，需要熟悉各类工作流节点的使用"
- Confidence: High（官方限制）/ Medium（体验类）

**Claim：AutoGen Studio——官方自认"agent 内部独白可视化需改进"（调试视角），2025-10 起维护模式，研究原型定位。**
- Source: Microsoft Research 官方博客 + madappgang
- URL: https://www.microsoft.com/en-us/research/blog/introducing-autogen-studio-a-low-code-interface-for-building-multi-agent-workflows/ ; https://madappgang.com/blog/ai-agent-framework-decision-guide-2026/
- Date: 2024-06-17 / 2026-05-04
- Excerpt: "The proposed visual canvas interface for AutoGen will explore updated visualization of agent internal monologues for improved debugging." / "Status: Maintenance mode since October 2025. Research prototype only."
- Confidence: High

**Claim：AutoGen（框架层）——对话历史冗长难分析、状态分散在对话中缺乏结构化视图、官方可视化工具不足（社区红黑榜）。**
- Source: 多智能体框架对比文（CSDN/AtomGit）
- URL: https://gitcode.csdn.net/69d52c2f0a2f6a37c59da1aa.html
- Date: 2026-04-08
- Excerpt: "对话历史可能会很长...缺乏结构化的状态视图：系统状态分散在对话历史中，不够结构化；官方可视化工具不足"
- Context: 印证"对话流≠状态视图"——本产品的"全局摘要态"若能把多 agent 对话压缩为结构化状态卡片，是对 AutoGen 式 message list 的代际改进。
- Confidence: Medium

---

## 六、横向速查表（基于以上证据综合）

| 产品 | 节点常驻信息 | 执行高亮 | 单节点调试 | 多层级展示 | 边语义 | 最大短板 |
|---|---|---|---|---|---|---|
| LangGraph Studio | 节点名/类型色；状态在 checkpoint 面板 | 执行路径高亮 | time-travel + interrupt 编辑 state（最强） | Graph/Chat 双模式 | 实线=直接/虚线=条件（生态惯例） | 绑 LangSmith、定制天花板 |
| Dify | 图标+标题；运行后状态/耗时/token | 画布高亮执行路径 | Last Run + 变量检查面板单点重跑（最强产品化） | 节点+右侧配置面板；循环/迭代容器节点 | 分支出口 IF/ELIF/ELSE 标签 | 仅 DAG、多 agent 协作弱 |
| Coze | 图标+标题；黄叹号=缺配置 | 试运行实时进度+单节点耗时 | 点节点看该次输入输出（不可续跑） | 节点+配置面板；循环/批处理容器 | 条件分支出口 | 节点数/并发硬限制 |
| n8n | 图标+标题；小红点=配置错误 | 绿/红/转圈 + 2.0 加载动画 | pin data + test step（有断链痛点） | 固定节点+弹层 | 实线=main/虚线=AI 挂载/红虚线=错误 | 执行可视化回归 bug 多 |
| ComfyUI | 端口按类型着色+widget 内联+图片预览 | 绿边框+节点内进度条（最直观） | 输出缓存增量重算（无 step-through） | collapse 细条+subgraph+双击 compact | 颜色=数据类型、同色可连 | spaghetti、学习曲线 |
| Flowise | 节点+端口，配置在节点面板 | 执行日志/侧栏 | Playground 逐步 | 无 | 单一线型 | 大图混乱、报错晦涩 |
| Langflow | display_name/icon+端口+字段 | Playground trace | Playground 逐步检查 | 无（字段滚动） | 单一线型 | 生产性能/内存 |
| CrewAI Studio | 三类节点（single/crew/router） | 执行日志 | step-by-step 控制 | crew 内嵌=天然两级 | router=条件 | 企业版为主 |
| AutoGen Studio | 画布内联配置+JSON 切换 | message flow 流式+暂停改向 | 暂停/重定向（无 state 编辑） | 无 | agent 间消息边 | 维护模式、内部独白可视化弱 |

---

## 附：检索记录（独立搜索 24 次，中英混合）

1. LangGraph Studio node visualization execution graph UI features
2. Dify workflow canvas node debug single step execution visualization
3. Flowise vs Langflow canvas node design comparison review
4. n8n workflow execution visualization node highlighting animation real-time canvas
5. ComfyUI node graph execution visualization progress bar node highlight design
6. Coze 扣子 工作流 画布 节点 试运行 调试 可视化
7. LangGraph Studio docs features graph mode chat mode interrupt edit state time travel
8. Dify docs workflow node single-step debugging variable input output token usage 追踪
9. CrewAI Studio AutoGen Studio visual agent builder canvas workflow design
10. ComfyUI node collapse minimize widget colors port types design
11. n8n pin data partial execution run single node previous nodes canvas UX
12. Langflow node minimize collapse output preview playground canvas interaction
13. Dify 工作流 节点 追踪 tracing 面板 token 耗时 单步调试 画布
14. ComfyUI UX complaints steep learning curve reddit nodes spaghetti graph messy
15. LangGraph Studio 缺点 吐槽 github issue canvas UI
16. n8n docs executions canvas view node status success error icons workflow execution
17. Dify 缺点 用户抱怨 reddit workflow editor canvas limitations
18. Coze 扣子 工作流 缺点 吐槽 节点 限制
19. Langflow node execution status spinner built checkmark error indicator run single component
20. n8n AI agent sub-nodes connections dashed line main connection visual difference
21. ComfyUI executing node green border highlight queue progress
22. Flowise execution logs node status chatflow run node green check error analytics langfuse
23. Langflow node minimize button header component docs
24. Dify 画布 条件分支 边 样式 if else 迭代 循环 子画布 节点设计
+ 直读全文：https://www.workflowbuilder.io/blog/live-workflow-execution-visualization
