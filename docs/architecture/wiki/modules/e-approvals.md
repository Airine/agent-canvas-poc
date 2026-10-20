---
title: 审批与权限
description: 将审批绑定到完整工具参数，在会话范围内执行人工、辅助或全自动审批，并记录审计结果。
sources:
  - app/api/e/approval-binding.ts 130196b90918 bindApproval exactOperationKey
  - app/api/e/approval-engine.ts 5ae03852a7d4 ApprovalEngine
  - app/api/e/approval-rules.ts de2e761cb335 approvalRule
  - app/api/e/approval-reviewer.ts 070f63fa8c29 reviewApproval parseReview proposeApprovalGrant
  - app/api/e/session-manager.ts f1a051ecac53 setApprovalMode grantExactApproval
  - app/scripts/e-control.mjs ed63498cbe6f controlSession
covers:
  - app/api/e/approval-binding.ts
  - app/api/e/approval-engine.ts
  - app/api/e/approval-rules.ts
  - app/api/e/approval-reviewer.ts
---

# 审批与权限

## 职责

这一层决定待审批的工具操作是否留给人工、交独立模型审查，或按用户明确选择的会话模式批准。审批对象绑定原生会话、当前运行代次和完整工具参数；旧审查结果不能直接批准已经变化的请求。

自动批准只提交授权决定，不代表工具已经执行成功。授权不跨会话恢复：停止、重启或切换审批模式都会清空当前自动审查任务和精确授权。实现分别位于审批绑定、审批引擎和会话管理文件。

## 对外接口

- `bindApproval` 在 `app/api/e/approval-binding.ts` 中把待审批记录和工具参数绑定，生成 `digest`。它同时比对工具记录与消息块中的名称、参数，只有完整一致的输入才标记为 `complete`。`exactOperationKey` 为工具名称与完整参数生成稳定摘要。
- `ApprovalEngine` 在 `app/api/e/approval-engine.ts` 中提供 `set`、`reset`、`manual`、`grantExact` 和 `observe`。模式有 `manual`、`assisted`、`full`。
- `approvalRule` 在 `app/api/e/approval-rules.ts` 中返回 `allow`、`review` 或 `manual`。精确命中的只读命令可直接通过，小范围文件改动交独立模型审查，其余留给人工。
- `reviewApproval` 启动无工具的独立 Pi 审查进程。`parseReview` 用严格 schema 解析结果，只接受明确的低风险批准；并发最多 2 个，45 秒超时。
- `proposeApprovalGrant` 只生成正则建议和风险说明，没有授权能力。当前 `grantExact` 使用工具与完整参数精确匹配，不能把建议正则当成已启用的规则。
- 会话管理层通过 `setApprovalMode` 与 `grantExactApproval` 接入；最终决定仍由 `controlSession` 发送给核心运行时。

## 数据怎么流

会话快照变化后，审批引擎检查是否有待处理的审批，以及当前能力是否仍然有效。人工模式通常不自动动作；用户若已经授权当前会话内某个完全相同的操作，该操作可以再次匹配。辅助模式先过确定性规则，必要时再提交独立模型。全自动模式跳过这组风险筛选，但仍会检查会话和审批有没有变化。

独立模型收到最近一条用户消息的文本、工作目录和拟执行工具参数。审查进程使用临时目录，不带会话文件，也不启用工具、扩展或技能。结果不确定、输出无效、超时或进程失败，都留下人工处理机会，不会自动重试。

提交前会再次确认审批摘要与会话身份。辅助模式还会重新检查文件路径与目标状态；人工处理或模式切换会中止旧审查。授权意图经会话管理层发送到工作进程，再由核心审批接口处理。审计记录保留来源、理由和阶段，最近 100 条随会话记录保存。

Canvas 的四个协作工具也经过 e 的同一审批通道。Canvas 在自己的 generation 目录生成适配器副本，仅增加工具名单；ADE 原文件不改。辅助规则把这些工具作为未知工具交给人工，Full Access 仍只在用户明确启用的当前会话内自动处理。服务端再校验真实工具、参数与批准证据，不凭来源声明执行；见 [Canvas 协作](collaboration.md)。

## 改动指南

- 修改绑定规则先看 `bindApproval`：`digest` 覆盖原生身份、运行代次、审批对象和参数，`complete` 还要求不同来源一致。不能只凭工具名或摘要文字批准。
- `grantExact` 只接受完整、未变化的 `bash`、`write`、`edit` 请求，最多保存 100 项；授权键还包含工作目录与运行代次。不要将这些内存授权恢复自磁盘。
- 新增规则需检查 `approvalRule` 的路径约束、字段白名单及内容筛选。路径检查拒绝 `..` 跳转与任意一层符号链接（包括悬空链接），并解析真实目标或新文件父目录。普通目录别名也会转人工；这是有意收紧的辅助审批边界。外部工具执行前的文件系统竞态仍不能仅靠预检消除。
- `reviewApproval` 的结论不能覆盖确定性规则。改变审查提示或 schema 时，保留无工具模式、取消信号和无效输出转人工的行为。
- 审计中的 `submitted` 只说明批准请求已提交。执行结果必须查看核心审批与工具状态，不能用审计条目替代运行结果。
- 与消息发送共用的能力和意图幂等检查见[e 会话运行时](e-runtime.md)；线上的审批字段定义见[共享内容合同](message-content.md)。
