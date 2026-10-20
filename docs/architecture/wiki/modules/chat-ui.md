---
title: 会话交互
description: 真实 e 会话的消息呈现、草稿、待发队列和审批操作。
sources:
  - app/src/pages/canvas/chat/ExecutionGroup.tsx 948d362fbbb0 ExecutionGroup
  - app/src/pages/canvas/chat/execution-presentation.ts d331f2a51450 groupExecutionTurns isExecutionOnly executionSummary
  - app/src/pages/canvas/chat/approval-presentation.ts 39f8b243c17b approvalAuditLabel approvalProgress allPendingReviewing
  - app/src/pages/canvas/chat/runtime-config-presentation.ts be479d7748ab configurationBasis thinkingLevels configurationBlockReason modelGroups
  - app/src/pages/canvas/chat/ChatPopover.tsx 8cb0cb4f5108 ChatPopover ChatConfirm
  - app/src/pages/canvas/chat/TurnView.tsx 6e24ee1ca16e TurnView
  - app/src/pages/canvas/chat/SessionNotice.tsx 8f1c327919b2 SessionNotice
  - app/src/pages/canvas/chat/Composer.tsx 8bb0926fa82b Composer
  - app/src/pages/canvas/chat/chat-ui-store.ts 14e88309fb3c ChatUIStore chatUIKey getChatUI
  - app/src/pages/canvas/chat/project-transcript.ts cf3e836071a7 TranscriptProjector
  - app/src/pages/canvas/chat/ConversationView.tsx c44472e6df67 ConversationView
  - app/src/pages/canvas/chat/ApprovalRequest.tsx f7b8d4c8ace0 ApprovalRequest
  - app/src/pages/canvas/chat/presentation-state.ts b69274e2c807 presentation sessionNotices
  - app/src/pages/canvas/chat/attachments.ts 012a8ffa699f readAttachment pastedAttachment
  - app/src/pages/canvas/chat/error-presentation.ts 9bf76cd37b66 redact safeLink
  - app/src/pages/canvas/chat/RuntimeConfigControl.tsx 18eac6869cc9 RuntimeConfigControl
covers:
  - app/src/pages/canvas/chat/
---

## 职责

让用户在真实会话里读消息、写草稿、查看工具执行并决定审批。界面区分会话生命周期、当前轮状态、审批状态和操作结果未知，不能把“请求已发出”显示成“执行已成功”。

文件数超过 20 个，仍按同一职责归为一页：它们共同实现一份会话快照到可读、可操作对话界面的转换。网络传输和快照版本控制归[实时画布](canvas.md)。

## 对外接口

- `Composer`（`app/src/pages/canvas/chat/Composer.tsx`）接收会话视图、画布 store 与本地 UI store，通过 `automaticDelivery` 自动提交普通消息或 Canvas 待发队列操作；输入台不再手选发送方式。Steer 从 `QueuePanel` 的立即发送入口显式触发，Follow-up 只保留底层 API 兼容。
- `ConversationView`（`ConversationView.tsx`）读取 `SessionView.snapshot`，通过 `TranscriptProjector`（`project-transcript.ts`）生成稳定的事实轮次，再用 `groupExecutionTurns`（`execution-presentation.ts`）先将混合助手消息按正文/执行边界拆成显示片段，再合并相邻纯执行片段；默认展示末尾 30 个展示条目，每次向前加载 30 个，不丢弃底层消息/工具。
- `ExecutionGroup`（`ExecutionGroup.tsx`）提供执行摘要 → 工具列表 → 单工具输入/输出的三级展开；`executionSummary` 只从真实工具状态和审批生成摘要。首次展开只挂载最近 20 个步骤，可按 20 个加载更早项；打开后固定阅读窗口，新增步骤通过独立入口查看。
- `ChatUIStore`、`getChatUI`（`chat-ui-store.ts`）管理草稿、附件、发送意图、展开状态和阅读位置。`chatUIKey` 包含工作区、节点与原生会话标识，避免串会话草稿。
- `presentation`、`sessionNotices`（`presentation-state.ts`）由会话事实、连接状态、只读状态和能力有效期计算可操作状态。`needsSessionRecovery` 区分无故障证据的待恢复记录；`sessionModelPresentation` 为会话详情和输入台统一提供当前或历史模型标签；`sessionIndicator` 为统一状态球选择真实上下文或优先显示的异常状态。
- `ApprovalRequest`（`ApprovalRequest.tsx`）提交带 `intentId`、`approvalId`、`decision` 的审批；`RuntimeConfigControl`（`RuntimeConfigControl.tsx`）提供同一弹层中的推理主面板与模型列表，提交带 `expectedRevision` 的执行配置变更，或请求重新回读配置。`runtime-config-presentation.ts` 提供真实档位名称、配置基准、模型分组和可写条件。
- `readAttachment`、`pastedAttachment`（`attachments.ts`）形成契约中的 base64 附件；约束检查复用 `app/shared/message-content.mjs`，会话类型来自 `app/api/e/contracts.ts`。

## 数据怎么流

服务端会话快照先按实体标识和修订号去重，再把助手消息按轮次合并。工具调用与结果只呈现一次，有明确轮次或父消息的工具放回对应位置；无法关联的工具和审批单独显示，避免猜测归属。

用户输入保存在当前会话的浏览器会话存储中，有效期为 24 小时。附件二进制只保留在内存，刷新后恢复附件名称并阻止发送，直到用户重新选择附件或明确移除缺失标记。超过 2000 字符的粘贴文本转成文本附件。

发送时重新读取最新会话状态，并创建稳定的意图标识。普通输入在当前轮执行中、等待审批、已有待发项或会话停止、中断时进入 Canvas 待发队列；空闲且具备能力时作为新消息直接发送。不存在隐藏的手动 Steer/Follow-up 选择。待发摘要直接提供首项编辑和立即发送；运行中立即发送必须确认 Steer，不自动中断。队列修改附带修订号，消息发送附带投递方式。失败时保留草稿，不自动重发；成功后只有草稿修订未改变才清空，避免删掉提交期间的新输入。

尚未恢复且没有运行器错误或降级证据的记录在标题栏使用中性状态与显式恢复按钮，正文不再重复普通恢复通知，不能仅凭中断生命周期宣称运行器故障，也不推测中断原因。旧快照中的执行中轮次不表示当前仍在运行；独立的审批和未知动作仍需保留。恢复前的普通消息只保存到暂停队列，不授权执行；只有明确恢复会话并恢复待发后才继续。

模型记录与已确认配置都不能在会话未就绪、离线或配置未确认时冒充当前回读。此时入口明确显示上次使用的模型。上下文从输入台移到标题状态球，只有同 native 的就绪会话、有效容量与真实用量才显示环形百分比；无数据不估算。异常、配置未确认、未知派发、离线和暂停状态不显示过时百分比；点击状态球可看状态和真实采样时间。

审批按钮只有在连接在线、工作区可写、能力有效且请求仍待审批时可用。`approval-presentation.ts` 区分规则未调用 AI、实际审查和等待 e 确认；仅全部 pending 都在辅助模式审查中时，汇总提示才改为“AI 审查中”，混合请求仍保留人工入口。权限详情用实际 `approvalPolicyVersion` 区分旧 API，不以热更新宣称后端已生效。配置切换也等待运行器回读确认；切换提供方前显示确认框，当前轮执行中不能修改配置。推理滑条按运行器返回的离散档位排列，拖动先预览，松开或键盘 Enter 后提交一次；输入台摘要在回读前保持已确认值。预览绑定 native、模型、revision 和档位集合，过期预览拒绝提交。选模型后重新读取实际档位，运行器发生调整会说明，不默认最高档。只有一个或没有可调档位时不显示无效滑条。错误和工具输出显示前做脱敏，原始会话证据不被界面改写。

正文消息尾部保留复制、时间与详情入口；纯执行段不显示正文页脚与重复时间戳。连续工具/思考片段默认收在一行执行摘要中，混合消息开头的思考和末尾的工具也参与邻接合并；只有纯思考时称“思考过程”。摘要保留工具数，并提供由真实工具名与有限参数生成的短句（如读取/修改文件名、搜索词、常见测试命令）；失败、拒绝、等待批准等保留独立状态。工具类型/思考段数进入展开层。运行中也不强制展开；失败、拒绝和未知状态在摘要标明，pending 审批卡始终独立展示。工具历史审批与请求时间进入单工具详情，运行/内部轮次及消息模型仍保存在执行详情和原始元数据中。执行配置由输入台承担，不能把历史回复的模型替换成当前选择。

模型列表按真实 provider 分组，可搜索名称和 ID，没有静态推荐模型或虚构默认选项。取消跨 provider 确认回到模型列表；Esc 按详情、模型列表、推理面板和外层窗口逐层返回。刷新按钮只是重新读取配置，不修改 Pi 全局默认。

输入框的 `useAgentMentions` 弹层按光标附近的查询提供同画布其他真实 Agent，支持名称或 hash 过滤、方向键、Enter/Tab、Esc 和 IME。选择只替换引用所在片段，不重建输入框、不提交消息、不改变投递意图。消息引用语法与服务器共用实现。来自受管 Agent 的待发消息标明来源，不允许改写后继续冒充发送方；可明确删除或控制队列。

## 改动指南

- 对话顺序或工具归属问题先看 `TranscriptProjector.project`。保留稳定实体标识和未关联活动，不用数组下标代替业务身份。
- 执行短句由 `execution-description.ts` 在本地确定性生成，不调用模型。它只使用短文件名、受控标签或命令家族，不引用思考/工具输出，也不把命令结束解释为测试通过、任务完成或 Canvas 消息已消费；复杂/复合 shell 一律写“执行命令”。
- 展示聚合只跨相邻、同 `runId`（或双方均缺失）的纯执行段；用户输入、可读正文、消息错误、未关联活动以及不同/已知与未知 run 都是边界。`sourceTurns` 保存每个原始轮次，不用显示片段替换事实；片段 key 绑定原条目与首个 part，而非当前数量。混合消息只由最后一段正文保留页脚，复制仍包含原消息的完整正文。聚合后的 `turnId` 只有完全一致才保留；不能据视觉分组推导真实工具关联或授权。空白文本不创建空 Markdown 段。缓存与 key 以首条稳定记录为基准，不能按当前计数换 key。
- 新增发送方式必须同时修改 `Composer`、`presentation` 和后端能力契约。不能只开放按钮绕过能力有效期、归档限制或配置未确认状态。
- `ChatUIStore.beginAutomatic` 固定普通输入为 nextTurn，并保留未确认意图的目标通道。重试时不能因状态变化将同一未确认输入从消息改成队列或反向派发；旧版没有目标记录的未确认草稿阻止重新解释，要求核实。旧的模式偏好不会驱动新输入台。改草稿清理逻辑时继续保留 revision 与稳定 intent 检查。
- 附件支持范围由 `readAttachment` 和共享校验共同决定。浏览器报告的 `text/markdown`、`text/x-markdown`、`text/csv` 和纯文本会统一为 `text/plain`；只有空 MIME 才按文本扩展名回退，不把已声明的二进制 MIME 当成文本。
- 链接安全由 `safeLink` 限定为无内嵌账号密码的 HTTP(S) 地址；`redact` 只是显示层脱敏，不能作为服务端秘密管理或完整数据清洗方案。
