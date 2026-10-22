---
title: 共享内容合同
description: 浏览器、API 和工作进程共用消息校验，保持附件内容、模型能力与会话线协议一致。
sources:
  - app/api/e/contracts.ts 120aeb8ab606 SessionView SessionSnapshot Attachment capabilityAvailable
  - app/api/e/attachments.ts 91fc1060693b
  - app/shared/message-content.mjs 854c2cb3c439 ATTACHMENT_LIMITS validateMessage messageBlocks
  - app/shared/message-content.d.mts ba4a912c7298 validateMessage messageBlocks
  - app/scripts/e-message-preflight.mjs 74c4cb0f8959 loadPiImageProcessor assertImagesUnchanged
  - app/scripts/e-runtime-worker.mts 640693a1eb1f control
covers:
  - app/api/e/contracts.ts
  - app/api/e/attachments.ts
  - app/shared/
  - app/scripts/e-message-preflight.mjs
---

# 共享内容合同

## 职责

这一层统一会话线协议与消息内容校验。浏览器和服务端使用同一份平台无关实现，避免一端接受的正文或附件到了另一端被悄悄改写。服务端兼容文件只转导出共享实现，不维护第二套规则。

附件仅限纯文本和指定图片格式。校验会拒绝无效编码、空附件和超限内容；发送前还会检查当前 Pi 能否原样接收图片。图片如果需要隐式缩放或转换，系统会阻止发送，让用户先处理图片。

## 对外接口

- `app/api/e/contracts.ts` 定义 `SessionView`、`SessionSnapshot`、`ControlPayload`、`RuntimeConfiguration`、`MessageQueue`、`Attachment` 和 `MessageOrigin` 等线协议类型，供浏览器安全地做类型导入。
- `capabilityAvailable` 要求会话处于 `ready`，能力可用、来源权威，且尚未过期。它检查单个能力，不代替服务端的业务约束。
- `app/shared/message-content.mjs` 导出 `decodeAttachment`、`attachmentText`、`validateMessage`、`messageBlocks` 和 `ATTACHMENT_LIMITS`；对应声明位于 `message-content.d.mts`。`app/api/e/attachments.ts` 转导出这些函数。
- `validateMessage` 返回原正文和附件的深拷贝，不会顺手清洗或压缩附件。`messageBlocks` 返回纯字符串，或一个文本块加若干图片块。
- `loadPiImageProcessor` 从当前 Pi 可执行文件向上查找兼容安装，加载图片处理器；`assertImagesUnchanged` 比较处理前后的编码、MIME 与处理提示。

## 数据怎么流

正文与附件到达校验器后，先检查正文类型、字符长度和孤立代理项，再检查附件数量与请求编码体积。附件逐个校验标识、名称、格式和内容签名；纯文本按严格 UTF-8 解码，不允许无效字节或二进制空字符。图片还要确认模型支持图像输入。

消息发往运行时前，纯文本附件会按名称加上说明，与正文合并成一个规范文本。图片保留原编码作为独立内容块。这样发送内容与 Pi 之后公开观察到的用户消息一致，核心运行时才能核对消息确实被消费。

工作进程会重新读取当前模型，而不是只相信页面缓存的选择。遇到图片时，它调用当前 Pi 安装的图片处理器验证：图片必须能解码，而且结果不能发生转换、缩放或附加处理提示。处理器不可用也会拒绝发送。后续派发与确认流程见[e 会话运行时](e-runtime.md)。

## 协作公共契约

`app/shared/collaboration-protocol.mjs` / `.d.mts` 定义协作工具、参数与结果 schema、稳定错误码、版本与预算，以及完整握手就绪判断，供 API、扩展和状态展示共用。Node-only 的 `collaboration-package.mjs` 负责读取独立 Skill 并计算 manifest，不导入浏览器。调用方身份与审批证据仍在服务端核验；schema 通过不代表有权限。详见 [Canvas 协作](collaboration.md)。

## 改动指南

- 限制统一位于 `ATTACHMENT_LIMITS`：每条最多 4 个附件，单张图片 2 MiB，文本附件合计 100 KiB，请求最多 12 MiB。正文另限 100000 个 JavaScript 字符单位；不要把它解释成 UTF-8 字节数。
- `Attachment` 只允许 `text/plain`、`image/png`、`image/jpeg`、`image/webp`。图片签名校验只是初筛，完整解码验证发生在工作进程，不应删除后者。
- `messageBlocks` 的文本合并顺序参与实际消费核验。修改附件标题、换行或块顺序时，需要连同运行时消费证据的测试一起检查。
- `.mjs` 实现与 `.d.mts` 声明要同步维护；浏览器导入共享路径，避免落入服务端 `/api` 路由命名空间。
- `MessageOrigin` 区分来源类别、通道和认证状态。当前工作进程只在找到动作应用证据与消息来源事件的对应关系后标记 Canvas 本地输入，并保留 `authenticated: false`；不要仅凭消息角色推断已认证人类身份。
- `MessageOrigin` 的受管 Agent 来源还带 sourceNodeId、sourceNativeSessionId 与 communicationId，来自私有工具调用和实际消费观察的关联；重放只恢复先前可信记录的精确唯一元组，不解析正文认人，见 [Canvas 协作](collaboration.md)。
- `app/shared/agent-reference.mjs` 与 `.d.mts` 提供前后端一致的身份/hash 引用；昵称只描述，解析按同画布 hash，歧义拒绝。
- 审批摘要与权限判断使用同一组会话字段，修改 `SessionSnapshot` 时同时检查[审批与权限](e-approvals.md)和运行时投影。
