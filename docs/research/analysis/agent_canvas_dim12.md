# Agent Canvas 维度 12 调研：分布式 agent 状态/身份同步架构与可视化（"agent 状态外置"实践）

调研日期：2026（站点抓取与搜索均在本轮执行）。覆盖 nervafs.xyz、JuiceFS/SeaweedFS、Yjs/Automerge、E2B/Modal、mem0/Letta、git worktree、K8s Dashboard、CI 凭证遮罩。

---

## 设计启示（给 agent canvas 节点的 7 条）

1. **状态外置 = 节点上展示"绑定"而非"副本"**。NervaFS 的核心抽象是 Agent Volume（`/agents/{agent_id}/...`）+ Runtime Binding（`rb-{8}`，携带 policy revision、cache revision、调用者 OS 上下文）。canvas 节点不必展示状态本体，只需展示"哪个 harness/runtime 正绑定在哪个 volume 上、binding id、policy/cache 版本"——这天然就是一张卡片的信息量。
2. **同步状态可视化要分层：生命周期状态 ≠ 一致性状态**。E2B 把 sandbox 状态机明确为 Running / Paused / Snapshotting / Killed；K8s 把 Pod 状态拆成 phase + conditions（PodScheduled/Initialized/ContainersReady/Ready）。canvas 节点应同样拆成两条线：env 生命周期（运行/暂停/快照中）+ substrate 同步状态（已同步/落后/冲突/denied）。
3. **"谁在写"是 FS 同步最难可视化的部分，CRDT 的 awareness 协议是现成答案**。Yjs 的 Awareness 协议本来就是为"谁在在线、在编辑什么"设计的，且已有把 AI agent 作为 CRDT peer（带 name/color/role/status 字段）暴露 presence 的实践。若 nervafs 层无 awareness，canvas 可用 audit 事件流（NervaFS 每次 list/read/write 都产生带 caller/pid 的结构化审计事件）反推"当前写者"，作为弱化版 presence。
4. **冲突语义决定了可视化深度**。文件系统级（JuiceFS close-to-open 一致性、SeaweedFS last-write）和 Letta 共享 memory block（官方文档明示 last-write-wins）都"没有冲突对象可看"；CRDT（G-Counter/OR-Set/LWW-Register）可自动合并但需展示合并来源；向量时钟+升级共识的方案（swarm-memory-manager）才有真正的"冲突待裁决"态。canvas 的冲突指示器应按 substrate 实际语义设计，不要画出不存在的"冲突解决 UI"。
5. **快照/分叉是"多 env 同一 agent"的主流可视化隐喻**。E2B snapshot 一对多 spawn、Modal filesystem snapshot 即 Image、git worktree "1 space = 1 worktree = 1 branch"、Claude Code 官方 `--worktree` 并行 agent——业界已收敛到"agent 状态可以 fork 成 N 个并行 env"的心智。canvas 可用树/分支形布局表达 volume → snapshots → bindings 的派生关系。
6. **凭证在节点上只展示"存在性与来源"，永不展示值**。GitHub Actions 用 `::add-mask::` 把值替换为 `***`；A2A 规范明确"不建议在 AgentCard 内放明文 secret"；Vault secret-sync 用审计日志事件驱动跨实例同步。canvas 上凭证应渲染为 `🔒 OPENAI_API_KEY · via vault · synced 2m ago · last rotated 30d` 这类元信息行，审计入口指向 substrate 的 audit 流。
7. **身份展示采用"AgentCard 式"分层摘要**。A2A AgentCard（name/version/provider/skills/capabilities/securitySchemes，well-known 地址可拉取）已是 agent 身份的事实标准 schema；NervaFS `/identity` namespace 定位相同。canvas 节点头 = AgentCard 子集（id、provider、harness 类型、版本），展开 = skills/capabilities/security 声明 + 签名/attestation 状态。

---

## 1. NervaFS 是什么、宣称解决什么问题

**Claim**: NervaFS 是面向 agent runtime 的"文件系统 substrate 层"，用 FUSE 挂载把 agent 的 identity/memory/tools/data/communication/audit 统一为一个受治理的工作区，处于 Orchestration / Runtime / Substrate 三层架构的最底层。
- Source: NervaFS 官网首页
- URL: https://nervafs.xyz
- Date: 站点标注 "M1 substrate · Early access v0.3.5 / phase 3.5"，页面内审计日志示例时间戳 2026-05-19；本轮抓取于调研当日
- Excerpt: "NervaFS is the substrate layer for agent runtimes — one governed workspace for identity, memory, tools, data, communication, and audit." / "FUSE-backed ordinary I/O. Every read and write is governed."
- Context: 直接回答"是什么"。与用户 canvas 设想的 substrate 角色（跨 env 同步身份/记忆/技能/知识/工具配置/凭证）几乎一一对应。
- Confidence: 高（一手站点内容）

**Claim**: NervaFS 宣称解决的问题是"agent 系统需要分层而非更多捆绑"——runtime 可替换、agent 不丢失"它是谁"；五大应用场景为 agent hand-off、agent CI/CD & Ops、skill 市场治理、agent-first 文件体验、（及 substrate 本身）。
- Source: NervaFS 官网 /scenarios 与 /architecture 区块
- URL: https://nervafs.xyz
- Date: 同上
- Excerpt: "Agent systems need separation, not more bundling. One governed contract. Storage, identity, policy, tools, mounts — behind a single filesystem boundary." / "Agents migrate between runtimes without losing who they are."
- Context: 其价值主张正是"状态外置+跨 runtime 可迁移"，直接支撑 canvas 把 harness/env/substrate 画成三类节点信息。
- Confidence: 高

**Claim**: NervaFS 的数据模型是四个核心对象：Agent Volume（`/agents/{agent_id}/...`，含 identity/memory/knowledge/skills/communication/data/logs/snapshots 八个 namespace）、Namespace Contract（声明式 mutability class 与 capability）、Runtime Binding（`rb-{8}`，携带 policy revision、cache revision、caller OS context、audit thread）、Provider Adapters（local FS/sqlite/vector/s3 可替换）。
- Source: NervaFS 官网 /core concepts 区块
- URL: https://nervafs.xyz
- Date: 同上
- Excerpt: "Runtime Binding — The active link between an agent volume and a running runtime. Carries policy revision, cache revision, caller OS context, audit thread. `rb-{8} · session · evidence`"
- Context: 这是"身份/记忆/技能/知识/工具配置"外置的最完整目录式数据模型；注意官网首页未把"凭证/credentials"列为顶层 namespace（最贴近的是 identity 的 capability ref 与 policy 层），凭证治理更多是 RBAC+audit 的副产品。
- Confidence: 高（模型本身）；中（凭证是否一等公民，站点未明示）

**Claim**: NervaFS 的每次 list/read/write 都产生带结构化 reason 的审计事件（allowed/denied + target path + binding id + caller + pid），并支持路径前缀 RBAC 与只读/append-only/internal-only 可变性类别。
- Source: NervaFS 官网 /enforcement 区块
- URL: https://nervafs.xyz
- Date: 同上
- Excerpt: "2026-05-19T23:51:09Z  filesystem.view.write  denied\n  target=/agents/analyst/identity/role\n  reason=namespace_internal_only\n  binding=rb-a3f1c8  caller=codex pid=44021"
- Context: 该审计流是 canvas 上"谁在写、写哪了、是否被拒"的直接数据源；也天然支持凭证访问的审计展示（见第 5 节）。
- Confidence: 高

**Claim**: NervaFS 当前是 M1 早期版本（v0.3.5），local-first、audit 默认开启，支持 Claude Code/Codex/Cursor/OpenClaw/Hermes/Aider/Devin 等 runtime 绑定；agent bundle 打包（snapshot → handover 单元）是其跨环境迁移机制。
- Source: NervaFS 官网 /build、/capabilities 区块
- URL: https://nervafs.xyz
- Date: 同上
- Excerpt: "Snapshot an agent — identity, memory, skills, bindings — into a portable substrate handover unit." / "Local-first. Audit-on by default. No remote dependency to get started."
- Context: 注意："跨 env 实时同步"并非 M1 的显性卖点——站点强调的是可挂载、可治理、可打包迁移（bundle/snapshot），多机实时复制的实现细节（是否类 JuiceFS 的中心化元数据或 CRDT）站点未披露。
- Confidence: 高（站点所述范围）；对"实时同步协议"为未知/低

## 2. "身份/记忆/技能/知识/工具配置/凭证"跨环境同步的现有实践与数据模型

**Claim**: agent 记忆外置已有三种成熟架构：可调用的记忆层（mem0：add/search API，user/session/agent/run 四级 scope，向量+图+KV）、结构化平台（Zep/Graphiti 时序知识图谱）、runtime 内置（Letta/MemGPT：core/recall/archival 三层 + 可共享 memory block）。
- Source: AI Agent Memory Architecture Guide 2026；agentscamp.com 对比文
- URL: https://baeseokjae.github.io/posts/agent-memory-architecture-guide-2026/ ; https://agentscamp.com/guides/comparisons/mem0-vs-zep-vs-letta
- Date: 2026-05-07 / 2026-06-11
- Excerpt: "Mem0 supports user-level memory (per individual), session-level memory (per conversation), agent-level memory (shared across all users), and run-level memory (ephemeral per task)." / "Letta treats memory as a central part of a persistent agent. Its memory blocks … can be attached to more than one agent."
- Context: mem0 的 scope 模型可直接映射 canvas 上"这段记忆属于 user/agent/session/run 哪一层"的徽标；Letta 共享 block 是跨 agent 同步的最简数据模型。
- Confidence: 高

**Claim**: Letta 把整个 agent state（消息历史、memory blocks、工具、模型配置）持久化在数据库中，agent 是"带持久身份的长生命周期微服务"；但多进程改同一共享 block 时是 last-write-wins。
- Source: stackademic Letta 介绍；anjalichaursiya.com 多框架对比
- URL: https://blog.stackademic.com/letta-platform-for-stateful-llm-agents-a83b58a1c926 ; https://anjalichaursiya.com/multi-agent-shared-persistent-memory-orchestration-frameworks-weaviate-engram-langgraph-mem0-and-letta/
- Date: 2025-09-16 / 2026-08-12
- Excerpt: "All agent state (message history, memories, tools, etc.) is persisted in a database by default, so agents maintain identity over time." / "when multiple processes modify the same block, the last write wins."
- Context: LWW 意味着 canvas 无法从 Letta 式存储中读出"冲突"——只能展示"最后写入者+时间"。这是设计冲突指示器时的关键边界。
- Confidence: 高

**Claim**: 沙盒状态的跨环境迁移收敛为两种模型：pause/resume（一对一，E2B 保留文件系统+内存，暂停约 4s/GiB、恢复约 1s，暂停无限期保留）与 snapshot/fork（一对多，E2B snapshot 可 spawn 多个新沙盒；Modal `snapshot_filesystem()` 产出 diff-based Image 供新沙盒启动）。
- Source: E2B Docs（persistence/snapshots）；Modal Docs；LogRocket 沙盒平台对比
- URL: https://docs.e2b.dev/sandbox/persistence ; https://docs.e2b.dev/sandbox/snapshots ; https://modal.com/docs/guide/sandbox-snapshots ; https://blog.logrocket.com/comparing-ai-agent-sandbox-platforms-e2b-modal-daytona-and-more/
- Date: 2026-09-08 / 2026-09-02 / 未标注 / 2026-08-04
- Excerpt: "One-to-many — snapshot can spawn many new sandboxes" / "Filesystem Snapshots are calculated as the difference from your base image, so only modified files are stored."
- Context: 对应 canvas 的 env 节点状态机与"env 从哪个 snapshot fork 来"的血缘展示。
- Confidence: 高

**Claim**: git worktree 已成为并行 coding agent 的标准隔离手段（1 agent = 1 worktree = 1 branch，共享 .git 对象库），Claude Code 于 2026-02-21 官方内置 `--worktree`；它同步的是代码而非 agent 身份/记忆。
- Source: dev.to、Augment Code 指南、blockchain.news 报道
- URL: https://dev.to/sonim1/using-git-worktree-for-parallel-ai-agent-development-44nb ; https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution ; https://blockchain.news/ainews/claude-code-adds-built-in-git-worktree-support-to-cli-parallel-agents-without-conflicts
- Date: 2026-03-24 / 2026-04-07 / 2026-02-21（公告日）
- Excerpt: "Each worktree has its own HEAD, index, and working files, but they all share commit history and Git objects." / "Claude Code made this even more explicit by adding an official `--worktree` flag in February 2026."
- Context: 同一分支不能被两个 worktree 同时 checkout——这是 FS/git 式"互斥写"约束，canvas 可将其可视化为 env 对 branch/volume 的独占锁。
- Confidence: 高

**Claim**: agent 身份的发现层标准是 A2A AgentCard：`/.well-known/agent-card.json` 提供 name/description/version/provider/skills/capabilities/securitySchemes/签名；社区已有 CI 校验、schema validator、以及"运行时 attestation 绑定 card hash + nonce"的强化讨论。
- Source: A2A 官方 spec（Gitee 镜像全文）；Palo Alto 安全分析；A2A Discussion #1677
- URL: https://gitee.com/liwen_test_sync_group/a2a-protocol/blob/main/schema/spec.txt ; https://live.paloaltonetworks.com/t5/community-blogs/safeguarding-ai-agents-an-in-depth-look-at-a2a-protocol-risks/ba-p/1235996 ; https://github.com/a2aproject/A2A/discussions/1677
- Date: spec v0.3.0（2025 起）/ 2025-08-14 / 2026-04-09
- Excerpt: "It is generally NOT RECOMMENDED to include plaintext secrets (like static API keys) directly in an Agent Card." / "The attestation JWT should bind to both the card hash and a request nonce."
- Context: canvas 节点头的身份区可直接复用 AgentCard schema 字段；签名/attestation 状态是身份可信度的可视化点。
- Confidence: 高

**Claim**: 凭证跨环境同步的工程实践是"引用同步而非值同步"：Vault secret-sync 监听源实例审计日志事件把 secret 同步到目标 store；K8s 用 External Secrets Operator（SecretStore/ExternalSecret CRD + refresh interval）；CI 中用 `::add-mask::` 注册值后日志自动替换为 `***`。
- Source: vault-secret-sync GitHub；spark.entire.vc secrets management skill；GitHub 官方 workflow commands 文档
- URL: https://github.com/robertlestak/vault-secret-sync ; https://spark.entire.vc/skills/ag-secrets-management ; https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
- Date: 未标注 / 2026-02-26 / 官方文档（持续更新）
- Excerpt: "The service will listen for audit log events from the source Vault instance and sync the secrets to the destination secret store." / "Actions scans all subsequent log output and replaces any occurrence of that value with `***`."
- Context: 凭证在 canvas 上应展示为"引用+来源+刷新时间+审计链接"，与 nervafs 的 audit 流对接。
- Confidence: 高

## 3. 文件系统级同步 vs CRDT vs 事件溯源：可视化支持差异

**Claim**: 分布式 FS（JuiceFS/SeaweedFS）保证的是一致性与性能，不暴露"协作语义"：JuiceFS 是 close-to-open 一致性（写关闭后才对其他客户端可见）+ 元数据引擎（Redis/TiKV/PostgreSQL，企业版用 Raft）保证原子性；SeaweedFS master 只管 volume、filer 元数据可放任意现成存储，支持 active-active 跨集群复制与 metadata 事件的 CDC webhook。
- Source: JuiceFS GitHub/官网；SeaweedFS GitHub
- URL: https://github.com/juicedata/juicefs ; https://juicefs.com/docs/cloud/introduction/architecture/ ; https://github.com/seaweedfs/seaweedfs
- Date: 未标注（仓库持续更新）；架构文档 2026-04-01
- Excerpt: "Close-to-open consistency. Once a file is written and closed, it is guaranteed to view the written data in the following opens and reads from any client." / "change data capture with webhooks on every metadata event."
- Context: 对 canvas：FS 层能可视化的是"挂载点、缓存命中率、副本数、close 后可见"这类运维指标；"谁在写"需靠 inotify/CDC/audit 额外补上（NervaFS 正是把这一层做成了产品）。
- Confidence: 高

**Claim**: CRDT（Yjs/Automerge）天然提供"谁在写"的可视化原语：Awareness 协议广播 name/color/cursor/status；已有实践把 AI agent 注册为 CRDT peer（`role: 'agent', status: 'idle'`），与人并列出现在 presence UI；Automerge 则保留完整变更历史，支持分支、审计、time-travel。
- Source: Yjs awareness 文档案例；electric.ax "AI agents as CRDT peers"；Zaira Labs Automerge 指南
- URL: https://mintlify.com/nnourr/plant-together/tech/yjs ; https://electric.ax/blog/2026/04/08/ai-agents-as-crdt-peers-with-yjs ; https://zairalabs.ai/guide/tools/automerge/
- Date: 2026-03-03 / 2026-08-04 / 2026-07-03
- Excerpt: "awareness.setLocalState({ user: { name: 'Electra', color: '#7c3aed', role: 'agent', status: 'idle' } })" / "preserve full change history and enable branching, version auditing, or time-travel debugging."
- Context: 三者中 CRDT 对 canvas 最友好：presence=在线 env、update 流=同步活动、无冲突对象（自动合并）；代价是数据模型受限（文档/JSON 状结构），不适合任意文件与凭证。
- Confidence: 高

**Claim**: 介于两者之间的工程形态：声明式 CRDT + 向量时钟升级共识（swarm-memory-manager：G-Counter/PN-Counter/LWW-Register/OR-Set 自动合并，不可合并的冲突由向量时钟判定后升级共识层；命名空间+TTL 做隔离回收，MCP 工具挂 pre/post 钩子）。
- Source: GitCode 博客"跨Agent 分布式状态同步、CRDT 复制与命名空间协调设计解析"
- URL: https://blog.gitcode.com/1fb93b8100f65f0bbd6af1f07bfa8b49.html
- Date: 2026-09-06
- Excerpt: "多个 Agent 副本各自维护状态时，如何做到不丢更新、可收敛、可运维……CRDT 引擎处理可自动合并的冲突……把不可自动合并的冲突升级到共识"
- Context: 这是中文圈最接近"nervafs 式多副本 agent 状态"的公开设计解析；其"自动合并 vs 升级裁决"二分正是 canvas 冲突指示器的语义基础。
- Confidence: 中（单篇解析文，未核实其实现仓库）

**Claim**: 事件溯源/审计流（NervaFS audit、SeaweedFS CDC、LangGraph checkpointer）提供的是"事后可解释性"而非"实时协商"：每次操作一条带 reason 的不可变事件，最适合做时间线/审计视图与"谁在何时写了哪个 namespace"的回放。
- Source: NervaFS 官网 audit 示例；LangGraph/Engram 架构对比文
- URL: https://nervafs.xyz ; https://anjalichaursiya.com/multi-agent-shared-persistent-memory-orchestration-frameworks-weaviate-engram-langgraph-mem0-and-letta/
- Date: 2026-05-19（示例时间戳）/ 2026-08-12
- Excerpt: "Every list, read, write is an event with a structured reason. Suitable for compliance and post-hoc analysis."
- Context: 综合差异结论：FS 同步=可见"挂载/一致性/吞吐"不见"人"；CRDT=可见"人/光标/合并"不见"任意文件"；事件溯源=可见"全部操作历史"但需自己聚合出"当前状态"。canvas 理想方案是 audit 流（nervafs 原生）+ awareness 式 presence 的组合。
- Confidence: 高（综合判断，标注为推断）

## 4. 节点信息设计参考（k8s dashboard、CI runner 卡片等）

**Claim**: Kubernetes 的状态展示模型是 phase（Pending/Running/Succeeded/Failed/Unknown）+ conditions 数组（PodScheduled/Initialized/ContainersReady/Ready，各带 lastTransitionTime/reason/message）+ events 流；Dashboard/Komodor 等 UI 把 conditions 渲染为布尔行、events 渲染为时间线。
- Source: kubernetes.io Pod Conditions/Pod Lifecycle 官方文档；Komodor 状态监控文
- URL: https://kubernetes.io/docs/concepts/workloads/pods/pod-condition/ ; https://komodor.com/learn/what-are-kubernetes-pod-statuses-and-4-ways-to-monitor-them/
- Date: 2026-06-20 / 2024-02-14
- Excerpt: "- type: Ready\n  status: \"True\"\n  lastTransitionTime: \"2026-04-11T06:02:45Z\""
- Context: canvas 节点可直接借"conditions 条"：SubstrateSynced / BindingActive / PolicyCurrent / SnapshotReady 各为一 condition，带 lastTransitionTime——比单一"健康点"信息量高一个量级。
- Confidence: 高

**Claim**: GitHub self-hosted runner 的状态卡片模型是 status（online/offline）× busy（bool）× labels 数组；label 是路由与能力声明的合一（self-hosted/linux/ARM64/prod）。
- Source: namespace.so 博客（API 响应示例）；GitHub 官方 labels 文档
- URL: https://namespace.so/blog/running-github-self-hosted-runners-reliably ; https://docs.github.com/actions/hosting-your-own-runners/using-labels-with-self-hosted-runners
- Date: 2023-08-31 / 2026-03-10
- Excerpt: "\"status\": \"online\", \"busy\": false, \"labels\": [{\"name\": \"self-hosted\"}, {\"name\": \"macOS\"}, {\"name\": \"ARM64\"}]"
- Context: env 节点的最小信息集可复刻为：{env_id, status, busy, labels: [sandbox/VM/physical, region, GPU]}；harness 同理用 labels 声明能力。
- Confidence: 高

**Claim**: 并行 agent 管理工具已形成"卡片+注册表"惯例：worktrunk 的 `wt list --full` 每行展示 branch 状态、相对 main 的 commit 数、CI 状态、AI 生成摘要；Vibe Kanban/Cursor Agents Window 用 kanban/agents 窗口管理 worktree 隔离的并行 agent。
- Source: worktrunk 介绍；agentpatterns.ai Cursor 3 文档
- URL: https://prompts.brightcoding.dev/blog/max-sixtyworktrunk-parallel-git-worktree-management-for-ai-agents ; https://agentpatterns.ai/tools/cursor/agents-window/
- Date: 2026-07-18 / 2026-08-09
- Excerpt: "shows branch status, commit counts relative to main, CI status, and AI-generated summaries per branch"
- Context: "每个 env 一行 AI 摘要"是 canvas 上降低认知负载的已验证模式。
- Confidence: 高

**Claim**: E2B 的沙盒状态机文档（Running/Paused/Snapshotting/Killed + auto-pause 细节如"快照积压时降级为 filesystem-only pause"）是"状态转换图直接作为产品文档/可视化"的范例。
- Source: E2B Docs sandbox persistence
- URL: https://docs.e2b.dev/sandbox/persistence
- Date: 2026-09-08
- Excerpt: "Snapshotting: The sandbox is briefly paused while a persistent snapshot is being created. It automatically returns to Running."
- Context: canvas 的 env 节点状态色应对应同一状态机，且"降级暂停（丢内存保磁盘）"这类中间态值得专门图标。
- Confidence: 高

## 5. 凭证同步的安全可视化（遮罩与审计）

**Claim**: 行业惯例是"值永不展示、出现即遮罩"：GitHub Actions 对 secrets context 的值自动遮罩，`::add-mask::<value>` 可把任意运行时生成的值注册为遮罩对象，后续日志中一律替换为 `***`；遮蔽作用域是 job 级日志流。
- Source: GitHub 官方 workflow commands 文档；kenmuse.com 解读
- URL: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands ; https://www.kenmuse.com/blog/masking-secrets-github-runner-custom-images/
- Date: 官方文档 / 2025-12-22
- Excerpt: "Once executed, any appearance of `$SECRET_VALUE` in future log lines in the same job will be automatically redacted."
- Context: canvas 若展示 agent 日志/事件流，需内置同等的"值级遮罩注册表"，而非仅字段级隐藏——因为凭证可能出现在任意文本里。
- Confidence: 高

**Claim**: 身份/凭证元数据的展示边界：A2A 建议 AgentCard 最小化、不放明文 secret、敏感 card 需访问控制；agentcard.net validator 把"扫描疑似 API key/JWT/bearer token"列为校验项；最佳实践集合（ Vault 等）强调 audit logging、short-lived token、按环境分 secret。
- Source: A2A spec §5.4；agentcard.net validator；spark.entire.vc secrets skill
- URL: https://gitee.com/liwen_test_sync_group/a2a-protocol/blob/main/schema/spec.txt ; https://www.agentcard.net/agent-card-validator ; https://spark.entire.vc/skills/ag-secrets-management
- Date: 2025-2026 / 2026-07-09 / 2026-02-26
- Excerpt: "scans for values that look like embedded API keys, JWTs, or bearer tokens."
- Context: canvas 凭证行建议字段：名称、来源（vault/env/substrate namespace）、scope（agent/env/run）、上次轮换、同步时间、审计链接；值本身只显示 `***` 或前后 4 位指纹。
- Confidence: 高（字段建议为基于证据的推断）

**Claim**: 凭证的审计展示可复用 nervafs 原生模型：每次 read/write（含 credential 路径）产生 allowed/denied + reason + binding + caller 事件，"every touch. every reason. forever."——审计视图按 binding（即 env 实例）过滤即可回答"哪个 env 读过这个凭证"。
- Source: NervaFS 官网 /enforcement
- URL: https://nervafs.xyz
- Date: 2026-05-19（示例）
- Excerpt: "2026-05-19T23:51:09Z  filesystem.view.write  denied … reason=namespace_internal_only binding=rb-a3f1c8 caller=codex pid=44021"
- Context: 把 denied 事件单独标红是低成本高价值的安全可视化（异常访问探测）。
- Confidence: 高

---

## 附：检索覆盖与未决项

- 独立检索/抓取次数：20+（含 nervafs.xyz 直接抓取 ×2、JuiceFS、SeaweedFS、Yjs awareness、Automerge、E2B persistence/snapshots、Modal snapshots、mem0、Letta、git worktree ×多、K8s pod conditions、GH runner labels、Vault sync、GH add-mask、A2A AgentCard、事件溯源 UI、中文 CRDT/agent 状态同步等）。
- 未决项（置信度受限处）：
  1. NervaFS 的跨机实时同步协议未在官网披露（M1 主打 local-first + bundle handover）——若 canvas 依赖"多 env 实时同步同一 volume"，需向 nervafs 方确认 M2 spec。
  2. nervafs 是否把"凭证/credentials"作为独立 namespace 未明示（站点仅列 identity/memory/knowledge/skills/communication/data/logs/snapshots）。
  3. swarm-memory-manager 解析文为单一中文来源，实现细节未交叉验证。
  4. 事件溯源"可视化 UI"的专门产品证据较弱（仅 SAP Ariba 审计列表示例），该节差异结论部分为基于多条证据的综合推断。
