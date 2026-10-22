---
title: 入口对账
description: 逐项裁决静态图的零入度候选，区分运行入口、工具配置和未接入代码。
generated: npm --prefix docs-site run architecture:analyze
generated-at: f8249ea46c1fc0513d9462600449e5755b06dc69
---
# 入口对账

依赖图按工作区当前内容生成；零入度只说明没有仓内静态导入者，不能单凭这一点删除文件。下表逐项分类。

| 文件 | 裁决 |
| --- | --- |
| `app/api/index.ts` | 真实入口：HTTP / WebSocket 控制面，见数据流「控制面入口」 |
| `app/eslint.config.js` | 非入口：构建或检查配置，由对应工具加载 |
| `app/playwright.config.ts` | 非入口：构建或检查配置，由对应工具加载 |
| `app/postcss.config.js` | 非入口：构建或检查配置，由对应工具加载 |
| `app/scripts/canvas-tools.mjs` | 真实入口：由会话 worker 生成的扩展显式加载，走私有 FD 与 e 审批，见数据流「Agent 协作」 |
| `app/scripts/collaboration-inspect.mjs` | 只读入口：打印版本匹配的 Skill / 契约 / manifest，不启动会话或发送消息 |
| `app/scripts/demo-quant-canvas/run.mjs` | 示例入口：离线量化研究模拟，显式运行，不连接模型或券商 |
| `app/scripts/dev-e.mjs` | 真实入口：开发/生产启动器，见数据流「启动与退出」 |
| `app/scripts/e-runtime-worker.mts` | 真实入口：父进程 fork 的 IPC worker，见数据流「会话进程」 |
| `app/shared/agent-reference.d.mts` | 非入口：未接入文件或可复用组件，结合死代码复核，不推断运行能力 |
| `app/shared/collaboration-package.d.mts` | 非入口：未接入文件或可复用组件，结合死代码复核，不推断运行能力 |
| `app/shared/collaboration-protocol.d.mts` | 非入口：未接入文件或可复用组件，结合死代码复核，不推断运行能力 |
| `app/shared/message-content.d.mts` | 非入口：未接入文件或可复用组件，结合死代码复核，不推断运行能力 |
| `app/shared/model-recovery.d.mts` | 非入口：未接入文件或可复用组件，结合死代码复核，不推断运行能力 |
| `app/shared/queue-review.d.mts` | 非入口：未接入文件或可复用组件，结合死代码复核，不推断运行能力 |
| `app/src/main.tsx` | 真实入口：浏览器启动 → 路由 → 工作区/画布，见数据流「浏览器入口」 |
| `app/tailwind.config.js` | 非入口：构建或检查配置，由对应工具加载 |
| `app/test/browser/card-approval-modes.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/chat-experience.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/chat-header.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/chat-polish.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/collaboration-package.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/collaboration.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/composer-auto.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/desktop-composer.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/e-canvas.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/global-card-view.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/identity-window.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/queue-review.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/real-e.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/real-multi.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/real-tools.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/reasoning-picker.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/recovery-ui.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/theme.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/browser/tool-hierarchy.spec.ts` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/manual/real-collaboration.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/manual/ws-smoke.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/approval-policy.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/approval-presentation.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/approval-reviewer.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/attachments.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/card-view.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/chat-errors.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/chat-polish.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/chat-presentation-state.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/chat-projection.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/chat-ui-store.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/collaboration-package.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/collaboration.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/composer-auto.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/coordinator-failure.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/desktop-configuration.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/desktop-image-preflight.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/desktop-manager.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/desktop-message.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/desktop-metadata.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/e-adapter.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/e-control.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/e-projection.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/e-routes.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/e-session-manager.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/execution-description.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/execution-presentation.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/fixtures/desktop-worker.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/fixtures/session-worker.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/global-card-view.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/health-regressions.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/live-store-reconnect.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/message-origins.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/production-assets.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/quant-canvas-demo.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/queue-review.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/recovery-presentation.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/runtime-config-presentation.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/session-identity.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/session-store.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/theme-tokens.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/test/unit/workspace-paths.test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |
| `app/vite.config.ts` | 非入口：构建或检查配置，由对应工具加载 |
| `tools/legacy/render-preview/ws-term-test.mjs` | 测试入口：由测试运行器或显式命令执行，不是产品服务 |

Python 与 shell 不属于 JS/TS 解析范围：`tools/legacy/spike/*.py` 和 `tools/legacy/render-preview/*.py` 是手工验证入口；`app/scripts/agents/*.sh` 由 herdr 节点配置触发。其流程见[数据流](data-flow.md)。不存在本仓新增的 HTTP 定时任务或外部队列消费者；待发消费和轮询属于已有进程内部。

文档站另有框架入口：`docs-site/app/page.tsx` 首页、`app/docs/[[...slug]]/page.tsx` 文档、`app/api/search/route.ts` 搜索；这里的 `app/` 均相对文档站。生成与校验脚本均为显式 npm 命令，见[文档站模块](modules/documentation.md)。
