# Agent Canvas 维度调研 08：Human-in-the-Loop Agent 介入交互的设计模式与产品实践

> 调研范围：LangGraph interrupt/approval UX、CrewAI/AutoGen human input、OpenAI Operator / ChatGPT Agent takeover、browser-use 敏感操作与登录、Devin 提问与 Knowledge 沉淀、Cursor/Claude Code accept/reject 与回滚、2FA/captcha 人工协助案例、HCI 研究（pause-feedback-continue、监督策略对比）。
> 检索方式：30+ 次独立中英文搜索 + 直接打开官方文档与 arXiv 论文原文。日期为来源发布日期或访问日期（2026-09）。

---

## 一、设计启示（对 Agent Canvas 专注模式的 8 条建议）

1. **Approval 不是二态，至少四态**：主流框架（LangChain HITL middleware）将人工决策建模为 `approve / edit / reject / respond` 四类。Agent Canvas 的操作节点审批按钮不应只有"同意/拒绝"，应支持**编辑参数后放行**（edit）与**直接以文字答复 agent**（respond），覆盖"辅助认证"和"信息补充"场景。

2. **介入点必须由"结构性门禁"而非提示词保证**：prompt-based 的"做 X 前先问我"会被模型跳过或被注入绕过；HumanLayer 与 LangGraph 都把审批挂在 tool-call 层拦截（结构性）。Canvas 节点上的"需人工介入"标志应是 harness 层的硬中断点，不是写给 agent 的软提示。

3. **认证/登录交权的核心是"凭证不可见"**：OpenAI Operator takeover mode 在人工接管期间**停止截图、模型无法观测用户输入**；browser-use 用 placeholder（sensitive_data）让 agent 只见键名不见值。Canvas 的辅助认证节点应提供"人工接管窗口"（live URL / 接管按钮），接管期间 agent 观测通道物理关闭，会话 cookie 在归还控制权后保留。

4. **超时必须有服务端兜底默认策略，且"人不在"是一等公民的控制流结果**：LangGraph 的 interrupt **无限期等待**，框架自身不会唤醒挂起的 interrupt；生产做法是外部 sweeper 扫描过期 checkpoint，以 `resume={"status":"expired"}` 恢复，按风险分级决定默认放行或默认拒绝（低风险自动批准、高风险自动拒绝）。Canvas 审批队列需要可配置的超时倒计时与默认动作。

5. **多 agent 并发审批应聚合为 Inbox 而非逐条弹窗**：LangChain 官方的 Agent Inbox 把 pending interrupts 渲染为"Gmail 式"卡片队列（approve/edit/reject）；LangGraph 支持多个 interrupt 同时挂起、按 interrupt id 映射 resume（严禁按位置匹配，曾因顺序非确定性出 bug）。Canvas 需要一个全局审批收件箱，支持批量审阅（batch review）与"approve similar"式的分组委托。

6. **HCI 研究警示：监督有效性取决于"风险时刻是否可辨识"，而非控制点多寡**。48 人对比实验（arXiv 2604.04918）发现：逐动作确认（Action Confirmation）交互成本最高且用户会"approve 疲劳"（"I didn't like having to click approve, approve, approve"）；plan 级监督降低风险暴露但不提升运行时拦截；最有效的设计是**让高风险时刻在任务流中"可辨识"（legible）**——给动作打风险标签、说明"为什么现在需要你"。Canvas 应默认轻量监控 + 风险高亮，而非每步都要确认。

7. **暂停-反馈-继续要"无损续接"，回滚要"分层可撤销"**：ChatGPT Agent 支持随时打断、补充指令、从断点继续且不丢进度；Claude Code 的 checkpoint/rewind 把回滚拆成"恢复代码 / 恢复对话 / 两者"三种粒度，但明确 Bash 副作用不可回滚——不可逆动作（发邮件、付款、删除）必须在执行前确认，回滚只是兜底。Canvas 产物节点的 annotation 与操作节点的接管都应建模为"状态快照 + 断点续跑"。

8. **介入记录应沉淀为可复用知识，且由人审核后再入库**：Devin 会从聊天反馈中自动建议 Knowledge 条目（可编辑、可拒绝、可要求重新生成），按 repo/组织作用域 pin 住，后续会话自动召回；HumanLayer 则把拒绝反馈回灌 agent 上下文并支持"学习后自动批准阈值"。Canvas 可将每次 annotation/接管/拒绝转化为"知识草稿"（draft PR against institutional memory），经人确认后沉淀，定期去重、消歧。

---

## 二、分维度证据（Claim / Source / URL / Date / Excerpt / Context / Confidence）

### 1. Approval 交互范式：inline 按钮、审批队列、diff+accept/reject、超时与默认策略

---

**Claim 1.1：LangChain 官方 HITL middleware 把人工决策标准化为 approve / edit / reject / respond 四类，可按工具粒度配置允许的决策集。**
- **Source**：LangChain Docs — Human-in-the-loop
- **URL**：https://docs.langchain.com/oss/python/langchain/human-in-the-loop
- **Date**：2026-09（访问）
- **Excerpt**："A human decision then determines what happens next: the action can be approved as-is (`approve`), modified before running (`edit`), rejected with feedback (`reject`), or responded to directly (`respond`) for 'ask user' style tools."；`"execute_sql": {"allowed_decisions": ["approve", "reject"]} # No editing allowed`
- **Context**：官方文档，LangGraph checkpointer 持久化挂起状态，决策通过 `Command(resume={"decisions": [...]})` 传回同一 thread。对 Canvas 直接映射：操作节点审批四态 + 产物节点 respond（ask user）。
- **Confidence**：高

---

**Claim 1.2：LangGraph interrupt 默认无限期等待，框架没有内建 TTL；生产实践是外部调度器扫描过期 interrupt 并以合成 timeout 信号 resume，默认策略按风险分级（低风险 auto-approve、高风险 auto-reject）。**
- **Source**：ActiveWizards — LangGraph Interrupt Patterns Beyond the Basics；ranjankumar.in — HITL at Production Scale: The Checkpoint Membrane
- **URL**：https://activewizards.com/blog/langgraph-interrupt-patterns-beyond-the-basics-conditional-approval-batch-review-and-timeout-handling/ ；https://ranjankumar.in/human-in-the-loop-production-scale-checkpoint-membrane
- **Date**：2026-05-20 / 2026-06-21
- **Excerpt**："LangGraph has no built-in interrupt TTL as of v0.2.x, so timeout logic must live at the orchestration layer. ... typically auto-approving low-risk actions and auto-rejecting high-risk ones."；"nothing in the framework will ever wake a parked interrupt on its own. If you do not build this, 'wait for approval' silently means 'wait forever.'"
- **Context**：两篇工程实践文，给出 risk score（不可逆性、金额、记录数、目标系统）路由到 auto_approve 或 interrupt_gate 的完整代码，以及 sweeper 每 60s 轮询恢复过期 checkpoint 的模式。
- **Confidence**：高（多个独立来源一致）

---

**Claim 1.3：风险分级 + 条件审批（conditional approval）能显著减少人工审阅量；队列治理需预留 reservation timeout、二次复核、书面 rubric。**
- **Source**：ActiveWizards（同上）；FutureAGI — Designing Review Queues That Improve LLM Quality
- **URL**：https://futureagi.com/blog/human-in-the-loop-ai-review-queues/
- **Date**：2026-08-10
- **Excerpt**："Blocking vs async | Async default, blocking for risk | Latency on every action | A slow product or an unsafe action"；"Reservation timeout | 15 minutes to a few hours | Items stuck with an idle reviewer"
- **Context**：审阅队列设计表：每 item 标注人数、分配策略（round robin/负载均衡）、预留超时、高风险二次复核、界面内嵌评分 rubric。
- **Confidence**：中高

---

**Claim 1.4：Cursor/Windsurf 的 inline diff + per-hunk accept/reject 是代码 agent 的"事实标准"交互；Claude Code 被用户要求补齐"批量 diff 审阅"模式。**
- **Source**：Kiro GitHub Issue #8968（功能请求）；claude-code GitHub Issue #31888
- **URL**：https://github.com/kirodotdev/Kiro/issues/8968 ；https://github.com/anthropics/claude-code/issues/31888
- **Date**：2026-05-29 / 2026-03-07
- **Excerpt**："see the changes inline (green for additions, red for deletions) directly in the file — with Accept/Reject buttons on each change block ... per hunk, not all-or-nothing"；"Cursor's native agent provides, where ALL changes are made first and then presented together as inline diffs for the developer to review, approve, or reject — individually or all at once."
- **Context**：两个高权限来源（GitHub issue）的用户声音：先全部生成、再统一以 inline diff 逐块审阅优于"边生成边逐行确认"。注意 Cursor 论坛也有 accept/reject UI 回归 bug 报告（forum.cursor.com/t/154887, 2026-03），说明该交互被深度依赖。
- **Confidence**：高

---

**Claim 1.5：Claude Code 以"权限模式"把审批粒度产品化为 6 档光谱（default/acceptEdits/plan/auto/dontAsk/bypassPermissions），并把危险操作（如 rm 关键路径）做成任何模式都不自动放行的"断路器"。**
- **Source**：Claude Code Docs — Permission modes
- **URL**：https://code.claude.com/docs/en/permission-modes
- **Date**：2026-09-19（文档更新）
- **Excerpt**："`dontAsk` ... auto-denies every tool call that would otherwise prompt"；"Deny rules block in every mode, including `bypassPermissions`"；plan mode 下 "edits stay blocked until you approve the plan"，且可按 `Ctrl+G` 在编辑器里修改计划再批准。
- **Context**：官方文档。对 Canvas 的启示：approval 策略应是"会话级模式 × 规则覆盖（allow/deny/ask）"的双层结构；plan 模式的"先出计划、批准前禁写"可直接映射产物节点的 annotation 流程。
- **Confidence**：高

---

**Claim 1.6：腾讯云/掘金总结的"三路由审批"（批准 / 拒绝 / 参数编辑）是中文社区的通行提法；审批超时、编辑未提交的中间态是面试级设计考点。**
- **Source**：掘金 —【Harness 层】Human-in-the-Loop 接口设计
- **URL**：https://juejin.cn/post/7634491657275293739
- **Date**：2026-05-03
- **Excerpt**："三路由审批：批准（Approve）：工具按原参数执行；拒绝（Reject）：工具不执行，状态回退到调用前；参数编辑（Edit）：人工修改参数后重新提交"；"断点等待期间 Agent 的状态保存在哪里？审批超时后系统怎么处置？用户在审批界面点了编辑但没提交，这个中间状态算不算已决？"
- **Context**：中文技术社区对 LangChain+LangGraph 审批流的拆解，含 interrupt payload 带 `"timeout": 300` 的示例。
- **Confidence**：中高

---

### 2. 辅助认证/登录：控制权交人且凭证不泄露

---

**Claim 2.1：OpenAI Operator 的 takeover mode 是行业基线——遇到登录/支付/CAPTCHA 时暂停，人工接管期间 Operator 不截图、不收集用户输入。**
- **Source**：OpenAI — Introducing Operator（官方）
- **URL**：https://openai.com/index/introducing-operator/
- **Date**：2025-01-23
- **Excerpt**："Takeover mode: Operator asks the user to take over when inputting sensitive information into the browser, such as login credentials or payment information. When in takeover mode, Operator does not collect or screenshot information entered by the user."；"User confirmations: Before finalizing any significant action, such as submitting an order or sending an email, Operator should ask for approval."；"Watch mode: On particularly sensitive sites ... requires close supervision of its actions."
- **Context**：四层防护：takeover、确认、任务限制（拒绝银行交易等）、watch mode。Operator system card 报告金融交易的关键确认召回率 92.1%（aiwiki.ai 引述），说明确认门会漏，需分层。
- **Confidence**：高

---

**Claim 2.2：ChatGPT Agent（Operator 后继）沿用同一交接模型：登录时提示"…→ Take over browser"，接管期不截图，cookie 跨会话保留，认证步骤不计入用量额度。**
- **Source**：OpenAI Help Center — ChatGPT agent（官方）；AlphaSignal 报道
- **URL**：https://help.openai.com/en/articles/11752874-chatgpt-agent ；https://alphasignal.ai/news/openai-s-chatgpt-work-agent-can-now-access-password-protected-sites
- **Date**：2026-09-22 / 2026-07-24
- **Excerpt**："If a task requires a login, ChatGPT agent will pause and prompt you to take control of the virtual browser ('…' → Take over browser). While you control the browser, screenshots are not captured ... Cookies persist across sessions"；"The agent will never type your password, store credentials, or invoke a password manager. Inputs you enter during takeover mode are not collected or seen by the model."
- **Context**：官方帮助文档 + 第三方解读。归还控制后 agent 尝试从先前工作流状态继续，有时需重建 run——"无损续接"并非总是完美。
- **Confidence**：高

---

**Claim 2.3：browser-use 用 sensitive_data placeholder 机制让 agent 只见占位符名不见凭证真值，值由运行时在输入时直接注入页面；TOTP 种子可以 `bu_2fa_code` 后缀自动生成 2FA 码。**
- **Source**：browser-use 官方博客 — How to Authenticate AI Web Agents
- **URL**：https://browser-use.com/posts/web-agent-authentication
- **Date**：2026-03-08
- **Excerpt**："The agent never sees your actual credentials, only placeholder names. Values are injected directly into the page."；`'x_bu_2fa_code': 'JBSWY3DPEHPK3PXP'  # TOTP secret key`，"fresh codes are generated at input time"
- **Context**：与 takeover 互补的另一条路线：凭证完全不给模型、由 harness 注入；适合无人工在场的自动化，但 2FA 种子托管给系统有自身的信任边界。
- **Confidence**：高

---

**Claim 2.4：浏览器 agent 基础设施层普遍收敛到"human handoff"模式：agent 做 95%，遇到登录/2FA/captcha 生成 live URL 给人接管，完成后同一 session 续跑；且明确"永不尝试绕过验证码"。**
- **Source**：Browserless — Web Agents in Production；BrowserAct 官方博客；pi.dev agent-browser 包；zhihu.ee（中文，bux 实践）
- **URL**：https://www.browserless.io/blog/web-agents ；https://www.browseract.com/blog/ai-agents-login ；https://pi.dev/packages/@53able/pi-agent-browser ；https://zhihu.ee/archives/bux-claude-code-browser-agent-vps-guide
- **Date**：2026-07-30 / 未注明 / 未注明 / 2026-05-01
- **Excerpt**："the realistic last resort is that tier-6 handoff ... it pauses and hands the live browser to a human through a `liveURL`, a shareable link that doesn't carry your API token"；"Remote Assist: When an agent hits a 2FA prompt or QR login, it generates a live URL. You take over from any device ... No restart, no lost context"；"Never attempt to bypass CAPTCHA or 2FA. If a site asks for login or identity verification, stop and share live URL. Resume only after the user explicitly replies 'done'."
- **Context**：4 个独立来源（含中文）描述同一模式。pi-agent-browser 还给出针对 Google/OAuth 反自动化检测的 `login_handoff`：临时启动无 CDP 的 Chrome 让人正常登录，再把该浏览器挂回 agent 会话。
- **Confidence**：高

---

**Claim 2.5：craft-agents-oss 的 feature request 精确描述了 Canvas 操作节点需要的 API 形态：`handoff`（暂停、释放控制权）→ 用户完成认证 → `reclaim`（带着 session/cookie 收回控制权），且"浏览器状态跨交接持久化"是硬性需求。**
- **Source**：GitHub — lukilabs/craft-agents-oss Issue #397
- **URL**：https://github.com/lukilabs/craft-agents-oss/issues/397
- **Date**：2026-03-11
- **Excerpt**："browser_tool handoff [windowId] — pause agent, let user interact freely / browser_tool reclaim [windowId] — agent takes back control, session preserved"；"The key requirement is that the browser state (cookies, localStorage, session) persists across the handoff."
- **Context**：开源 agent 框架的社区需求，指出了现有 `release`（放弃控制）与"归还后找回同一窗口"之间的缺口。
- **Confidence**：高

---

### 3. 介入请求路由：多 agent 并发时审批如何聚合

---

**Claim 3.1：LangChain 官方 Agent Inbox 把 LangGraph 的 pending interrupts 聚合为 Gmail 式收件箱 UI（卡片 = action name + description，支持 approve/edit/reject），但它是"单人控制台"，无分配/认领/锁、无通知、无审计保留。**
- **Source**：Hysen Labs — Agent Inbox 深度开源分析；prompts.brightcoding 介绍
- **URL**：https://hysenlabs.com/en/projects/langchain-ai-agent-inbox ；https://www.prompts.brightcoding.dev/blog/stop-building-bad-ai-agents-agent-inbox-fixes-hil
- **Date**：2026-09-10 / 2026-06-17
- **Excerpt**："a Gmail-like interface where human operators can review, approve, edit, or reject agent actions in real-time"；"Nothing in the README describes assignment, claiming, or a lock that stops two people from acting on the same interrupt, and nothing describes notifications ... treat the list as a working queue rather than an audit log."
- **Context**：开源项目 langchain-ai/agent-inbox。对 Canvas 的缺口提示：多人审批需要 claim/lock、到达通知、操作留痕。
- **Confidence**：高

---

**Claim 3.2：LangGraph 支持多个 interrupt 并发挂起，resume 必须按 interrupt id 映射（而非按顺序）；曾因按位置匹配导致"政策审批的答案串到语气审批"等事故，官方在 2025-09 修复为强制 id 映射。**
- **Source**：focused.io — Your AI Just Emailed a Customer Without Permission；LangGraph 官方 interrupts 文档与 commit 记录
- **URL**：https://focused.io/lab/your-ai-just-emailed-a-customer-without-permission ；https://docs.langchain.com/oss/python/langgraph/interrupts ；https://wehub.plus/github-featured/langchain-ai--langgraph/commits/commit/f9870bc9...
- **Date**：2026-02-26 / 2026-09-21 / 2025-09-10
- **Excerpt**："LangGraph matches resume values to interrupts by position, not by name. There are no names. Refactor and swap the order, the policy answer goes to the tone check and vice versa."；"we want to instead enforce that each resume value is mapped to an interrupt id"；官方文档："Matching is strictly index-based, so the order of interrupt calls within the node is important."
- **Context**：多审批并发时的路由正确性问题；另有"double resume"（两个审阅者同时点批准）需幂等处理。对 Canvas：审批项必须带唯一 id，操作幂等。
- **Confidence**：高

---

**Claim 3.3：批量审阅（batch review）是高吞吐管线的推荐模式：把多个待审动作聚合成一批一次性呈现，逐条批准/拒绝后统一 resume。**
- **Source**：ActiveWizards（同上）；LangGraph Angular SDK（interrupts 复数 API）
- **URL**：https://activewizards.com/blog/... ；https://reference.langchain.com/javascript/langchain-angular/UseAgentStream
- **Date**：2026-05-20 / 2026-04-23
- **Excerpt**："Batch review collects pending interrupt payloads into a shared state list ... The human reviewer sees all pending actions in one interface and can approve or reject each individually."；"For workflows with multiple concurrent interrupts, use `interrupts` instead ... multiple interrupts may be pending simultaneously."
- **Context**：SDK 层已把 `interrupts[]` 作为一等概念暴露给前端。
- **Confidence**：中高

---

**Claim 3.4：HumanLayer 模式验证了审批路由的产品化方向：按团队/个人粒度路由、多通道（Slack/Email/Discord）、升级（escalation）与超时、审计轨迹，且"human as tool"把答疑也建模为 agent 可调用的工具。**
- **Source**：EveryDev.ai — HumanLayer；runany.dev 评测；CSDN 中文技术拆解
- **URL**：https://www.everydev.ai/tools/humanlayer ；https://runany.dev/blog/humanlayer-human-in-the-loop-api/ ；https://blog.csdn.net/gitblog_00567/article/details/151067373
- **Date**：2025-08-27 / 2026-05-30 / 2025-09-01
- **Excerpt**："Key capabilities include approval decorators, granular routing to teams or individuals, escalations and timeouts, state management, learning/auto-approvals based on prior decisions, and webhooks"；"Prompt-based interruption ... is fragile. Tool-call interception is structural. The agent literally cannot proceed without going through the HumanLayer SDK."；CSDN：三级通道配置（操作级 > SDK 级 > 项目级）。
- **Context**：注意：2026 年 HumanLayer 官网已转型为 IDE 产品，审批 API 不再主推（orako.io 对比文），但其架构模式（通道抽象 ContactChannel、require_approval 装饰器）仍是参考样板。
- **Confidence**：中高

---

**Claim 3.5：GitHub 生态用"PR 即审批队列"消化 agent 产出：Copilot coding agent 提交 draft PR 走既有评审规则；GitHub 甚至为 Copilot PR 加了"跳过 workflow 审批"的仓库设置——审批摩擦已成为 agent 落地的主要瓶颈。**
- **Source**：devops.com；cognativ.com；GitHub 中文文档
- **URL**：https://devops.com/github-copilot-coding-agent-for-jira-connects-planning-to-pull-requests-without-leaving-your-workflow/ ；https://www.cognativ.com/blogs/post/github-lowers-friction-in-copilot-agent-workflow-execution/658
- **Date**：2026-03-09 / 2026-03-18
- **Excerpt**："If it needs more information, it asks clarifying questions directly in Jira. When the draft PR is ready, it appears in GitHub per your existing review and approval rules."；"GitHub added a repository setting that lets administrators bypass workflow approval for Copilot coding agent pull requests so automation can run end to end."
- **Context**：把审批嵌入既有工程设施（PR review）而非另建 UI 的路线；"as routine issue-to-PR work becomes autonomous, code review and CI capacity become the primary bottleneck."
- **Confidence**：中高

---

### 4. 暂停-反馈-继续、可撤销/回滚的 UX 模式（HCI 视角）

---

**Claim 4.1：ChatGPT Agent 是 pause-feedback-continue 的消费级范本：随时打断补充指令、改向、要进度摘要、停止并拿部分结果，agent 从断点继续且不丢进度。**
- **Source**：OpenAI — Introducing ChatGPT agent（官方）
- **URL**：https://openai.com/index/introducing-chatgpt-agent/
- **Date**：2026-09-16
- **Excerpt**："you can interrupt at any point to clarify your instructions, steer it toward desired outcomes, or change the task entirely. It will pick up where it left off, now with the new information, but without losing previous progress. ... If a task takes longer than anticipated or feels stuck, you can pause it, ask it for a progress summary, or stop it entirely and receive partial results."
- **Context**：官方发布文。双向性：agent 也会主动追问补充细节（"may proactively seek additional details"）。
- **Confidence**：高

---

**Claim 4.2：48 人 within-subjects 实验（CUA 监督策略对比）是 HCI 视角最关键的证据：监督策略主要影响"风险暴露"而非"纠错成功率"；逐动作确认成本最高且有 approve 疲劳；干预取决于风险时刻是否"可辨识为需要判断"。**
- **Source**：arXiv 2604.04918 — Comparing Human Oversight Strategies for Computer-Use Agents（Notre Dame/JHU/Northeastern 等）
- **URL**：https://arxiv.org/html/2604.04918v1
- **Date**：2026-04-06
- **Excerpt**："oversight strategy more reliably shaped users' exposure to problematic actions than their ability to correct them once visible"；"I didn't like having to click approve, approve, approve" (P007)；"intervention depended not only on what controls users retained, but on whether risky moments became legible as requiring judgment during execution"；行为数据：Action Confirmation 攻击发生率 88.5%、干预成功率 23.9%；plan 级策略发生率 60.4% 但干预仅 9.2%。
- **Context**：四策略：Risk-Gated（≈Operator）、Action Confirmation（≈Claude Computer Use）、Supervisory Co-Execution（≈Magentic-UI）、Structurally Enriched（多层混合）。高后果场景下多层混合策略信任/可用性最优；低后果场景下轻量策略更优——支持"按风险动态调节监督强度"。论文还引用 Bainbridge(1983) 自动化反讽与 out-of-the-loop 文献。
- **Confidence**：高（同行评审体系内 arXiv 预印本，方法透明）

---

**Claim 4.3：Amershi et al. CHI 2019 的 18 条 Human-AI 交互准则是审批/介入 UX 的经典参照系，其中 G7-G9（高效调用、高效忽略、高效纠错）、G15（颗粒化反馈）、G16（传达后果）、G17（全局控制）直接适用于介入设计。**
- **Source**：Springer — Approaches to Evaluating Human–AI Interaction（转述 Amershi 2019）；Microsoft HAX Toolkit（经 looprails 文献目录）
- **URL**：https://link.springer.com/rwe/10.1007/978-3-031-61050-9_17-1 ；https://looprails.dev/codex.html
- **Date**：2026-01-01（Springer 条目）/ Amershi 原文 2019
- **Excerpt**：18 条准则含 "Support efficient dismissal"、"Support efficient correction"、"Encourage granular feedback"、"Convey the consequences of user actions"、"Provide global controls"；HAX Toolkit "Operationalizes the 18 guidelines into a searchable pattern library, failure-scenario playbook"。
- **Context**：HCI 学界最常被引用的准则集，按阶段组织（初始/交互中/出错时/长期）。审批疲劳的解法（efficient dismissal）、annotation 的颗粒化反馈、审批卡的后果说明均可逐条对表。
- **Confidence**：高

---

**Claim 4.4：回滚 UX 的产品化范本——Claude Code checkpoint/rewind：每个 prompt 自动快照，rewind 菜单提供"恢复代码/恢复对话/两者/摘要压缩"五种动作；但 Bash 副作用、子 agent 编辑不可回滚，文档明确"不是版本控制的替代"。**
- **Source**：Claude Code Docs — Checkpointing（官方）
- **URL**：https://code.claude.com/docs/en/checkpointing
- **Date**：2026-09-15
- **Excerpt**："Restore code and conversation / Restore conversation / Restore code / Summarize from here / Summarize up to here / Never mind"；"Checkpointing does not track files modified by Bash commands ... These file modifications cannot be undone through rewind"；"Not a replacement for version control."
- **Context**：官方文档。GitHub Copilot CLI 亦有 `/rewind`（可恢复对话与文件，even when Git is not being used——essamamdani 2026-08）。启示：可撤销性要分层——会话内 undo（checkpoint）+ 永久历史（git）+ 不可逆动作前置确认。
- **Confidence**：高

---

**Claim 4.5：中文工程实践同样把 handoff 写成明确的操作规程（Human handoff policy），并强调"长期在线 agent 最大风险是做得太顺手"。**
- **Source**：zhihu.ee — bux/Claude Code browser agent VPS 实践（中文）；arunbaby.com — Human-Agent Handoff in Computer Use
- **URL**：https://zhihu.ee/archives/bux-claude-code-browser-agent-vps-guide ；https://www.arunbaby.com/ai-agents/0024-computer-use-agents/
- **Date**：2026-05-01 / 2024-11-09
- **Excerpt**："Agent 发现登录墙 -> 停止操作 -> 发 live URL 给用户 -> 用户完成登录/验证 -> 用户回复 done -> Agent 继续原任务"；"长期在线 Agent 最大的风险不是'不会做'，而是'做得太顺手'"；英文源给出四步 Handoff Protocol（Suspension → Notification → Human Interaction → Resumption）且"Never try to build an Auto-Captcha Solver."
- **Context**：中英文独立来源一致的操作规程级总结。
- **Confidence**：中高

---

### 5. 介入记录沉淀为记忆/知识

---

**Claim 5.1：Devin Knowledge 是"介入反馈 → 组织记忆"的标杆：agent 从聊天反馈中自动生成 Knowledge 建议，人可编辑/拒绝/要求重新生成；条目带 retrieval trigger，可按 repo pin，跨会话自动召回。**
- **Source**：Devin 官方文档 — Knowledge；dev.to 实测；fast.io 使用指南
- **URL**：https://docs.devin.ai/product-guides/knowledge ；https://dev.to/tonkotsuboy_com/how-to-let-devin-ai-write-tests-and-work-until-ci-passes-1jf2 ；https://fast.io/resources/devin-knowledge-guide/
- **Date**：2026-09-21（访问）/ 2024-12-31 / 2026-07-17
- **Excerpt**："Devin will automatically suggest Knowledge to remember based on your feedback in chat. Edit the suggested Knowledge before saving, or dismiss the Knowledge if it's not helpful."；"Treat suggestions as draft PRs against your institutional memory ... Cognition's order of operations is: deduplicate first, resolve conflicts second, fill gaps third."；实测："if you instruct it to 'Use jest.spyOn() for mocking,' Devin will save this as 'Knowledge' and apply it in future tasks."
- **Context**：官方文档 + 两个第三方实践。注意 Knowledge 正在迁移到 Skills（官方 deprecation 声明），但"建议-人审-入库-按触发器召回"的机制设计仍是范本。
- **Confidence**：高

---

**Claim 5.2：Devin 的协作提问/反馈回路：工作在 Slack/PR 线程中暴露，团队成员可评论追加需求，Devin 从 PR review 评论直接改代码——代码评审被当作与 AI 的对话。**
- **Source**：dev.to 实测；aicritique.org 对比分析
- **URL**：https://dev.to/tonkotsuboy_com/... ；https://www.aicritique.org/us/2025/05/05/comparative-analysis-devin-ai-vs-replit-agent/
- **Date**：2024-12-31 / 2025-05-05
- **Excerpt**："You can also request work directly on GitHub by commenting on the diff sections of the PR. Devin will pick up the comments and start working."；"it treats code reviews as a dialogue where the AI is an active participant ... each request is tied to a conversation thread or Linear ticket – it keeps context per task."
- **Context**：多请求路由靠"thread/ticket 绑定上下文"，这对 Canvas 多 agent 并发时的介入路由有直接借鉴：介入请求与任务上下文对象绑定，而非全局广播。
- **Confidence**：中高

---

**Claim 5.3：HumanLayer 把"人的决定回灌 agent 上下文"作为学习机制：拒绝反馈自动进入 LLM context，并支持基于历史决策设定自动批准阈值（learning/auto-approvals）。**
- **Source**：huntscreens.com 产品页；everydev.ai；justcall.io 目录
- **URL**：https://huntscreens.com/en/products/humanlayer ；https://www.everydev.ai/tools/humanlayer
- **Date**：2024-11-18 / 2025-08-27
- **Excerpt**："Upon denial, feedback is automatically sent to the LLM, improving future decision-making."；"Capability to set automatic approval thresholds based on past human interactions and create high-fidelity labeled datasets for training."
- **Context**：审批历史同时是训练数据集——介入记录的双重价值（即时纠偏 + 长期蒸馏）。
- **Confidence**：中

---

**Claim 5.4：CrewAI/AutoGen 的 human input 相对原始，说明"介入 UX"在框架层仍不成熟：CrewAI human_input 走 stdin（webhook 支持社区呼声高、文档滞后），AutoGen 只有 NEVER/TERMINATE/ALWAYS 三档。**
- **Source**：CrewAI 官方文档 + GitHub issues #1774/#1853 + 社区帖；AutoGen 0.2 官方教程
- **URL**：https://docs.crewai.com/en/learn/human-input-on-execution ；https://github.com/crewAIInc/crewAI/issues/1774 ；https://community.crewai.com/t/how-to-provide-webhook-for-human-input-to-the-crew/6684 ；https://microsoft.github.io/autogen/0.2/docs/tutorial/human-in-the-loop/
- **Date**：2026-09-16 / 2025-01-22 / 2025-07-25 / 未注明
- **Excerpt**：CrewAI 社区："it should send the response for feedback over that api and user add it and send back and It continue"（webhook 诉求）；AutoGen："`TERMINATE` (default): human input is only requested when a termination condition is met ... if the human chooses to intercept and reply, the conversation continues and the counter used by `max_consecutive_auto_reply` is reset."
- **Context**：框架层 human input 多为控制台范式，产品化介入 UI 需要自建——这正是 Agent Canvas 的机会点。
- **Confidence**：高

---

## 三、横向模式总结（供 Canvas 设计直接引用）

| 介入场景 | 代表实践 | 关键机制 | 证据编号 |
|---|---|---|---|
| 高危操作审批 | LangChain HITL middleware / HumanLayer / 腾讯云三路由 | tool-call 层结构性拦截；approve/edit/reject/respond 四态 | 1.1, 1.6, 3.4 |
| 审批超时 | LangGraph sweeper 模式 | 框架无内建 TTL；外部扫描 + 风险分级默认策略（低放高拒） | 1.2 |
| 产物修改审阅 | Cursor inline diff / Claude Code plan mode | 先全量生成，inline diff 逐块 accept/reject；plan 批准前禁写 | 1.4, 1.5 |
| 登录/2FA/captcha | Operator takeover / browser-use placeholder / live URL handoff | 接管期观测关闭 or 凭证永不入模；session 跨交接保留 | 2.1–2.5 |
| 多并发审批聚合 | Agent Inbox / batch review / interrupt id 路由 | Gmail 式收件箱；id 映射 resume；需补 claim/lock/通知/审计 | 3.1–3.3 |
| 审批嵌入既有设施 | Copilot coding agent draft PR | PR review 即审批队列 | 3.5 |
| 暂停-反馈-继续 | ChatGPT Agent interrupt/steer | 打断不丢进度；双向追问；部分结果交付 | 4.1 |
| 监督强度调节 | arXiv 2604.04918 四策略 | 风险门控 + 计划级监督混合；让风险时刻可辨识 | 4.2 |
| 可撤销性 | Claude Code checkpoint/rewind | 分层 undo：会话快照 + git + 不可逆前置确认 | 4.4 |
| 介入沉淀知识 | Devin Knowledge / HumanLayer 反馈回灌 | 建议→人审→入库→触发器召回；审批历史作训练集 | 5.1, 5.3 |

## 四、未决问题与置信度说明

- **置信度整体**：官方文档与 arXiv 论文为高；社区/厂商博客为中高；产品目录站（aipure、toolify 等）为中。
- **时效风险**：HumanLayer 已转型 IDE（2026）；Devin Knowledge 正迁移至 Skills；Operator 独立站已并入 ChatGPT Agent。模式仍有效，产品名需以最新为准。
- **未充分覆盖**：① browser-use 是否有一等公民的"敏感操作确认"API（其文档侧重凭证注入与域名白名单，确认门多由使用方自建）；② 多人审批的 claim/lock/通知在无代码产品中的成熟实现（Agent Inbox 明确缺这块）；③ pause-feedback-continue 在中文 HCI 文献中的专门术语对应较少，英文文献为主。
