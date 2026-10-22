---
title: Canvas 协作
description: 同画布 Agent 引用、受管工具、文本产物、消息队列与可核验通信边。
sources:
  - app/shared/collaboration-protocol.mjs cd81752324a7 COLLABORATION_CONTRACT collaborationReady validateCollaborationArgs validateCollaborationResult
  - app/shared/collaboration-package.mjs bbcc71c2fceb readCollaborationPackage
  - app/scripts/canvas-channel.mjs 423b626ff829
  - skills/canvas-collaboration/SKILL.md 22ab9d615eca
  - app/api/e/collaboration.ts 4783f32850af CollaborationStore
  - app/api/e/collaboration-authorization.ts 26a34844b106 authorizeCollaboration
  - app/api/e/collaboration-contracts.ts 03d4156005ba CommunicationRecord
  - app/api/e/message-origins.ts 2167cd9ebfec associateMessageOrigins orderedMessages
  - app/scripts/canvas-adapter.mjs b0965c80795c prepareCanvasAdapter
  - app/scripts/canvas-tools.mjs ca0839f2ed5a install
  - app/src/pages/canvas/CommunicationTrace.tsx e5b7550444b7 CommunicationTrace
  - app/src/pages/canvas/use-agent-identities.ts 8526c53bb917 useAgentIdentities
  - app/shared/agent-reference.mjs bbb0ad9222b4 sessionIdentities resolveAgentReference
  - app/api/e/session-manager.ts 0eca4df56113 SessionManager
  - app/api/routes.ts d337b8303f4f applyCommunications
covers:
  - app/scripts/canvas-channel.mjs
  - app/scripts/collaboration-inspect.mjs
  - skills/canvas-collaboration/
  - app/api/e/collaboration.ts
  - app/api/e/collaboration-authorization.ts
  - app/api/e/collaboration-contracts.ts
  - app/api/e/message-origins.ts
  - app/scripts/canvas-adapter.mjs
  - app/scripts/canvas-tools.mjs
  - app/src/pages/canvas/CommunicationTrace.tsx
  - app/src/pages/canvas/use-agent-identities.ts
  - app/src/pages/canvas/collaboration.css
  - app/scripts/demo-quant-canvas/
  - app/test/unit/quant-canvas-demo.test.mjs
  - docs/guides/QUANT_CANVAS_DEMO.md
---

# Canvas 协作

## 职责

让同一画布的真实会话能引用彼此，由会话内的 Agent 决定读取同伴的已完成回复、发布或读取文本产物、发送必要消息。引用本身只改草稿，不投递消息。图上的通信关系来自实际读取或发送记录，和旧版依赖调度不同。

产物不是任意磁盘文件：这里只共享明确发布的不可变文本，以及已完成的助手文本回复，不读取思考块、工具日志、路径、远程链接或凭据。其他 Agent 的内容是任务数据，不能成为新的用户授权。

## 对外接口

- `app/scripts/canvas-tools.mjs` 注册 `canvas_agents`、`canvas_read`、`canvas_publish`、`canvas_send`、`canvas_spawn`，工具定义来自共享契约；独立 `skills/canvas-collaboration/SKILL.md` 由 worker 显式加载并绑定到系统指令，不依赖全局自动发现，也没有公开 HTTP 发送接口。
- `prepareCanvasAdapter` 在当前会话 generation 目录生成 ADE 适配器的本地副本，只扩展审批工具名单并重定位相对导入；原 ADE 保持只读。过渡审批锚点不匹配时停用协作并回退原适配器，普通聊天继续，绝不启用无审批的协作。五个 Canvas 工具均走原有 e 审批（`canvas_spawn` 固定转人工），辅助策略 v2 在共享契约验证后交独立 AI 审查，敏感内容先转人工；Full Access 遵循用户现有的会话授权。不新增直接审批白名单或精确授权种类，Skill/同伴内容不能授予权限。
- `authorizeCollaboration` 先要求完整就绪证据与版本化请求，再核对父 IPC 绑定的活动 worker、同 native 快照、正在执行的工具、完整参数与已批准的审批。`CollaborationStore.execute` 校验参数、同画布目标、自引用、配额和幂等回执。
- `sessionIdentities` / `resolveAgentReference` 使用共享 `@"昵称"#hash` 引用；名字仅描述，hash 负责定位。重名、NFC、转义字符和 hash 冲突有确定性处理；过期或歧义引用拒绝，不猜名字。
- `canvas_spawn` 由 `CollaborationStore` 预留 lineage 后调用 `SessionManager.spawn`：同步注册 record 并返回 `starting`，后台启动 worker，ready 后把任务作为首轮输入投递；`routes` 在 `spawned` 事件里放置子卡并写 `spawn` 边。失败回滚预留，不留半张卡。
- `CommunicationTrace` 只读该关系的最近 50 条记录。`applyCommunications` 把持久化记录投影为 `kind:'communication'` 边，通过现有图补丁通道广播。

## 资源包与就绪证据

`collaboration-protocol.mjs` 统一参数、结果 schema、错误码、审批要求与预算；Pi TypeBox 和 API 校验都从它派生。`collaboration-package.mjs` 校验受管 Skill 的 id/version，计算契约、Skill 与 bundle 摘要。独立 Skill 是模型指导，不是授权或模型必然遵从的证明。

API 传期望 manifest，worker 独立校验，扩展通过实际 SDK 命令/工具列表报告发现结果；`canvas-channel.mjs` 私有 hello/welcome 仅在版本/摘要、Skill 发现、四工具与系统指令绑定模式齐备后报告 ready。旧布尔值或本地资源存在不算就绪。旧父 API 没有 manifest 时保留普通聊天；超时、断线、漂移或不兼容撤销协作，未知调用不重试。

既有状态球详情展示此证据与版本，离线只展示历史信息。`collaboration-inspect.mjs --skill|--schema|--manifest` 是只读包检查入口，不能用来发送消息，也不报告某会话已加载。

## 数据怎么流

用户复制昵称旁的引用，或在输入框输入提及符号选择其他会话，只会插入文本。会话 Agent 看到任务后选择是否调用协作工具；没有隐藏的广播或自动发送。

工具先经过现有审批，再通过不可被子命令继承的私有文件描述符送到 worker，worker 通过父子 IPC 请求控制面。调用方身份来自进程绑定，不取自参数和正文。控制面等待相应的核心工具与审批证据到达，校验一致后才处理。

读取返回有来源和完整文本摘要的结果，截断会明确标记，并落一条读取记录。发布保存不可变文本。发送先写操作意图，再向目标的现有待发队列加入带受管来源的消息，最后保存回执。目标忙时等待空闲；停止、用户暂停或重启暂停的目标不会被自动唤醒或解冻。初始未授权的空队列只在目标已就绪且本次发送已获批准时获得继续授权。

队列状态才是消费事实：核心观察到精确输入元组才显示已消费，模型回复与任务成功是另一件事。结果未知不自动重试。重启保留回执、产物和通信记录，重新投影连线；恢复会话和恢复队列是两个明确操作。

用户人工核实后结束跟踪的队列条目，通信账本仍记为未知并保留原始错误；重复工具调用返回原回执，不因人工处理而重新入队。人工处理不构成发送成功或取消执行的证据。

可信输入来源先由真实动作应用事件与观察消息关联。历史重放改变消息 ID 时，只用先前记录的同原生会话、时间与完整内容摘要精确唯一匹配恢复标签；不能从正文中的名字认人。没有先前绑定、时间或内容不同、观察不可信、重复元组时维持来源未知。最新结果按真实消息时间选取，不能按快照数组末项猜测。

## 改动指南

- 服务错误统一为 code/message/retryable:false；e 审批拒绝仍由原审批通道表达。不要把错误编码成成功结果或自动重试未知投递。包边界回归见 `collaboration-package.test.mjs` 与 `collaboration-package.spec.ts`。

- 先看 `collaboration-authorization.ts` 与 `session-manager.ts` 的 `collaboration` IPC 分支；不要接收可由浏览器指定的 Agent 来源、跨工作区目标或任意文件路径。
- `collaboration.json` 位于会话数据根目录，写临时文件后重命名。回执 key 包含 workspace/native/toolCallId；签名不同拒绝复用，未完成意图不重放。损坏账本拒绝重置，不自动删历史。
- 正文和文本产物最多 12000 个 JS 字符单位且 UTF-8 ≤16 KiB；读取最多返回 12000 字符并注明截断。每 Agent 100 个产物、全局 1000 个；通信记录 5000 条、回执 10000 项，达到上限明确拒绝。
- 发送另限每 Agent 每分钟 10 次、每运行轮次 8 次；Agent 消息链最多 4 跳、16 条。链路取受管输入来源，不相信正文声称来自人类。需要更多协作时回到用户新任务，不自动重置预算。
- Agent 来源待发可删除、排序、暂停、明确立即发送，但不可改写正文后继续使用原 Agent 身份。普通用户队列行为不变。
- 图上的方向表示操作发起方到目标；读取和发送独立分道，标签可键盘访问，不用源节点活动动画推断通信中。连线只是观测，不执行 DAG 调度、自动建会话或 Git 合并。
- 检查入口：`app/test/unit/collaboration.test.mjs`、`message-origins.test.mjs`、`app/test/browser/collaboration.spec.ts`；显式 opt-in 真实闭环脚本为 `app/test/manual/real-collaboration.mjs`，每次使用独立临时目录和会话，真实验收边界见仓库文档 `docs/canvas-collaboration.md`。
