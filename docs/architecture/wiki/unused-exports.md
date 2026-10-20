---
title: 未使用导出复核
description: 保存基线后逐项处理 36 个导出，保留内部实现和真实类型声明。
sources:
  - docs/architecture/unused-export-review.json 74937dc07f91
  - app/knip.jsonc 536d92549483
  - app/shared/model-recovery.d.mts 3633aa468dde
  - docs-site/scripts/declaration-resolution.test.mjs 761811b10e6b
---

# 未使用导出复核

## 基线与范围

2026-10-20 执行本轮时，剩余 25 个无入口文件已由提交 `119cbf3` 删除；它们的原内容保存在 `a1858ae`，详见[文件复核](unused-files.md)。本轮没有重复删除这些文件，也没有回退中间的功能开发。

本轮首先将当前审批与聊天功能、文档和验收证据保存为 `e122d9b`，再重新扫描。旧报告的 30 项导出仍在，新增协作协议和离线示例带来 6 项，合计 36 项：

- 22 项只取消导出，保留模块内部调用和行为。
- 8 项没有调用，删除实现及仅服务于它们的代码。
- 6 项是共享入口的多余转导出，删除转导出，不重复计算为 6 个实现。

`initialGraph` 的旧硬编码回退没有消费者；工作区实际初始化仍由 registry 读取图模板。正则授权建议生成器没有路由或调用者；精确授权及真实独立审批审查保持原样。两个画布原型、演示事件引擎和量化示例仍保留。

## 如何复核

重新运行 Knip 5 的 files/exports 检查，逐项搜索符号及导入，并检查实现内部的调用。仓库是私有应用，不把历史上导出的所有函数当作外部 SDK。共同名称如 `call`、`base64`、`round` 的文本命中不等于调用。审批、协作、消息附件等声明文件随实现同步收窄，不保留虚假的导出签名。

历史裁决保存在 `docs/architecture/unused-export-review.json`，不是扫描豁免；再次增加未使用导出，Knip 仍会报告。

## 逐项裁决

| 文件 | 符号 | 处理 |
| --- | --- | --- |
| `app/shared/collaboration-protocol.mjs` | `COLLABORATION_ERROR_CODES` | 改为模块私有；内部调用保留 |
| `app/shared/collaboration-protocol.mjs` | `collaborationTool` | 改为模块私有；内部调用保留 |
| `app/api/herdr-adapter.ts` | `HERDR_BIN` | 改为模块私有；内部调用保留 |
| `app/api/herdr-adapter.ts` | `HERDR_SOCKET_PATH` | 改为模块私有；内部调用保留 |
| `app/api/herdr-adapter.ts` | `HerdrError` | 改为模块私有；内部调用保留 |
| `app/api/herdr-adapter.ts` | `call` | 改为模块私有；内部调用保留 |
| `app/api/herdr-adapter.ts` | `cli` | 删除无调用实现 |
| `app/api/herdr-adapter.ts` | `tabClose` | 删除无调用实现 |
| `app/api/e/approval-reviewer.ts` | `proposeApprovalGrant` | 删除无调用实现 |
| `app/src/pages/canvas/chat/attachments.ts` | `base64` | 改为模块私有；内部调用保留 |
| `app/src/shared/ViewModeManager.ts` | `L0_MAX_PX` | 改为模块私有；内部调用保留 |
| `app/src/shared/ViewModeManager.ts` | `L1_MAX_PX` | 改为模块私有；内部调用保留 |
| `app/src/shared/ViewModeManager.ts` | `ZOOM_DEBOUNCE_MS` | 改为模块私有；内部调用保留 |
| `app/src/shared/ViewModeManager.ts` | `modeForScreenWidth` | 改为模块私有；内部调用保留 |
| `app/api/graph.ts` | `initialGraph` | 删除无调用实现 |
| `app/api/graph.ts` | `removeGraphStore` | 删除无调用实现 |
| `app/api/graph.ts` | `listGraphStores` | 删除无调用实现 |
| `app/scripts/e-configuration.mjs` | `cleanModel` | 改为模块私有；内部调用保留 |
| `app/src/pages/canvas/live-store.ts` | `useLiveNode` | 删除无调用实现 |
| `app/scripts/demo-quant-canvas/lib/market.mjs` | `UNIVERSE` | 改为模块私有；内部调用保留 |
| `app/scripts/demo-quant-canvas/lib/market.mjs` | `mulberry32` | 改为模块私有；内部调用保留 |
| `app/scripts/demo-quant-canvas/lib/market.mjs` | `round` | 改为模块私有；内部调用保留 |
| `app/scripts/demo-quant-canvas/lib/strategy.mjs` | `selectWeights` | 改为模块私有；内部调用保留 |
| `app/shared/message-content.mjs` | `decodeAttachment` | 改为模块私有；内部调用保留 |
| `app/src/shared/mock/engine.ts` | `buildSnapshot` | 改为模块私有；内部调用保留 |
| `app/src/shared/mock/events.ts` | `MOCK_TOTAL` | 删除无调用实现 |
| `app/src/shared/index.ts` | `MOCK_TOTAL` | 删除无消费者的转导出 |
| `app/src/shared/index.ts` | `buildSnapshot` | 删除无消费者的转导出 |
| `app/src/shared/index.ts` | `modeForScreenWidth` | 删除无消费者的转导出 |
| `app/src/shared/index.ts` | `L0_MAX_PX` | 删除无消费者的转导出 |
| `app/src/shared/index.ts` | `L1_MAX_PX` | 删除无消费者的转导出 |
| `app/src/shared/index.ts` | `ZOOM_DEBOUNCE_MS` | 删除无消费者的转导出 |
| `app/src/pages/canvas/utils.ts` | `fmtElapsed` | 改为模块私有；内部调用保留 |
| `app/src/pages/canvas/utils.ts` | `stripAnsi` | 改为模块私有；内部调用保留 |
| `app/src/pages/reactflow/utils.ts` | `fmtElapsed` | 改为模块私有；内部调用保留 |
| `app/src/pages/tldraw/CanvasOverlays.tsx` | `ZoomBridge` | 改为模块私有；内部调用保留 |

## 新增类型声明不是死文件

本轮新扫描唯一的文件候选是 `app/shared/model-recovery.d.mts`。运行时入口 `app/scripts/e-runtime-worker.mts` 导入 `../shared/model-recovery.mjs`；TypeScript 的 NodeNext 解析器会为这个导入选择同名 `.d.mts` 声明。已经通过真实解析调用及 `declaration-resolution.test.mjs` 验证，故沿用其他同名声明的配置惯例，把该**单个文件**加入 Knip 的声明豁免。运行时实现仍参与扫描，没有放宽整目录。

这属于已确认的类型系统引用，不是“疑似动态调用”。文档中的一般字符串命中不能作为这种豁免的依据。

## 报告与分数

实时结果以[代码体检](health.md)为准。评分公式没有修改：死文件、疑似文件、未使用导出、循环依赖和断链均为零时，模板自然计算为 100 分。这只是当前扫描范围内的静态指标，不代表没有缺陷，也不涵盖模板字符串动态导入或真实运行环境的全部行为。
