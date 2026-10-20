# Agent Canvas 调研 · 维度 09：对话式 Agent 执行过程的 UX 呈现模式

> 范围：Claude Code / Aider / Codex CLI / Gemini CLI / Cursor / ChatGPT / Perplexity / Genspark / Devin / Manus / Magentic-UI / OpenHands 等，聚焦「通用 Agent 节点（分析/Coding 任务）+ 根 Coordinator」的会话呈现设计。
> 调研时间：2026（检索基于当前可访问的公开网页；部分来源标注日期为未来日期系网页自标，谨慎采信）。检索轮次：8 批 × 4 query ≈ 30+ 次独立搜索（中英文混合）。

---

## 一、设计启示（给「通用 Agent 节点」的 8 条结论）

1. **渐进式披露（Progressive Disclosure）是全行业收敛出的主导模式，按三层组织信息**：`最终答复（永远可见）→ 步骤/推理摘要（默认折叠、一点展开）→ 完整 trace（深层开关/verbose 模式）`。Perplexity 的 answer-first 层级、ChatGPT 的 reasoning 折叠块、Claude Code 的 `+N lines (ctrl+o to expand)`、emberly 的 `▸ reasoning (N lines)` 都是同一模式的不同实例。**Agent 节点默认只应渲染「答复 + 步骤摘要行」，细节一律懒加载。**

2. **工具调用必须「按工具类型定制渲染」，且每种状态（调用中/结果/拒绝/错误）都要显式设计**。Claude Code 每个工具有自己的渲染组件（Edit→彩色 diff、Grep→高亮匹配、Bash→命令与输出分离），社区分析认为这是「渲染与逻辑耦合」的刻意设计；反面教材是 Codex 的统一渲染管线和「Something went wrong」式通用错误。**通用 Agent 节点应为内置任务类型（分析/Coding）预设差异化卡片，而非一个通用 JSON 块。**

3. **噪音自动折叠 + 折叠阈值可配置是刚需**。Claude Code 默认把多行输出折叠到 ~3 行并给出 `… +N lines (ctrl+o to expand)`，GitHub 上连开三个 issue 要求阈值可配置——说明「一刀切折叠」会伤害短而信息密度高的输出（如状态表）。**规则应是：长输出/日志类（npm install、测试堆栈）默认折叠为「一行摘要 + 行数」，短输出直接展示，且提供全局 verbose 开关与 per-tool 阈值。**

4. **Plan/Todo 必须外显为「吸附式（sticky）面板」，不能只是聊天流里的一条消息**。Claude Code 的 todo 会随聊天滚动消失，用户强烈要求固定面板（VS Code 扩展 issue）；Manus 把 checklist 固定在右下（`6/6`）；Codex VS Code 扩展已有持久任务列表被引用为正面范例。**Coordinator 节点的 plan/todo 应渲染在输入框上方或侧栏的固定区域，实时勾选、高亮当前项、可折叠。**

5. **状态栏是成本/状态展示的既定惯例**：模型名、上下文占用（% 或 k/总量）、累计成本（$）、耗时、git 分支/工作目录、permission 模式。Claude Code 暴露 statusLine JSON 管道（model/cost/context_window/rate_limits）催生了一个自定义生态；Codex CLI 把 status_line 做成可配置 item 数组。**Agent 节点应有常驻 footer：模型标识 + token/上下文用量 + 成本 + 耗时，且随任务滚动持久可见。**

6. **中断成本必须低于撤销成本，且「排队纠偏」与「立即中断」是两种不同操作**。Claude Code：运行中 Enter=排队（当前工具调用完成后送达）、Esc=中断（保留已完成工作）、Esc Esc=rewind 检查点；Codex CLI：Enter=steer 中途转向、Tab=排队、/fork=分支。用户研究（N=31）中最直白的诉求是 P26 的「I'd like a pause button if it's going off the rails」。**Coordinator 节点需要提供：流式实时可见 + 一键暂停/中断 + 消息排队 + 检查点回滚。**

7. **Coordinator 汇报子 agent 的通行范式是「一行委派 + 可展开嵌套树」**：Claude Code 把子 agent 渲染为单行 `code-improver(Suggest code improvements)`，后台子 agent 进 `/tasks` 面板；社区 mockup 的共识形态是「默认折叠的子任务卡片 → 展开看子 agent 完整 thinking/tool call 生命周期」。Devin 走「委派制 + work log 汇报」，Manus 走「三栏（任务列表 | 聊天 | 电脑实时视图+回放进度条）」。**根 Coordinator 节点：每个子任务渲染为折叠卡片（名称+任务描述+运行状态），展开为独立嵌套对话流；并行子 agent 用面板聚合状态。**

8. **步骤文案用用户语言而非 API 名；动画本身应编码系统状态**。Perplexity 的步骤写「Checking predictions」而非技术名，被 UX teardown 点名「mirrors user mental model」；Claude Code 的 spinner 变色指示停滞、shimmer 两档速度区分「请求中/思考中」，被评价为「动画即信息」。**Agent 节点的进行中状态（spinner/骨架屏/进度动词）都应可读出系统语义，步骤标题用动宾短语（Searching…/Checking…/Editing file X）。**

---

## 二、证据（Claim / Source / URL / Date / Excerpt / Context / Confidence）

### 维度 1：TUI 范式（tool call、diff、权限确认、上下文指示）

**Claim 1.1：Claude Code 的核心 UX 哲学是「可观察的自主性（Observable Autonomy）」——流式展示每一步让用户能在走错方向的前几秒就中断，中断成本远低于撤销成本。**
- Source：how-claude-code-works（社区逆向分析，docs/12-user-experience.md）
- URL：https://github.com/Windy3f3f3f3f/how-claude-code-works/blob/main/docs/12-user-experience.md
- Date：未标注（检索于 2026）
- Excerpt："Claude Code 在这两者之间找到了一个精确的平衡点：可观察的自主性……实时可见：所有工具调用流式展示，你能在执行过程中看到参数和进度……用户可以在 Agent 走错方向的前 3 秒就按 Ctrl+C 中断……中断成本远低于撤销成本。权限弹窗甚至有 200ms 防误触延迟，可见团队对'中断的代价'有多在意。"
- Context：中文社区对 Claude Code TUI 的逐章逆向分析，被多平台转载。
- Confidence：高（一手代码级分析，多处与官方文档行为一致）

**Claim 1.2：Claude Code 为每个工具做定制渲染（Edit→彩色 diff、Grep→高亮匹配、Bash→命令与输出分离），Codex 则统一渲染管线——前者被社区称道，且被解读为「新增工具时被迫思考每种状态如何展示」的设计纪律。**
- Source：The Annotated Coding Agent（nimasadri11.github.io）；how-claude-code-works 14.13
- URL：https://nimasadri11.github.io/random/annotated-agent/ ; https://github.com/Windy3f3f3f3f/how-claude-code-works/blob/main/docs/12-user-experience.md
- Date：2026-04-10 / 未标注
- Excerpt："Codex renders tool output uniformly… A grep result and a file edit get the same visual treatment. Claude Code has per-tool rendering: a file edit shows a colored diff, a grep shows highlighted matches… Each Claude Code tool implements its own React component for display."；另一处："每个工具自带 4 种渲染方法（调用/结果/拒绝/错误），意味着所有可能的状态都被显式设计，不会退化成一个 'Something went wrong' 的通用错误页。"
- Context：对比 Claude Code 与 Codex 两套 agent 实现的深度技术文章。
- Confidence：高

**Claim 1.3：Claude Code 默认把工具输出折叠为约 3 行 + `… +N lines (ctrl+o to expand)`，折叠阈值不可配置引发至少三个独立 feature request；用户共识是「长日志折叠很好，但短的高密度输出（状态表/简报）被误伤」。**
- Source：GitHub anthropics/claude-code issues #27577 / #25776 / #12589
- URL：https://github.com/anthropics/claude-code/issues/27577 ; https://github.com/anthropics/claude-code/issues/25776 ; https://github.com/anthropics/claude-code/issues/12589
- Date：2026-02-21 / 2026-02-14 / 2025-11-27
- Excerpt："Claude Code's terminal output collapses to ~3 lines by default, with Ctrl+O toggling full verbose mode…"；"The collapsed view is great for commands with hundreds of lines of output. But for intentionally short, formatted output (status displays, tables, summaries), collapsing creates unnecessary friction"；"In a typical 30-minute session, I press ctrl+o 15-20 times just to see my own CLI output."
- Context：官方仓库 issue 区，代表真实高频痛点。
- Confidence：高

**Claim 1.4：Claude Code 的权限/模式体系：Shift+Tab 循环 default→acceptEdits→plan→bypassPermissions；Esc 中断并保留已完成工作；Esc Esc 打开 rewind 检查点（可分别恢复 code / conversation）；运行中 Enter 输入会排队而非打断。**
- Source：Claude Code 官方文档 Interactive mode；aq.dev 跨 CLI 对比
- URL：https://code.claude.com/docs/en/interactive-mode ; https://aq.dev/guides/steer-coding-agents-mid-run/
- Date：2026-09-17 / 2026-08-31
- Excerpt："Esc — Interrupt Claude… Claude keeps the work done so far"；"Esc + Esc — Clear input draft, or rewind… opens the rewind menu to restore or summarize code and conversation from a previous point"；"Queue first, interrupt second. A queued message (Enter in Claude Code, Tab in Codex CLI) is delivered at a safe boundary… Interrupt (Esc) when the agent is actively editing the wrong files."
- Context：官方文档 + 第三方横向对比指南。
- Confidence：高

**Claim 1.5：Plan mode 的本质是一个写入 plans 目录的 markdown 文件 + 只读模式提醒 + 进出 plan mode 的小状态机 + 退出时用户审批的 UX；plan 没有额外结构，价值全在「先审后做」的交互闭环。**
- Source：Armin Ronacher（mitsuhiko）博客 "What Actually Is Claude Code's Plan Mode?"
- URL：https://lucumr.pocoo.org/2025/12/17/what-is-plan-mode/
- Date：2025-12-17
- Excerpt："A plan in Claude Code is effectively a markdown file that is written into Claude's plans folder… there are recurring prompts to remind the agent that it's in read-only mode… the system prompt is the same. It is just a little bit of extra verbiage with some UX around it."
- Context：Flask 作者的逆向分析，HN 上讨论度高。
- Confidence：高

**Claim 1.6：Claude Code 用 Ink/React 做 TUI 是为了多区域独立更新（对话流 / 输入框 / 状态栏 / 权限弹窗 / spinner 互不干扰），且动画编码系统状态（spinner 由主题色渐变红指示停滞、shimmer 两档速度区分请求中/思考中）。**
- Source：how-claude-code-works 14.2/14.13；agentskillsdev Claude Skills 中文手册 ch09
- URL：https://github.com/Windy3f3f3f3f/how-claude-code-works/blob/main/docs/12-user-experience.md ; https://agentskillsdev.com/cc-harness-book/ch09/
- Date：未标注 / 2026-04-12
- Excerpt："动画即信息：Spinner 从主题色渐变为红色来指示停滞、Shimmer 用 50ms 和 200ms 两档速度分别表示请求中和思考中……每个动画都编码了系统状态，用户会在潜意识里学会读取这些视觉信号。"
- Context：两份独立中文分析相互印证。
- Confidence：中高（社区分析，非官方自述）

**Claim 1.7：Claude Code 的状态栏（statusLine）是可编程管道：官方把 model/cost/context_window/rate_limits 等 JSON 喂给用户脚本，催生了整套自定义状态栏生态；`/usage` 提供 cost/duration/代码增删行/分模型 token 明细。**
- Source：Claude Code 官方文档 costs；社区 gist「Status Line Complete Guide」；gordonbeeming.com 教程
- URL：https://code.claude.com/docs/en/costs ; https://gist.github.com/AKCodez/ffb420ba6a7662b5c3dda2edce7783de ; https://gordonbeeming.com/blog/2026-03-22/building-a-custom-claude-code-status-line
- Date：2026-09-15 / 2026-09-16 / 2026-03-21
- Excerpt：`/usage` 输出 "Total cost: $0.55 / Total duration (API): 6m 20s / Total duration (wall): 6h 33m / Usage by model: claude-sonnet-4-6: 1.2k input, 5.3k output, 940.0k cache read…"；statusLine JSON 字段含 `model.display_name`、`cost.total_cost_usd`、`context_window.used_percentage`、`rate_limits.five_hour.used_percentage`；社区教程把状态栏分三行："Line 1 (Identity)…Line 2 (Spend & limits)…Line 3 (Technical)…The grouping keeps project identity separate from costs and usage."
- Context：官方文档 + 社区最佳实践；另有 issue #35374 要求内置持久状态栏（模型/上下文%/成本/时长），说明这是强需求。
- Confidence：高

**Claim 1.8：Codex CLI 把 TUI status line 做成可配置 item 数组（model / approval / context_usage / session_id / sandbox / cwd / spinner），并把「blended token 计数 + permission/approval 模式」放进状态栏——把「我现在是什么权限模式、烧了多少 token」作为常驻信息。**
- Source：zeniteq.com Codex CLI 0.131.0 发布解读；codex.danielvaughan.com TUI 定制指南；shipyard cheatsheet
- URL：https://www.zeniteq.com/de/openai-codex-cli-0-131-0-brings-a-smarter-tui-and-codex-doctor-yivwpl ; https://codex.danielvaughan.com/2026/05/05/codex-cli-tui-customisation-keymaps-themes-status-lines/ ; https://shipyard.build/blog/codex-cli-cheat-sheet/
- Date：2026-08-25 / 2026-05-05 / 2026-04-13
- Excerpt："The TUI now offers… blended token usage, permissions and approval mode… Previously, you had to infer token consumption from model context limits. Now the status line tells you directly."；"tui.status_line = [\"model\", \"approval\", \"context_usage\"]"；`/status` 命令 "Show current model, policy, writable roots, token usage"。
- Context：版本发布说明 + 配置文档。
- Confidence：高

**Claim 1.9：Gemini CLI 的特色是内嵌伪终端（node-pty）序列化渲染——shell 命令在 PTY 中运行、快照流式推回 UI，实现双向交互（可输入、可 resize）；第三方生态（Gemini-CLI-UI）把 chat/文件树/Git/会话管理做成响应式 Web UI 并提供 YOLO 免确认模式。**
- Source：Google Developers Blog；cruzyjapan/Gemini-CLI-UI
- URL：https://developers.googleblog.com/say-hello-to-a-new-level-of-interactivity-in-gemini-cli/ ; https://github.com/cruzyjapan/Gemini-CLI-UI
- Date：2025-10-15 / 2025-07-15
- Excerpt："Our new serializer takes a snapshot of the pseudo terminal at every moment—capturing every piece of text, every color, and even the cursor's position. These snapshots are then streamed to you… It's not just a stream of text; it's a live feed."
- Context：官方博客 + 社区 Web UI 项目。
- Confidence：高

**Claim 1.10：Aider 的呈现哲学是「diff 即交付物」：edit-format 支持 diff/whole，每次修改自动 git commit，推荐用 `git diff`/`git log` 审查 AI 改动；Emacs 封装（aidermacs）则在 AI 编辑后自动弹 ediff 供 accept/reject。**
- Source：Aider best practices（terminalskills/lobehub）；aidermacs 配置文档；aider issue #3563
- URL：https://terminalskills.io/skills/aider ; https://gitee.com/mirrors/Aidermacs?skip_mobile=true ; https://github.com/Aider-AI/aider/issues/3563
- Date：2026-05-13 / 2026-08-30 / 2025-03-17
- Excerpt："Git integration — Aider commits each change; use git diff and git log to review AI changes"；"Capture the state of files before AI edits; Show diffs using Emacs' built-in ediff interface; Allow you to review and accept/reject changes."；issue 抱怨 `/diff` 输出提前折行，"should display the diff using the full available width of the terminal, similar to how git diff behaves"。
- Context：Aider 把「可审查性」外包给 git，与 Claude Code 的会话内 diff 是两种路线。
- Confidence：高

### 维度 2：结构化 chat 范式（tool call 卡片折叠/展开、reasoning 折叠、step 分组）

**Claim 2.1：「reasoning 折叠块、默认收起、可展开」是从 ChatGPT 扩散到整个生态的标准件；OpenHands 的 feature request 直接以 ChatGPT 为参照，第三方 TUI（emberly）实现为 `▸ reasoning (N lines)` + Ctrl-R 展开，hidden 时仍写入 transcript。**
- Source：OpenHands issue #12102；emberly crate 文档
- URL：https://github.com/OpenHands/OpenHands/issues/12102 ; https://lib.rs/crates/emberly
- Date：2025-12-19 / 2026-09-03
- Excerpt："Display the reasoning content in a collapsible UI element, similar to how ChatGPT handles it: Collapsed by default to keep the UI clean; Users can expand it…"；"it renders as a quiet, collapsed ▸ reasoning (N lines) trail; Ctrl-R toggles it open. The reasoning config key sets the default view (hidden still records the trace to the transcript)."
- Context：跨产品的收敛证据；Open WebUI/Locally Uncensored 等也有同样实现（thinking 默认折叠 + token 计数）。
- Confidence：高

**Claim 2.2：Cursor 官方确认：聊天中的 thinking 块本来就是 provider 返回的「推理摘要」而非完整 CoT（Anthropic/OpenAI 均如此），且折叠的 thinking/terminal/tool call 不进 Export Transcript——说明「摘要层」与「原始 trace 层」在产品上是明确分离的两层。**
- Source：Cursor Community Forum（官方工程师 deanrie 回复）
- URL：https://forum.cursor.com/t/transcripts-no-longer-exported-in-full/150214
- Date：2026-05-24
- Excerpt："For extended thinking models, providers intentionally only return a summary of the reasoning, not the full chain-of-thought. Anthropic clearly documents this for Claude 4 models… OpenAI behaves similarly… collapsed thinking blocks (the summary you see in the UI) aren't included in Export Transcript."
- Context：Cursor 官方论坛 bug 讨论。
- Confidence：高

**Claim 2.3：渐进式披露被 UX 写作明确总结为三层模式：Summary always / Reasoning on demand / Full trace for power users；「show-everything」的失败原因是认知超载。**
- Source：The Agent UX Patterns Catalog（kagan.ai, Vol.13）
- URL：https://kagan.ai/catalog/vol-13/
- Date：未标注
- Excerpt："Progressive disclosure is the dominant pattern… Summary always (the final answer is the primary content), reasoning on demand (one click reveals the thinking and tool calls), full trace for power users… Anthropic Claude's extended-thinking blocks default to collapsed; users can expand them… casual users see clean answers; power users dig in; debuggers get the full trace."
- Context：Agent UX 模式目录，行业综述。
- Confidence：中高（二手综述，但与多个一手实现一致）

**Claim 2.4：Perplexity 的信息层级 = answer-first（答案 → 内联引用 → 来源条 → 相关问题），来源以 favicon 卡片呈现且完整列表默认折叠；其 Pro 模式的步骤条默认折叠、用平实语言命名步骤，UX teardown 的评价是「Collapsed research steps in plain language：Trust signal without log noise」。**
- Source：925studios Perplexity Design Breakdown；aiuxplayground Perplexity Citations teardown
- URL：https://www.925studios.co/blog/perplexity-design-breakdown ; https://aiuxplayground.com/teardowns/perplexity/citations
- Date：2026-08-12 / 2026-06-15
- Excerpt："The information hierarchy says: answer, then evidence, then exploration. Each layer is optional."；"Step wording mirrors user mental model (Checking predictions) not API names."；"The full source list is collapsed by default… This restraint is what keeps the page calm."
- Context：两篇独立设计拆解相互印证；结论 "Borrow the optionality… progressive disclosure" 可直接复用。
- Confidence：高

**Claim 2.5：ChatGPT deep research 的呈现：任务运行后侧边栏出现「已执行步骤摘要 + 使用的来源」，耗时 5–30 分钟、完成后通知——长任务把过程外移到 sidebar，主聊天区只收最终报告。**
- Source：OpenAI 官方公告 "Introducing deep research"
- URL：https://openai.com/index/introducing-deep-research/
- Date：2025-02-02
- Excerpt："Once it starts running, a sidebar appears with a summary of the steps taken and sources used… you can step away or work on other tasks—you'll get a notification once the research is complete. The final output arrives as a report within the chat."
- Context：官方一手描述。
- Confidence：高

**Claim 2.6：Claude Code 终端内把工具调用折叠成一行摘要（`Read 3 files`、`Ran bash command`），详细参数/输出要靠 Ctrl+O transcript 查看器；第三方工具（claude-devtools）的存在动机就是把每个调用展开成语法高亮 viewer + 可展开的子 agent 执行树。**
- Source：claude-dev.tools 文档；how2shout 快捷键指南
- URL：https://claude-dev.tools/docs/tool-calls ; https://www.how2shout.com/ai/claude-code-keyboard-shortcuts.html
- Date：2026-05-13 / 2026-07-12
- Excerpt："In the terminal, Claude Code collapses tool calls into one-line summaries: Read 3 files, Edited 2 files, Ran bash command. You don't see which files, what changed…"；"Ctrl+O — Toggle the transcript viewer. Shows detailed tool usage and execution, and expands MCP calls that otherwise collapse to a single line like 'Called Slack 3 times.'"
- Context：印证「一行摘要 = 默认层级，展开 = 按需」是刻意设计。
- Confidence：高

### 维度 3：长任务的认知减负（进度摘要、todo 外显、噪音折叠）

**Claim 3.1：todo/plan 若只是聊天流中的一条消息会被工具输出冲走，用户强烈要求吸附式持久面板——这是长任务认知减负的第一诉求。**
- Source：GitHub anthropics/claude-code issue #8723
- URL：https://github.com/anthropics/claude-code/issues/8723
- Date：2025-10-01
- Excerpt："As Claude executes the plan, it adds new messages… This causes the original plan to scroll up and out of view. To track progress… I constantly have to stop what I'm doing and scroll up… I propose implementing a dedicated, persistent UI panel for the task list/plan… This functionality would be very similar to the persistent task list feature found in the OpenAI Codex/Copilot VS Code extension."
- Context：官方仓库 feature request，并点名 Codex/Copilot 扩展的持久任务列表为正面范例；Claude Code CLI 后来加了 Ctrl+T 切换任务清单（docs: "Ctrl+T — Toggle Claude's task checklist… in the status area"）。
- Confidence：高

**Claim 3.2：Claude Code 的任务追踪工具（TodoWrite/TaskCreate 等）以结构化 tool call 流入消息流，官方 SDK 文档给出「消费 tool_use 块、自行渲染进度面板」的范例（`Progress: 2/5 completed` + 当前 activeForm 标签）——即官方预期应用层把 todo 渲染成独立进度 UI 而非日志。**
- Source：Claude Code Agent SDK 官方文档 Track todos
- URL：https://code.claude.com/docs/en/agent-sdk/todo-tracking
- Date：2026-09-10
- Excerpt："Opt a session in only when your application reads those tool calls, whether to log task activity or to render its own progress display… Use this shape when your application maintains a progress display instead of logging each event." 示例渲染："Progress: {completed}/{total} completed / Currently working on: … ✅/🔧/❌ {activeForm}"
- Context：官方文档；对 agent canvas 节点是直接的实现指引。
- Confidence：高

**Claim 3.3：长输出对模型侧也要「折叠」：Claude Code 2026-09 更新把 bash/task 输出上限提到 128k chars，超限溢出到文件、模型只拿截断预览——UI 折叠与上下文折叠是同一降噪逻辑的两端。**
- Source：jonathansblog.co.uk 变更解读；stackoverflow（BASH_MAX_OUTPUT_LENGTH / verbose 设置）
- URL：https://jonathansblog.co.uk/claude-code-output-limits-explained ; https://stackoverflow.com/questions/79716276/
- Date：2026-09-10 / 2025-08-11
- Excerpt："a verbose pytest run, a noisy webpack build, or a long kubectl logs tail would routinely blow past the inline output cap. Claude Code would save the full output to a temp file and hand Claude a truncated preview instead."
- Context：说明「npm install 式噪音」在业界同时用 UI 折叠 + 上下文截断 + 落盘三层手段处理。
- Confidence：中高

**Claim 3.4：用户研究（N=31，Manus/Operator）发现 agent 的「沟通过载」是五大可用性障碍之一：用户被进度报告的量淹没，有人甚至怀疑隐藏 workflow log 能让 agent 变快；用户最想要的是暂停键。**
- Source：arXiv 2509.14528 "Why Johnny Can't Use Agents"（CMU，CAIS'26）
- URL：https://arxiv.org/html/2509.14528
- Date：2025-09-11（v1；会议 2026-05）
- Excerpt："agents generate an overwhelming amount of communication overhead"；"noting the volume of progress reports, P31 wondered whether hiding workflow logs would make the agent faster"；"I'd like a pause button if it's going off the rails." (P26)；"Manus produced richer first-class outputs… but introduced higher communication overhead."
- Context：同行评审 HCI 研究，直接支撑「默认折叠 + 进度摘要 + 可暂停」。
- Confidence：高

### 维度 4：Coordinator/编排者视角（多子任务/子 agent 的对话 UI）

**Claim 4.1：Claude Code 的子 agent 在会话中渲染为单行委派卡 `code-improver(Suggest code improvements)`；后台子 agent 进入输入框下方的 subagent 面板与 `/tasks` 列表，成功即移除、失败保留 30 秒；父会话默认看不到子 agent 的中间过程，只收最终摘要。**
- Source：Claude Code 官方文档 sub-agents / tools-reference
- URL：https://code.claude.com/docs/en/sub-agents ; https://code.claude.com/docs/en/tools-reference
- Date：2026-09-22 / 2026-09-18
- Excerpt："the delegation appears as a tool call row showing the subagent's name followed by a short task description, such as code-improver(Suggest code improvements)"；"The parent doesn't see the subagent's intermediate tool calls or outputs, only that final result."；"When a subagent finishes successfully, Claude Code removes its row immediately and… shows /tasks to see subagents in the footer for 30 seconds."
- Context：官方文档。「只回传摘要、中间过程不可见」是子 agent 的默认信息边界。
- Confidence：高

**Claim 4.2：社区对「Coordinator 视角」的共识形态是：子 agent 卡片默认折叠（一行：名称 + 任务 + Running 状态），点击展开看完整嵌套生命周期（thinking、每次 tool call 参数与输出、最终回传结果）。**
- Source：GitHub anthropics/claude-code issue #5974
- URL：https://github.com/anthropics/claude-code/issues/5974
- Date：2025-08-17
- Excerpt（mockup）："Collapsed View (Default): ┌─ Task: Debugging error in user.ts [Running...] ─┐ │ ► debugger subagent is working on the task. (Click to expand) │；Expanded View: 显示 thinking blocks、each Tool Call including parameters、Tool Output、final result passed back to the main agent。"
- Context：官方仓库 feature request，标题即 "UI for Subagent Execution Transparency and Debugging"。
- Confidence：高

**Claim 4.3：Manus 的 Coordinator 汇报范式 = 三栏布局（左：任务线程列表 20% | 中：聊天 40% | 右：agent 电脑实时视图 40% + 回放拨盘 + 任务进度 checklist `6/6`），并支持 Take Over 接管、任务结束后整段 replay（变速/步进/跳到关键决策点/分享链接）。**
- Source：arXiv 2509.14528（界面实测描述）；manus-guide（replay 功能文档）；futureagi/LinkedIn 分析
- URL：https://arxiv.org/html/2509.14528 ; https://github.com/hodorwang/manus-guide/blob/main/posts/understanding-manus-replay/en.mdx ; https://www.linkedin.com/pulse/edition-9-inside-manus-ai-architecture-benchmarks-futureagi-vd7ee
- Date：2025-09-11 / 2025-03-06 / 2025-04-24
- Excerpt："a live preview of the agent's computer on the right with a replay dial and task progress checklist… Manus provides a summary of planned steps and shows a detailed log of every action it performs, with interactive chips linking to search results and screen states… take direct control of the computer via a 'Take Over' button."；"The replay function presents these records in a timeline format… Pause at specific steps… Jump to key decision points."
- Context：学术论文实测 + 社区文档互证。Manus 的 replay/时间线是「SwiftWork 类事件时间线」的成熟参照。
- Confidence：高

**Claim 4.4：Operator/ChatGPT Agent 走更克制的「chat-forward」路线：任务卡片入口 → 标准聊天视图，computer-use 预览以内嵌卡片嵌在聊天流中（可放大），步骤以 "Trying to access Google Slides options ⌄" 式折叠行呈现，需要时 Take Over。**
- Source：arXiv 2509.14528；developersdigest ChatGPT Agent 解析
- URL：https://arxiv.org/html/2509.14528 ; https://www.developersdigest.tech/blog/chatgpt-agent
- Date：2025-09-11 / 2025-07-17
- Excerpt："Operator offers comparable computer-using capabilities but with a more minimal, chat-forward interface… it embeds a computer preview in the chat thread (expandable to a larger layout)"；"The visual UI shows which tools the agent is using at any given moment. You see it switch between searching, reading, summarizing, and interacting."
- Context：与 Manus 三栏形成「嵌入流式 vs 独立面板」两种 coordinator 布局对照。
- Confidence：高

**Claim 4.5：Devin 的范式是「委派而非结对」：界面围绕派任务（Slack/GitHub issue/自然语言）设计，agent 自治执行、以 work log 汇报步骤、完成或需要澄清时回报；并行多任务同时跑。**
- Source：buildfastwithai Devin 评测
- URL：https://www.buildfastwithai.com/ai-tools/devin
- Date：未标注（2026 版评测）
- Excerpt："The interface is designed around delegation rather than collaboration: you assign a task… and Devin works on it, reporting back when complete or when it needs clarification… Reporting and transparency — shows work log of steps taken… Parallel task execution — multiple tasks running simultaneously."
- Context：第三方评测；与 Manus 的「实时旁观」相比，Devin 是「异步汇报制」。
- Confidence：中高（单来源评测）

**Claim 4.6：Magentic-UI（Microsoft Research）的人本多 agent 设计：所有中间进度步骤对用户清晰展示、用户可暂停计划执行并插入反馈、可在界面配置哪些 agent 动作（如点击按钮）需要审批；编排核心是 Orchestrator 的 Task Ledger / Progress Ledger 双账本。**
- Source：Microsoft Research 官方博客；AutoGen 官方文档
- URL：https://www.microsoft.com/en-us/research/blog/magentic-ui-an-experimental-human-centered-web-agent/ ; https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/magentic-one.html
- Date：2025-05-19 / 未标注
- Excerpt："All intermediate progress steps are clearly displayed to the user. Furthermore, the user can pause the execution of the plan and send additional requests or feedback. The user can also configure through the interface whether agent actions (e.g., clicking a button) require approval."；"At each step of its plan, the Orchestrator creates a Progress Ledger where it self-reflects on task progress."
- Context：官方一手来源；「计划可审、步骤可见、动作可配审批」三件套。
- Confidence：高

**Claim 4.7：事件时间线（trajectory viewer）的可视化惯例：动作用蓝色、观察/消息用灰色、错误用红色，每步带时间戳/标题/内容/元数据，支持方向键步进导航。**
- Source：OpenHands/trajectory-visualizer
- URL：https://github.com/OpenHands/trajectory-visualizer
- Date：2025-02-27
- Excerpt："The timeline shows: Actions (commands, edits, searches) in blue; Observations (messages, errors) in gray/red; Each step shows the timestamp, title, content, and any metadata; You can navigate through steps using arrow keys or clicking."
- Context：开源 agent 轨迹回放器，代表「事件时间线」类 UI 的颜色语义惯例。
- Confidence：高

### 维度 5：成本/状态展示（token、耗时、模型标识）

**Claim 5.1：「持久状态栏显示模型 + 上下文用量 + 成本 + 时长」是用户主动索取的功能，而非厂商附加；中断式 `/cost`、`/status` 被认为打断工作流。**
- Source：GitHub anthropics/claude-code issues #35374 / #66021
- URL：https://github.com/anthropics/claude-code/issues/35374 ; https://github.com/anthropics/claude-code/issues/66021
- Date：2026-03-17 / 2026-06-07
- Excerpt：期望形态 `[claude-opus-4-6] Context: 45% (180k/400k) | Cost: $12.34 | Duration: 1h 23m`；"The only way to check is /cost and /status, which interrupts the workflow… Context compaction happens without warning — a status bar would make it predictable."
- Context：官方仓库 feature request（CLI 与 VS Code 扩展各一条）。
- Confidence：高

**Claim 5.2：社区自定义状态栏的信息分组惯例：Line 1 身份（repo/分支/模型）、Line 2 花费与限额（session 成本/今日成本/限额进度条+倒计时）、Line 3 技术（上下文 %、token in/out）；限额接近时绿→黄→红变色。**
- Source：gordonbeeming.com；yurikoval.com；ccusage statusline 文档
- URL：https://gordonbeeming.com/blog/2026-03-22/building-a-custom-claude-code-status-line ; https://yurikoval.com/blog/monitoring-claude-code-token-usage.html ; https://ccusage.com/guide/statusline
- Date：2026-03-21 / 2026-06-30 / 2026-09-21
- Excerpt："Line 1 (Identity): where am I? Repo name, active branch, model. Line 2 (Spend & limits): session cost, daily cost, rate limit bar with countdown. Line 3 (Technical): context window usage, token counts. The grouping keeps project identity separate from costs and usage."
- Context：多篇独立教程收敛到同一分组逻辑。
- Confidence：高

**Claim 5.3：耗时展示区分 API 时长与 wall-clock 时长是惯例（`/usage` 同时给 `Total duration (API)` 与 `Total duration (wall)`）；成本按分模型 token 明细列出（input/output/cache read/cache write）。**
- Source：Claude Code 官方文档 costs
- URL：https://code.claude.com/docs/en/costs
- Date：2026-09-15
- Excerpt："Total cost: $0.55 / Total duration (API): 6m 20s / Total duration (wall): 6h 33m 10s / Total code changes: 0 lines added, 0 lines removed / Usage by model: claude-sonnet-4-6: 1.2k input, 5.3k output, 940.0k cache read, 50.0k cache write ($0.55)"
- Context：官方文档；注意代码增删行数也被当作「产出指标」一并展示。
- Confidence：高

**Claim 5.4：跨工具对比媒体把「平均每任务 token 消耗」作为核心比较维度（Aider 105K / Cursor 104K / Claude Code 479K per avg task），说明 token 可见性已是用户选型与成本控制的一等指标。**
- Source：morphllm.com 三工具对比（6 个月实测）
- URL：https://www.morphllm.com/comparisons/morph-vs-aider-diff
- Date：2026-02-15
- Excerpt："Tokens per avg task: Aider 105K / Cursor 104K / Claude Code 479K… Claude Code uses 4.2x more tokens than Aider on the same tasks, but its code works without human edits 78% of the time (vs. 71% for Aider)."
- Context：第三方对比（厂商背景，方法论自述，数字谨慎采信；仅用于说明「token/任务」作为展示维度的惯例）。
- Confidence：中

**Claim 5.5：业界对「推理摘要 vs 原始思维链」的产品处理：OpenAI 只发布 reasoning 摘要（UI 所见亦非原始 trace），Anthropic/DeepSeek 更开放；长 trace（1–2 万 token 常见）下「折叠面板」的阅读体验会失效，需要专门的阅读/归档设计。**
- Source：prismmd.app 推理 trace 阅读指南
- URL：https://www.prismmd.app/blog/read-ai-reasoning-traces
- Date：2026-08-20
- Excerpt："OpenAI publishes only a summary of the reasoning. What you see in the ChatGPT UI is closer to the raw trace, but even that view is filtered… For a hard problem, ten to twenty thousand tokens is normal… the collapsed panel design in most chat UIs stops working past a certain length."
- Context：提醒折叠卡片不是万能的——超长 trace 需要独立查看器（可对照 Claim 4.7 的 timeline viewer）。
- Confidence：中高

---

## 三、综合判断与对「通用 Agent 节点 / 根 Coordinator」的落地建议（推断，非引用）

- **节点内信息架构**：`答复正文（主）→ 步骤分组条（按 plan 的 todo 分组，组内工具调用折叠为一行摘要）→ 卡片展开（diff/输出/参数）→ 全局 verbose`。todo 面板吸附于节点顶部或输入框上方（Claim 3.1/3.2）。
- **Coordinator 节点**：每个子任务 = 一张折叠卡（名称+描述+状态+耗时+token），展开为嵌套流；并行子 agent 聚合成 `/tasks` 式列表；汇报沿用 Devin 的「完成/需澄清才打断」原则，避免 Claim 3.4 的沟通过载。
- **状态 footer 常驻**：模型标识 | 上下文 % | $ 成本 | API/wall 耗时 | 权限模式（Claim 5.1–5.3）。
- **控制件**：排队输入、Esc 式中断（保留进度）、暂停按钮、检查点回滚、动作级审批配置（Claim 1.4/4.6）。
- **反模式**：通用 JSON tool 块（Claim 1.2）、plan 混在聊天流（Claim 3.1）、无差别展示全部 trace（Claim 2.3）、步骤用 API 名（Claim 2.4）。

## 四、置信度与局限

- 高置信结论均有两个以上独立来源互证或官方一手文档。
- 局限：未直接检索到 HN/Reddit 原帖（搜索引擎未返回），社区评价主要经由二手分析与 GitHub issue 区获取；SwiftWork 本身未检到公开资料，以 OpenHands trajectory visualizer / Manus replay 作为「事件时间线」替代参照；部分网页自标日期为未来日期，已标注但需谨慎；Claim 5.4 的数字来自厂商背景对比站，仅作惯例证据。
