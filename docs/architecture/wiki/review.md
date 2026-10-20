---
title: 代码审查
description: 当前工作区的高置信问题、触发条件和修复顺序。
sources:
  - app/test/unit/health-regressions.test.mjs 4ce16fe1aaa5
  - app/test/unit/live-store-reconnect.test.mjs 0f76b07a6e4c
  - app/test/unit/coordinator-failure.test.mjs 7e6aeeacbf12
  - app/test/unit/e-routes.test.mjs 866f95173379
  - app/test/unit/e-session-manager.test.mjs 88f8298a86b3
  - app/test/unit/e-projection.test.mjs 9a4262e89208
  - app/test/unit/recovery-presentation.test.mjs 08dae2d21338
  - app/test/browser/recovery-ui.spec.ts 3e222113f189
  - app/test/browser/desktop-composer.spec.ts 48fb860d3e9b
  - app/test/browser/e-canvas.spec.ts 6dbdbfa1d93d
  - app/api/e/approval-rules.ts f4596999d61c approvalRule
  - app/api/e/message-queue.ts 035004c14654 mutateQueue
  - app/src/pages/canvas/live-store.ts 30cd63eddcb7 LiveStore
  - app/src/pages/canvas/LiveTerminal.tsx c93871702251 LiveTerminal
  - app/src/pages/canvas/index.tsx 9e21ff626ae2
  - app/src/pages/canvas/chat/attachments.ts 6bc4fc390f29 readAttachment
  - app/api/routes.ts 8727ff4c9a19 wsHandlers
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

单元测试不再混在 API 目录。研究资料、阶段计划、运行指南和历史工具按职责归档，完整位置见[目录约定](repository-layout.md)。对 59 个未使用候选的首次复核删除了 34 个干净文件，暂时保护 18 个未提交文件及其 7 个依赖；后续保存基线后已清理剩余 25 个文件，并处理 36 个未使用导出。逐项证据见[未使用文件复核](unused-files.md)和[未使用导出复核](unused-exports.md)，当前扫描结果见[代码体检](health.md)。

## 2026-10-21 队列与会话生命周期复核

本轮以 `c428a53` 为基线审查未提交改动，修复以下七处问题：

| 问题 | 修复与回归 |
| --- | --- |
| 先收到节点、再收到会话的真实广播顺序未触发画布隐藏 | 归档标记变化通知整张画布；`live-store-reconnect.test.mjs` 和 `recovery-ui.spec.ts` 覆盖节点 → 会话 → HTTP 的顺序。 |
| 恢复投影未清除旧图节点的归档标记 | 投影显式清除标记；`e-projection.test.mjs` 验证合并旧节点和 JSON 序列化。 |
| 过期 HTTP 响应回退归档状态 | 图节点只采用会话存储当前接受的版本；`live-store-reconnect.test.mjs` 覆盖两个方向的乱序响应。 |
| 文件删除失败后内存记录已丢失 | 目录删除成功后才移除内存记录；`e-session-manager.test.mjs` 注入文件系统拒绝并验证可重试。 |
| 恢复失败提示被列表刷新清空 | 刷新后保留操作错误；`recovery-ui.spec.ts` 覆盖容量错误和列表仍可操作。 |
| 限流、认证错误因文案不含“失败”被显示为正常 | 从回复错误事实决定状态等级；`recovery-presentation.test.mjs` 覆盖 401、403、429 和网络错误。 |
| 最近五条回执误按队列位置选择 | 按确认时间排序，不修改原队列；`desktop-composer.spec.ts` 覆盖乱序消费。 |

此轮测试使用临时目录和 HTTP/WS fixture，没有归档、恢复或删除真实会话。既有证据目录中的日期、哈希与测试数字是各轮历史快照，不代表本轮重新验证。

## 验证边界

单元测试使用临时目录、假 WebSocket 和归一化生命周期事件；浏览器布局用例使用明确的协议 fixture。本轮没有启动真实 Pi 会话或 herdr 进程，没有重置用户工作区，也没有运行历史自动审批脚本。

审批预检不能替代外部工具执行时的文件系统隔离；不宣称消除了任意并发文件替换风险。大文件热点继续保留在体检中；未使用文件和导出数量以确定性扫描为准，不为降低计数做无证据删除。
