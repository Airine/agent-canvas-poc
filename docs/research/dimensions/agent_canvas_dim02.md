# Agent Canvas 维度 02：通用 agent 工作台如何可视化单个 agent 的任务执行过程

调研时间：2026（基于公开资料检索，22 次独立搜索，中英文混合）
覆盖产品：Devin、Manus、OpenHands、Factory AI、Genspark、MiniMax Agent、Kimi OK Computer、ChatGPT agent 模式；另参考 Cursor/Gemini Deep Research/Suna、OpenAI Operator、ATOF/NVIDIA、Thoughtworks AI Agent HCI 分析等。

---

## 一、对本产品的设计启示（5–8 条）

1. **「对话流 + 计算机画面」双窗格已是行业事实标准**（Devin 的 Follow Devin + Shell/Browser/Editor tabs；Manus 的 chat + Computer 四 app；Kimi OK Computer 左 chat 右虚拟电脑；ChatGPT agent 活动流 + 虚拟电脑；MiniMax 右侧「视窗」）。对本产品意味着：每个 agent 节点内部应包含「对话/推理流」与「操作画面」两个联动视图，而不是二选一。
2. **双窗格的痛点是「多模块对应关系不清晰」**（Thoughtworks HCI 分析点名 Manus/Gemini 类产品）。必须做显式同步机制：当前执行步骤高亮 ↔ 画面自动跟随、点击步骤可跳转到对应画面/时间戳（Devin「点击进度更新查看该步的代码编辑或 shell 命令」、Follow Devin 进度条定位是正面案例）。画布产品中应让「时间轴 scrubber」成为节点的标准部件。
3. **回放优先用「事件流重建」而非录屏**：OpenHands 的 event-stream 架构、NVIDIA ATOF「lossless replay」规范、Manus 的 `?replay=1` 分享链接、Devin 的 timelapse 都表明：记录结构化事件（LLM 调用/工具调用/截图/文件 diff），回放时按时间轴重放状态，可搜索、可定位、可分享，存储和检索远优于视频。Manus 回放链接成为用户自证与传播的手段（「回放地址」几乎出现在每一篇中文实测里）。
4. **Plan/Todo 是一等公民 UI，且要「可编辑、可勾选、可锚定进度」**：Manus 生成 to-do 文档逐项打勾；Kimi OK Computer 用 `[x]`/`[-]` 标记完成/进行中；Devin Interactive Planning 允许用户执行前审阅修改计划、执行中 checkpoint 同时回滚文件和记忆。节点设计应包含 todo 面板，并把 todo 项作为时间轴上的进度锚点。
5. **人工介入需要分层三级设计**：(a) 轻量——随时插话/暂停（OpenHands 随时 interrupt、Esc 暂停；Devin 发消息自动唤醒会话）；(b) 重量——Take Over 接管虚拟电脑（Manus、ChatGPT agent「…→Take over browser」），接管期间**不截图**（OpenAI 官方明确的隐私设计）；(c) 门槛——decision gate/approval（ChatGPT 提交预订前请求确认、watch mode 监督敏感站点）。节点应同时支持这三级介入，并在 UI 上清晰区分当前控制权归属（agent 驾驶 vs 人驾驶）。
6. **过程透明 = 信任，且是最大好评点；黑盒与「慢且不可见」是最大吐槽点**：Manus「Manus's Computer 实时观看」、Genspark「可视化思维过程、每步调用了什么工具」、MiniMax「白盒视窗展示当前进程/Request/Response」均被评测者点名表扬；ChatGPT agent 被 NN/g 批「慢、接管窗口低分辨率无法调整」；Manus 被吐槽 credit 消耗不可预测。节点应实时显示当前动作与资源消耗（token/credit 仪表盘）。
7. **执行过程本身是可分享的 artifact**：Manus 的 `manus.im/share/xxx?replay=1` 让每篇评测文都能嵌入完整执行回放并支持二次交互（点击/分享/复制）；Kimi 任务结果有 `kimi.com/share` 链接。画布节点应支持「分享该节点某次执行的回放视图」。
8. **结果呈现割裂 + 版本管理缺失是现存空白**：Thoughtworks 分析指出当前 agent 产物分散在多窗口/多平台、无法直接在结果上标注修改、缺乏历史版本追溯回滚。这正是「产物可视化节点」的机会：产物就地渲染（PPT/网页/表格可直接编辑）、绑定版本/checkpoint（参考 Devin checkpoint 同时回滚文件与记忆、Claude Code/Replit 的 checkpoint 机制）。

---

## 二、执行过程的 UI 结构（双窗格 / 时间线 / 同步机制）

**Claim**: Devin 采用「左侧会话列表 + 中间对话流 + 右侧 Progress/Shell/Browser/Editor 多 tab」结构，顶部另有 Timelapse/IDE/Browser 三个视图切换；初看信息量大。
Source: DataCamp 实测教程《Software Development With Devin》
URL: https://www.datacamp.com/tutorial/devin-ai
Date: 2025-06-26
Excerpt: "There is a chat-like interface, where you can follow Devin's reasoning and interact with it. The right side of the screen is taken up by a panel with several tabs: Progress, Shell, Browser, and Editor. … At the top right of the screen, there is another set of tabs: Timelapse, IDE, and Browser. … The UI is a little overwhelming at first glance, but it is fairly easy to navigate once you know what everything does."
Context: 第一方上手的 UI 拆解；同时说明 Devin 沙箱 = shell + VSCode 式编辑器 + Chrome 浏览器
Confidence: 高

**Claim**: Devin 提供「Follow Devin」窗口，用户可通过底部进度条定位到任意执行步骤查看详情；进度更新可点进查看该步的具体代码编辑或 shell 命令。
Source: Siyu's Newsletter《AI Agent 产品交互设计：设计模式与案例分析》(Thoughtworks)；GitHub agent-patterns-ts
URL: https://siyujia.net/posts/ai-agent-hci ; https://github.com/blessanm86/agent-patterns-ts/blob/main/src/todo-lists/README.md
Date: 2025-06-07 / 2026-02-22
Excerpt: "Devin 则提供"Follow Devin"窗口，用户可通过下方进度条定位到任意步骤查看详情"；"During execution, progress updates are visible in the UI — users can click into any update to see the specific code edits or shell commands from that step."
Context: HCI 设计模式分析；对比 Cursor 的对话步骤↔代码高亮对应
Confidence: 高

**Claim**: Manus 采用双窗格：一侧标准 chat，另一侧观察 agent 操作，agent 可在四个 app（搜索、浏览器、终端、文档编辑）间切换；分配任务后 Manus 会创建 to-do 文档逐项完成并标记。
Source: Acquired/相关播客转录（Apple Podcasts）
URL: https://podcasts.apple.com/us/podcast/trumps-first-100-days-tariffs-impact-trade-ai-agents/id1502871393?i=1000705909034
Date: 2025-05-02
Excerpt: "Manus offers a dual-pane view: one for standard chat and another to observe the agent's actions. The agent can toggle between four apps: search, browser, [terminal], and document editing. When assigning a task, Manus creates a to-do list in a document. The agent sequentially completes tasks, marking them as done."
Context: 对 Manus 发布初期 UI 范式的描述，认为"this UI paradigm will become standard"
Confidence: 高（多个独立来源交叉验证四 app 结构）

**Claim**: Manus 界面 = chat 线程 + 实时 computer view + 进度指示器；发送 prompt 后输出步骤大纲和详细 action log（含中间状态与产出的链接）；支持任务中途 Take Over 接管并归还控制。
Source: arXiv 用户研究论文《Industry Aspirations vs. User Realities with AI Agents》
URL: https://arxiv.org/html/2509.14528
Date: 2026-05-03
Excerpt: "Its interface combines a chat thread, live computer view, and progress indicators, making ongoing work visible. When a user sends a prompt, Manus typically outlines steps and emits a detailed action log with links to intermediate states and outputs. Users can also intervene mid-task via 'Take Over,' manipulate the computer, and return control."
Context: 学术用户研究，对 Manus 与 Operator 的 HCI 结构做对比
Confidence: 高

**Claim**: Kimi OK Computer 为「左侧聊天框 + 右侧虚拟电脑」结构；任务开始前先写待办事项做整体规划，再逐步执行；右侧呈现虚拟电脑中的各类操作。
Source: 智东西（新浪转载）
URL: https://finance.sina.com.cn/stock/t/2025-09-27/doc-infrxmap9785958.shtml
Date: 2025-09-27
Excerpt: "OK Computer工作界面，左侧为聊天框，右侧为虚拟电脑（图源：智东西）"；"收到任务后，Kimi会在右侧呈现它在虚拟电脑中进行的各类操作。在开始任务之前，它一般会撰写待办事项，对任务流程进行全面规划，然后再正式执行。"
Context: 官方灰度发布 + 一手实测
Confidence: 高

**Claim**: ChatGPT agent 模式执行时屏幕左侧实时展示操作流程，虚拟电脑可切换显示方式，可随时中断并接管浏览器；官方称「屏幕上的语音播报会实时展示具体操作流程」。
Source: OpenAI 官方博客（中文）；36kr 编译；Aiworks 实测
URL: https://openai.com/zh-Hans-CN/index/introducing-chatgpt-agent/ ; https://eu.36kr.com/zh/p/3383937332558854 ; https://aiworks.tw/blog-chatgpt-agent-intro/
Date: 2025-07-17 / 2025-07-17 / 2025-09-03
Excerpt: "在执行任务时，屏幕上的语音播报会实时展示 ChatGPT 的具体操作流程。您可随时中断并接管浏览器操作"；"屏幕左侧实时显示它的操作流程；若需要登录，系统会切换到「接管模式」安全输入凭证"；"可以透过点按运作介面右上方的「設置」按鍵，切換 ChatGPT agent 的操作顯示方式"
Context: 官方发布 + 第三方实测
Confidence: 高

**Claim**: OpenHands GUI 直接连接 event stream 架构：对话式界面实时可视化 agent 当前动作（浏览网页、执行 bash/Python），用户可随时打断并给反馈；同时提供 VNC 桌面、非 headless Chromium 浏览器、嵌入式 VSCode Web 三种实时观察/介入沙箱的方式。
Source: OpenHands ICLR 2025 论文；OpenHands SDK 论文（arXiv 2511.03690）
URL: https://proceedings.iclr.cc/paper_files/paper/2025/file/a4b6ad6b48850c0c331d1259fc66a69c-Paper-Conference.pdf ; https://arxiv.org/html/2511.03690v1
Date: 2025-01（ICLR）/ 2025-11-05
Excerpt: "a rich graphical user interface that visualizes the agent's current actions … The user may interrupt the agent at any moment to provide additional feedback … This user interface directly connects with the event streams (§2.1) to control and visualize the agents and runtime, making it agent and runtime agnostic."；"VNC Desktop … Browser Access … VSCode Web: … Edit files the agent is working with, Review code changes in real time, Intervene manually when the agent gets stuck"
Context: 官方论文/文档
Confidence: 高

**Claim**: MiniMax Agent 桌面端为极简布局（中央对话区 + 右侧「MiniMax 的视窗」侧边栏），视窗实时展示当前进程、Request（生成的搜索 Prompt）、Response（实时抓回的数据）——「白盒」设计。
Source: 人人都是产品经理《MiniMax Agent 初体验》
URL: https://www.woshipm.com/ai/6332177.html
Date: 2026-01-25
Excerpt: "MiniMax Agent 的一个亮点是「MiniMax 的视窗」设计。右侧的侧边栏实时展示了 Agent 的内部逻辑：当前进程：显示正在执行的深度调研任务；Request：展示 Agent 生成的搜索 Prompt；Response：实时更新的抓取数据。这种「白盒」设计大大增强了用户对 AI 的信任感。"
Context: 一手体验文
Confidence: 高

**Claim**: Factory AI 不走单一 GUI 而是「多 surface」：云端平台异步跑 Droid（派活后回来看 PR）+ `droid` CLI 在本地终端交互式运行（可观察推理、在坏计划落地前打断）；Web dashboard 以 diff 审阅为核心（review-first）。
Source: Pickuma 实测评测；fritz.ai 评测
URL: https://pickuma.com/for-dev/factory-ai-droids-review-2026/ ; https://fritz.ai/factory-ai-review/
Date: 2026-06-10 / 2026-01-22
Excerpt: "There are two surfaces. The cloud platform runs Droids asynchronously: you assign work and come back to a PR. The `droid` CLI runs an agent in your terminal … you can watch the agent reason and interrupt it before it commits to a bad plan."；"the web dashboard lets you inspect every line of the diff, understand why the code changed, and accept or reject the result. This review-first workflow reinforces trust and control."
Context: 说明另一类范式：不做实时工作画面，而是把可视化重心放在「结果 diff 审阅」
Confidence: 中高（评测类来源）

**Claim**: Genspark Super Agent 在单一 chat 界面内「清晰可视化思维过程」：逐步追踪如何推理、调用哪些工具及原因。
Source: VentureBeat
URL: https://venturebeat.com/ai/gensparks-super-agent-ups-the-ante-in-the-general-ai-agent-race
Date: 2025-12-22（原报道为 2025-04 Super Agent 发布，页面更新于 2025-12）
Excerpt: "Super Agent clearly visualizes its thought process, tracing how it reasons through each step, which tools it invokes and why. Watching that logic play out in real time makes the system feel less like a black box and more like a collaborative partner."
Context: 媒体实测报道；Genspark 侧栏还有 Super Agent/AI Slides/AI Sheets 等专用 agent 入口
Confidence: 高

**Claim**: 通用 agent 界面四要素归纳：①用户输入/对话框 ②对话记录与工作过程展示区 ③任务步骤与进度指示 ④结果预览/代码窗口；多模块「对应关系不甚清晰」是 Manus/Gemini 类产品的通病。
Source: Siyu's Newsletter（Thoughtworks）
URL: https://siyujia.net/posts/ai-agent-hci
Date: 2025-06-07
Excerpt: "AI Agent 界面通常由以下核心元素构成：1）用户输入与对话框；2）对话记录和 AI Agent 工作过程展示区域；3）任务步骤与进度指示；4）结果预览/代码脚本窗口。像 Manus、Gemini Deep Research 等 AI Agent 产品，将对话记录、任务进度、代码和结果多个模块整合在一个界面，并会通过窗口缩小、折叠等方式弱化非核心信息，但多模块间的对应关系不甚清晰"
Context: 系统性 HCI 设计模式分析，直接命中本调研问题 1 的「窗格如何对应同步」
Confidence: 高

---

## 三、Plan/Todo、工具调用、中间产物、浏览器/终端/编辑器画面的展示方式

**Claim**: Devin 采用 Interactive Planning：会话开始数秒内分析代码库并提出初始计划，用户可在执行前审阅调整；checkpoint 是可验证的任务边界，恢复 checkpoint 同时回滚文件与记忆——计划即「可导航的时间线」。
Source: GitHub agent-patterns-ts《In the Wild: Coding Agent Harnesses》
URL: https://github.com/blessanm86/agent-patterns-ts/blob/main/src/todo-lists/README.md
Date: 2026-02-22
Excerpt: "Within seconds of starting a session, Devin analyzes the codebase and proposes an initial plan that the user can review and adjust before execution begins. … Devin's checkpoints function as verifiable task boundaries: restoring a checkpoint rolls back both files and memory, making the plan not just a progress indicator but a navigable timeline."
Context: 第三方技术模式目录，对比 Gemini CLI/Claude Code 的 todo 设计
Confidence: 高

**Claim**: Kimi OK Computer 执行时先列出 to-do list，逐项执行：完成项标 `[x]`，进行中项标 `[-]`；工具调用（数据源、文件、iPython、部署工具）逐步列出；最终交付为可交互网站/可编辑 PPTX 等成品。
Source: 博客园实测；智东西
URL: https://www.cnblogs.com/yangykaifa/p/19195822 ; https://m.zhidx.com/p/506749.html
Date: 2025-11-06 / 2025-09-27
Excerpt: "跟其他智能体一样，Kimi先会生成一个"to do list"，也就是整个项目的计划：接着就是按照这个计划一步一步执行。每执行完一步，就会做好标记，即"[x]"，正在执行的步骤，显示的是"[-]"标志"；"Kimi会列出其进行的每一步操作，包括使用数据源、使用文件、使用iPython、使用部署工具等等"
Context: 两个独立实测交叉验证
Confidence: 高

**Claim**: Manus 以 to-do list 文档驱动执行并逐项打勾；执行过程实时展示当前步数与整体进度（蓝色进度条百分比）；产物文件（过程代码、结果报告）可浏览、导出。
Source: CSDN 实测；人人都是产品经理/腾讯新闻实测
URL: https://blog.csdn.net/python12345_/article/details/146100683 ; https://news.qq.com/rain/a/20250308A07ATI00
Date: 2025-03-07 / 2025-03-08
Excerpt: "它会先做拆解，把问题拆成可执行的子任务，即todolist……它会实时跟你展示执行的过程，以及当前执行到第几步了，以及整个任务当前执行到百分之多少了，就是那个蓝色的进度条。这个体验，非常友好！"；"过程代码和结果报告可供用户浏览、导出"
Context: Manus 发布首周实测
Confidence: 高

**Claim**: ChatGPT agent 的浏览器/终端画面以「截图 + 思考文本」呈现：虚拟浏览器靠截图「看见」页面；每个动作配一段思考说明（如「需要先关闭弹窗」）；截图同时作为结果中的信源引用（sourcing pills），但截图与网页链接混用时跳转行为不一致被吐槽不直观。
Source: NN/g 实测；OpenAI Help Center
URL: https://www.nngroup.com/articles/impressions-chatgpt-agent/ ; https://help.openai.com/en/articles/11752874
Date: 2025-08-08 / 2026-04-11
Excerpt: "ChatGPT agent uses screenshots of its virtual browser window to 'see' and interact with web pages"；"These screenshots are an effective sourcing technique … but … Sometimes the embedded sourcing pills would link to the mentioned website, but, if the source was a screenshot, it would instead display an image preview … I found this inconsistent behavior unintuitive."
Context: 专业 UX 机构实测；官方文档佐证截图机制
Confidence: 高

**Claim**: Suna（开源 Manus 类）把任务拆成带复选框的阶段（Research→规划→开发→测试部署）供跟踪进度——被认为比 Manus/Genspark 的组织性更好。
Source: LinkedIn 对比评测《I Tested Suna, Manus & GenSpark》
URL: https://www.linkedin.com/pulse/ai-super-agents-review-i-tested-suna-manus-genspark-heres-goldie-virbe
Date: 2025-04-27
Excerpt: "The AI super agent breaks each task into clear phases with checkboxes so you can track progress. … This level of organization is something neither Manus nor GenSpark offered."
Context: 横向对比评测，说明「阶段化 checklist」是受用户欢迎的组织方式
Confidence: 中（单一来源，营销色彩较低但主观）

**Claim**: 学术基准研究归纳了 ChatGPT/Manus 类产品的动作空间 UI 语义：browse_interactive、click、scroll、keypress、run_ipython、read/create/edit 文件、think、message、task_tracking（维护 todo list）等——即通用 agent 的执行可视化本质上是「思考文本 + 电脑截图 + todo 状态」三种元素的时间序列。
Source: arXiv 2510.22780（TheAgentCompany 类基准）
URL: https://www.rivista.ai/wp-content/uploads/2025/11/2510.22780v1.pdf
Date: 2025-10
Excerpt: "For each step in the ChatGPT and Manus trajectories, the agent will elaborate its thought process in text, and present a screenshot of the virtual computer screen."
Context: 学术侧面对这两家 UI 输出形态的归纳；OpenHands 则可直接存取全部 action/state
Confidence: 高

---

## 四、回放能力：进度条定位、录屏 vs 事件流重建

**Claim**: Devin 支持 Timelapse 回放：底部有「Live」标识与进度条，可回放整个会话；session 持久化保存全部命令/文件 diff/浏览器操作的时间线。
Source: DataCamp 实测；fast.io 资料
URL: https://www.datacamp.com/tutorial/devin-ai ; https://fast.io/resources/devin-ai-file-management/
Date: 2025-06-26 / 2026-03-18
Excerpt: "The interactive timelapse feature (you can see the 'Live' and progress bar at the bottom) allows you to replay a session."；"Devin session records a full timeline of commands, file diffs, and browser actions. You can roll back to any previous point in a session."
Context: 两个独立来源；回放机制为事件时间线重建而非视频
Confidence: 高

**Claim**: Manus 的回放通过分享链接实现：`https://manus.im/share/<id>?replay=1` 可完整重放任务执行过程，且回放页仍可点击/分享/复制（二次交互），不是死视频；中文实测文几乎每篇都附回放链接自证。
Source: 知乎实测；CSDN 实测；GitHub awesome-manus-replay
URL: https://zhuanlan.zhihu.com/p/29042529587 ; https://blog.csdn.net/python12345_/article/details/146100683 ; https://github.com/agenaiguy/awesome-manus-replay
Date: 2025-03-09 / 2025-03-07 / 2026-07-06
Excerpt: "每个任务的链接中都有任务执行过程的全部回放"；"大家点开后就能看到Manus完整的推理和回答过程，并且它不仅仅是一个回放，你仍然可以点击、分享、复制等二次操作"；awesome-manus-replay 仓库按用例系统整理 share 链接与「回放」入口
Context: 多方证据；说明「可分享回放」成为产品信任与传播机制
Confidence: 高

**Claim**: OpenHands 的回放基础是 event-stream 架构：状态与记忆以 event log（命令、编辑、结果）表示，跨动作持久化——天然支持事件流重建式回放；UI 与 agent/runtime 解耦（agent and runtime agnostic）。
Source: OpenHands SDK 论文；ICLR 论文
URL: https://arxiv.org/html/2511.03690v1 ; https://arxiv.org/html/2407.16741v2
Date: 2025-11-05 / 2024-10-04
Excerpt: "Its state and memory are represented through an event log that records commands, edits, and results, providing persistent context across actions."；"An interaction mechanism which allows user interfaces, agents, and environments to interact through an event stream architecture"
Context: 官方论文
Confidence: 高

**Claim**: 行业正在形成「轨迹事件流无损回放」标准：NVIDIA ATOF 规范要求事件流携带足够信息以无损重建 agent 运行过程（identity、call graph、LLM 消息进出、工具调用与结果），供人事后调试、审计、评估。
Source: NVIDIA NeMo Relay 文档《Agent Trajectory Observability Format (ATOF)》
URL: https://docs.nvidia.com/nemo/relay/v0.7.0/reference/atof-event-format
Date: 2026-03-01
Excerpt: "Primary purpose: lossless replay for inspection and evaluation. An ATOF event stream MUST carry enough information to reconstruct what happened in an agent run — identity, call graph, LLM messages in/out, tool calls and results — so that humans and tools can debug, audit, and evaluate the run post-hoc."
Context: 官方规范；证明「事件流重建」是被工程界标准化的回放路径（vs 录屏）
Confidence: 高

**Claim**: 事件溯源（event sourcing）被视为带介入能力的 agent UI 的正确架构：把所有用户输入/工具结果/LLM 输出作为 append-only 事件，UI/prompt/持久化各自投影——可确定性回放、可取消、可排队审批。
Source: BAML Podcast《Event-driven agentic loops》
URL: https://boundaryml.com/podcast/2025-11-05-event-driven-agents
Date: 2025-11-05
Excerpt: "Stop mutating conversational state in-place—log every user input, tool result, and LLM chunk, then project that event stream into the UI, the prompt, and persistence as independent views. … Testing becomes deterministic—replay the same event log and assert the derived state"
Context: 工程实践播客，针对 interrupt/approval/queued input 场景
Confidence: 中高

**Claim**: ChatGPT agent 的历史记录包含聊天、浏览历史与截图，保留至用户删除；未见进度条式回放，NN/g 提到的「replay」为加速播放的录屏式回顾。
Source: OpenAI Help Center；NN/g
URL: https://help.openai.com/en/articles/11752874 ; https://www.nngroup.com/articles/impressions-chatgpt-agent/
Date: 2026-04-11 / 2025-08-08
Excerpt: "Chats, agent browsing history, and screenshots remain in your conversation history until you delete them."；"Watch a recording of this interaction … This is a ChatGPT replay of this agent interaction; it's sped up and does not depict the actual duration"
Context: 官方文档 + 第三方实测；对比表明 ChatGPT agent 在「可定位回放」上弱于 Devin/Manus
Confidence: 中高

**Claim**: checkpoint/回滚正成为 agent 产品的标配安全网：Devin checkpoints（文件+记忆双回滚）、Claude Code `/rewind`（每个 prompt 一 checkpoint，可选恢复代码/会话/两者）、Replit Agent checkpoints、Kiro checkpoints/rewind 分工（回滚文件 vs 分叉会话）。
Source: agent-patterns-ts；Claude Code 官方文档；Kiro 官方文档
URL: https://github.com/blessanm86/agent-patterns-ts/blob/main/src/todo-lists/README.md ; https://code.claude.com/docs/en/checkpointing ; https://kiro.dev/docs/checkpoints/
Date: 2026-02-22 / 2026-09-15 / 2026-08-04
Excerpt: "restoring a checkpoint rolls back both files and memory"；"Every prompt you send that starts a turn creates a new checkpoint"；"Checkpoints snapshot your files … Reach for a checkpoint when you want to undo the agent's work. Reach for rewind when you want to redirect the conversation"
Context: 官方文档多家交叉；对本产品回放+回滚设计有直接参考价值
Confidence: 高

---

## 五、人工介入交互：暂停 / 接管 / approval / 补充信息

**Claim**: ChatGPT agent 的 takeover：需要登录时暂停并提示用户接管虚拟浏览器（「… → Take over browser」）；接管期间不截图、不收集输入（密码隐私保护）；完成后交还控制，agent 从中断点无缝继续；cookies 跨会话保留避免重复登录。
Source: OpenAI Help Center
URL: https://help.openai.com/en/articles/11752874
Date: 2026-04-11
Excerpt: "If a task requires a login, ChatGPT agent will pause and prompt you to take control of the virtual browser ('…' → Take over browser). While you control the browser, no screenshots are captured. … Once you have finished the step … you can return control to ChatGPT agent. It will then seamlessly resume its automated workflow from where it left off."
Context: 官方文档；「接管期间不截图」是关键隐私交互设计
Confidence: 高

**Claim**: ChatGPT agent 在关键动作前设 decision gate（提交预订/发邮件前请求确认）；敏感站点启用 watch mode 要求用户主动监督；用户可随时暂停、要进度摘要、追加指令或接管浏览器。
Source: NN/g 实测；max-productive 评测 FAQ；c-sharpcorner 报道
URL: https://www.nngroup.com/articles/impressions-chatgpt-agent/ ; https://max-productive.ai/blog/chatgpt-agent-review-openai-ai-assistant/ ; https://www.c-sharpcorner.com/news/openai-introduces-chatgpt-agent-mode-smarter-taskhandling-ai
Date: 2025-08-08 / 2025-11-27 / 2025-07-18
Excerpt: "Once I handed back control to ChatGPT, it took a minute to review the completed form and then ask me 'Shall I go ahead and submit [the reservation] now?' … Decision gates are points where an agentic AI requests confirmation from a human before taking significant actions"；"You can pause tasks, request progress summaries, provide new instructions, or take over the browser at any time"；"'Watch Mode' for oversight on critical tasks like sending emails"
Context: UX 机构实测 + 官方发布报道
Confidence: 高

**Claim**: Manus 支持任务中途 Take Over：用户可直接操作其电脑再归还控制；遇到验证码/人工验证时会请求用户协助，之后继续执行（云浏览器文档：确保即使需要人工验证也能完成任务）；Manus 在云端 VM 运行，关浏览器/离线不影响任务继续。
Source: arXiv 用户研究；Manus 官方文档（云浏览器）；知乎实测
URL: https://arxiv.org/html/2509.14528 ; https://manus.im/docs/zh-cn/features/cloud-browser ; https://zhuanlan.zhihu.com/p/29042529587
Date: 2026-05-03 / 无日期 / 2025-03-09
Excerpt: "Users can also intervene mid-task via 'Take Over,' manipulate the computer, and return control."；"Manus 继续执行任务。这确保了 Manus 即使在需要人工验证时也能完成任务"；"Manus 的任务是在独立的虚拟机中运行的，支持同时运行多个……干完他会在浏览器中弹出提醒"
Context: 学术 + 官方文档 + 实测三方交叉
Confidence: 高

**Claim**: OpenHands 的介入设计：GUI 内随时打断给反馈；CLI 中 Esc 暂停运行中的 agent；还有 confirmation mode 提升安全性。
Source: glukhov.org OpenHands 指南；OpenHands 官方博客
URL: https://www.glukhov.org/ai-devtools/openhands/ ; https://www.openhands.dev/blog/the-openhands-cli-ai-powered-development-in-your-terminal
Date: 2026-03-15 / 2025-06-17
Excerpt: "Useful interactive controls to know early include opening the command palette, pausing the agent … Esc pauses the running agent."；"Use slash commands to get started with common tasks, and increase safety with confirmation mode."
Context: 第三方指南引用官方行为 + 官方博客
Confidence: 高

**Claim**: Devin 的介入偏「异步协作」：会话挂起后发消息即自动唤醒（sending a message auto-resumes a suspended session）；执行前通过 Interactive Planning 让用户确认/修改计划；Agent Patterns Catalog 将其归为「Synchronous Execution-Plan Confirmation」——同步确认计划后才开工，并录制 replay/video 时间线供事后审阅。
Source: Devinx 规格文档（第三方复刻 Devin UI）；agentpatternscatalog.org
URL: https://github.com/fenner888/Devinx/blob/main/specs/000-build-spec.md ; https://www.agentpatternscatalog.org/compositions/devin/
Date: 无日期 / 2026-06-17
Excerpt: "Sending a message auto-resumes a suspended session."；"Devin emits its plan synchronously for user confirmation before it starts working, and records the session into a replay/video timeline that can be reviewed after the fact."
Context: 第三方文档；与官方 Interactive Planning 描述一致
Confidence: 中

**Claim**: 豆包工作 Agent（字节，2026）的介入设计代表国内最新实践：任务可在小窗后台运行、随时插话纠偏；删除文件等危险动作才请求确认——「可以被打断、可以纠偏、关键步骤会请示」。
Source: 人人都是产品经理
URL: https://www.woshipm.com/ai/6459633.html
Date: 2026-09-04
Excerpt: "任务可以在小窗后台运行，需求变化时随时插话；遇到删除文件等动作再请求确认。它像一个可以被打断、可以纠偏、关键步骤会请示的执行者……而不是发出指令后只能干等的黑箱。"
Context: 补充国内产品对照（超出原定 8 个对象，但高度相关）
Confidence: 中高

**Claim**: 早期 agent 产品的普遍缺陷是「介入不灵活」：任务一旦开启无法中途暂停，只能等全部执行完再反馈——过程中的暂停/修正/继续/重跑机制亟待建立（2025 年中分析；此后 Manus/ChatGPT agent/Devin 均已补齐）。
Source: Siyu's Newsletter（Thoughtworks）
URL: https://siyujia.net/posts/ai-agent-hci
Date: 2025-06-07
Excerpt: "当前 AI Agent 产品一般并不允许中途暂停。任务一旦开启（甚至有时用户指令尚未输入完整，因点击回车而误开启），用户只能等全部执行完毕后，再输入反馈和重新运行。过程中的暂停、修正、继续或重新运行机制亟待建立。"
Context: 设计模式分析；作为「介入能力演进」的基线参照
Confidence: 高

---

## 六、用户好评与吐槽

**Claim**（好评）: Manus「Manus's Computer 实时观看 agent 打开页面、滚动、打字」被认为「透明建立信任」「像监督一个数字员工而非黑箱」；「可见的进度让干预更切实可行」。
Source: AiX Society 评测；theagiclock 分析；MyClaw.ai 评测
URL: https://aixsociety.com/manus-ai-vs-perplexity-comet-vs-autoglm-ai-agents-for-everyday-tasks/ ; https://theagiclock.com/articles/ai-is-the-computer-death-of-the-app ; https://myclaw.ai/zh-CN/blog/manus-reviews
Date: 2025-09-15 / 2026-03-16 / 2026-08-11
Excerpt: "you can watch the agent work – you can see it opening pages, scrolling, and typing … This transparency helps build trust"；"You're not trusting a black box. You're supervising a digital employee."；"可见的进度让干预更切实可行……这种可见性让故障更容易诊断，也让你有机会在任务继续沿错误路径浪费更多时间之前将其纠正"
Context: 三个独立评测一致好评
Confidence: 高

**Claim**（吐槽）: Manus 最大痛点是 credit 消耗不可预测——多位独立评测指出实际消耗常为官方估算的 2–4 倍，复杂任务一次烧掉整月额度；官方建议执行中留意右上角 credit 余额。
Source: penchan.co 中文评测
URL: https://penchan.co/zh-cn/ai/agent/manus/
Date: 2026-06-16
Excerpt: "这是目前最多用户抱怨的痛点。官方提供估算数字，但多位独立评测指出实际消耗常为估算的 2–4 倍，复杂任务可能一次烧掉整月额度。"
Context: 中文综合评测，引用多位独立评测
Confidence: 中高

**Claim**（吐槽+好评）: ChatGPT agent「成功、不稳、慢」：订餐厅任务成功但耗时远胜人类（11 分钟填表 vs 人 2 分钟），甚至超过网站 10 分钟订位保留窗口；接管窗口低分辨率无法调整；不做澄清式提问、来源 pill 行为不一致。决策门（decision gate）虽保安全但侵蚀价值主张。
Source: NN/g（Nielsen Norman Group）
URL: https://www.nngroup.com/articles/impressions-chatgpt-agent/
Date: 2025-08-08
Excerpt: "ChatGPT needed 11 minutes to navigate the restaurant's web forms, whereas it took me about 2 minutes"；"the web-browser window was seemingly low-resolution. I couldn't find a way to resize it"；"any agent handling payment or personal information must keep the user in the loop. While this practice mitigates serious errors, it also erodes the agent's value proposition"
Context: 顶级 UX 机构一手实测，权威性高
Confidence: 高

**Claim**（吐槽）: Devin 早期口碑差：Answer.AI 实测 20 个任务仅 3 成功/14 失败/3 不确定，且常需数天完成人类数小时的工作；「Internet of Bugs」质疑演示造假。UI 也被初用者认为信息过载。
Source: Contrary Research；Firecrawl 评测；DataCamp
URL: https://research.contrary.com/company/cognition ; https://www.firecrawl.dev/blog/best-ai-coding-agents ; https://www.datacamp.com/tutorial/devin-ai
Date: 2026-09-17 / 2026-08-03 / 2025-06-26
Excerpt: "An evaluation by Answer.AI found that out of 20 tasks assigned to Devin, only three were successful, while 14 failed and three were inconclusive"；"The UI is a little overwhelming at first glance"
Context: 多来源；注意 Devin 2.0 后已降价改进（PR merge rate 34%→67%）
Confidence: 高

**Claim**（好评）: Genspark 的思维过程可视化、免凭证即开即用、界面干净直观获媒体与用户好评；Product Hunt 用户称「simple, clean, intuitive」。
Source: VentureBeat；allaboutai 评测（引 Product Hunt）
URL: https://venturebeat.com/ai/gensparks-super-agent-ups-the-ante-in-the-general-ai-agent-race ; https://www.allaboutai.com/ai-reviews/genspark/
Date: 2025-12-22 / 2025-12-16
Excerpt: "Watching that logic play out in real time makes the system feel less like a black box"；"The design of the site is simple, clean, and intuitive, making it easy to use"
Context: 媒体实测 + 用户评论
Confidence: 中高

**Claim**（好评）: MiniMax Agent 的「白盒视窗」被评价为「大大增强用户对 AI 的信任感」；意图识别会把模糊需求细化为可执行参数（类似需求澄清环节）。
Source: 人人都是产品经理
URL: https://www.woshipm.com/ai/6332177.html
Date: 2026-01-25
Excerpt: "这种「白盒」设计大大增强了用户对 AI 的信任感。产品经理都知道，「可解释性」是 AI 产品落地的关键挑战之一。"
Context: 一手体验
Confidence: 高

**Claim**（好评+吐槽）: Kimi OK Computer 被多篇实测称「惊艳」：任务清单→逐步执行→自动测试→部署成可访问网站一气呵成；但偷懒（PPT 只做 5/10 部）、部分数据与权威源有出入。
Source: CSDN 实测；量子位
URL: https://adg.csdn.net/694cfa025b9f5f31781ab7d1.html ; https://www.qbitai.com/2025/09/337099.html
Date: 2025-12-03 / 2025-09-27
Excerpt: "首先，它会为提示词编写一个执行任务清单。然后针对每一项清单开始执行任务……等编写完所有代码开始进行自动化测试。最后生成了所有代码文件，和部署一个可以浏览的页面"；"but第6-10部怎么偷懒不做了……"
Context: 两个独立实测
Confidence: 高

**Claim**（吐槽）: 多模块信息对应难、结果呈现割裂、版本管理缺失是 2025 年中对 Manus/flowith/Gemini DR 等产品的系统性批评；结果无法直接标注修改，只能回对话框打字描述修改意见。
Source: Siyu's Newsletter（Thoughtworks）
URL: https://siyujia.net/posts/ai-agent-hci
Date: 2025-06-07
Excerpt: "多模块信息难对应……用户难以跟随理解，更谈不上及时发现和纠正问题"；"结果呈现割裂……常分散在多个窗口甚至多个平台中"；"用户大多需要在对话框中输入评价和修改意见，而无法直接在结果上面标注和编辑"；"目前缺乏历史版本的管理，用户难以追溯、比较和回滚"
Context: 系统性设计批评，直接映射本产品的「产物可视化节点」机会点
Confidence: 高

**Claim**（好评）: Factory 的「review-first」diff 审阅工作流被认为强化信任与控制；CLI 里「可在坏计划落地前打断」被认为优于纯异步黑箱。
Source: fritz.ai；pickuma
URL: https://fritz.ai/factory-ai-review/ ; https://pickuma.com/for-dev/factory-ai-droids-review-2026/
Date: 2026-01-22 / 2026-06-10
Excerpt: "This review-first workflow reinforces trust and control."；"The CLI is the better starting point, because you can watch the agent reason and interrupt it before it commits to a bad plan."
Context: 两个独立评测
Confidence: 中高

---

## 附：调研方法说明

- 独立搜索 22 次（中英文混合），覆盖 8 个目标产品 + 回放架构/设计模式两个横向维度。
- 精读全文 2 篇：NN/g《Initial Impressions of ChatGPT's Agent》、Thoughtworks/Siyu's Newsletter《AI Agent 产品交互设计：设计模式与案例分析》。
- 置信度说明：高 = 官方文档/论文/权威机构实测或多源交叉；中 = 单一第三方评测/营销倾向来源；低 = 推断。
- 未能深入的点：Genspark 执行画面的窗格级细节（公开资料多停在「思维过程可视化」层面，未见 Manus 式 computer view 的逐帧描述）；Devin 官方 docs 对 timeline UI 的专页描述（检索到的是第三方复刻规格与实测教程）；Factory AI 是否有实时工作画面（证据倾向于「无实时画面，重 diff 审阅」，标为中置信度）。
