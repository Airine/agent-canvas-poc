---
title: 代码审查
description: 当前工作区的高置信问题、触发条件和修复顺序。
sources:
  - app/test/unit/health-regressions.test.mjs 4ce16fe1aaa5
  - app/test/unit/live-store-reconnect.test.mjs ec879ce1f0e9
  - app/test/unit/coordinator-failure.test.mjs 7e6aeeacbf12
  - app/test/unit/e-routes.test.mjs a1d8431a9269
  - app/test/browser/e-canvas.spec.ts 6dbdbfa1d93d
  - app/api/e/approval-rules.ts de2e761cb335 approvalRule
  - app/api/e/message-queue.ts 035004c14654 mutateQueue
  - app/src/pages/canvas/live-store.ts 056a5d79638a LiveStore
  - app/src/pages/canvas/LiveTerminal.tsx c93871702251 LiveTerminal
  - app/src/pages/canvas/index.tsx 0c93d9ab6b59
  - app/src/pages/canvas/chat/attachments.ts 2eba1c6a1bc5 readAttachment
  - app/api/routes.ts 7cbd733eaf33 wsHandlers
  - app/api/eventbus.ts 47b4e6ed936c
  - app/api/coordinator.ts 2f2630aa80fe
---


# 代码审查

2026-10-19 首次审查发现的 1 项 P1 和 7 项 P2 已在当前工作区修复。以下记录修复方式与回归入口，不把“已修复”延伸成整个系统没有其他问题。

## 修复与证据

| 优先级 / 问题 | 当前处理 | 回归入口 |
| --- | --- | --- |
| P1：目录符号链接绕过辅助审批 | 拒绝路径任一层符号链接、悬空链接和父目录跳转；新文件也检查父目录。普通链接也转人工。 | `app/test/unit/health-regressions.test.mjs`：隐藏目录别名、最终文件与悬空链接，write/edit 双路径 |
| P2：编辑待发绕过 32 MiB 上限 | 在暂存副本上验证最终 UTF-8 字节容量，成功后提交；拒绝保持原值、版本和授权。 | 同上：连续大附件编辑、超限 add/edit 与派发对象身份 |
| P2：终端重连丢订阅 | 完整图握手后重发活跃 herdr 订阅，包含序号缺口触发的新 hello；不向 e 会话重放。 | `app/test/unit/live-store-reconnect.test.mjs` |
| P2：同名节点事件串工作区 | 生产、广播、历史查询与速率统一携带工作区；兼容路由也限定活动工作区。 | `app/test/unit/e-routes.test.mjs`：两个工作区的同名节点 |
| P2：pane 异常关闭不激活错误边 | 生命周期事件处理独立成方法，无退出标记时也激活错误处理分支。 | `app/test/unit/coordinator-failure.test.mjs`：exited/closed、重复事件和整图结束 |
| P2：shell wrapper 拆开路径 | 统一 shell 参数引用，覆盖脚本、运行目录、节点参数和退出标记。 | `health-regressions.test.mjs`：空格、单引号、命令替换文本和非零退出码 |
| P2：Markdown/CSV MIME 不兼容 | 明确文本 MIME 归一到纯文本；有二进制 MIME 时不按扩展名放行。 | `health-regressions.test.mjs`：空 MIME、Markdown、CSV 与二进制拒绝 |
| P2：自动布局不重新适配视口 | React effect 显式订阅布局完成序号。 | `app/test/browser/e-canvas.spec.ts`：坐标移到远处后节点重新进入视口 |

## 结构整理

前端消息类型移到 `app/src/pages/canvas/contracts.ts`，真实 store 与 mock 依赖同一合同，消除原来的类型循环。旧 store 类型转导出仍可用。已删除没有入口引用的旧画布占位页。

单元测试不再混在 API 目录。研究资料、阶段计划、运行指南和历史工具按职责归档，完整位置见[目录约定](repository-layout.md)。随后对 59 个未使用候选逐项复核：删除 34 个干净文件，保护 18 个未提交文件及其 7 个依赖。证据见[未使用文件复核](unused-files.md)，剩余候选仍如实列在[代码体检](health.md)。

## 验证边界

单元测试使用临时目录、假 WebSocket 和归一化生命周期事件；浏览器布局用例使用明确的协议 fixture。本轮没有启动真实 Pi 会话或 herdr 进程，没有重置用户工作区，也没有运行历史自动审批脚本。

审批预检不能替代外部工具执行时的文件系统隔离；不宣称消除了任意并发文件替换风险。大文件热点和其他未使用导出继续保留在体检中，不为降低计数做无证据删除。
