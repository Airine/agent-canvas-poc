---
title: 启动与验证
description: 本地启动器、编译检查和分层测试的维护入口。
sources:
  - app/knip.jsonc 19f2426b4045
  - app/package.json 73c4e294f2ea
  - app/scripts/dev-e.mjs 82c22e9d56a3
  - app/scripts/e-control.mjs ed63498cbe6f controlSession
  - app/scripts/agents/data-process.sh 29d20304546c
  - app/playwright.config.ts 82f0d7dd0bc7
  - app/test/browser/real-e.spec.ts 63f88818ee13
  - app/test/unit/e-routes.test.mjs 420d926388e1
  - app/tsconfig.api.json 3ef105e6ff0c
  - README.md c575fca242fc
  - docs/guides/E_BACKEND.md 54f0e5f81c91
covers:
  - app/package.json
  - app/eslint.config.js
  - app/knip.jsonc
  - app/tsconfig.json
  - app/tsconfig.api.json
  - app/playwright.config.ts
  - app/README.md
  - app/test/
  - app/scripts/dev-e.mjs
  - app/scripts/e-control.mjs
  - app/scripts/agents/
  - README.md
  - docs/README.md
  - docs/guides/RUNBOOK_WSL.md
  - docs/guides/E_BACKEND.md
  - docs/guides/E_INTEGRATION_VERIFICATION.md
---

# 启动与验证

## 职责

这一页负责开发者从安装依赖到验证改动的操作边界。测试与启动配置虽然分散在多个目录，维护目标相同：本地服务应使用独立端口和数据目录，普通检查不能误启动真实模型任务，历史验收记录也不能充当本次通过的证据。

## 对外接口

以下命令在 `app/` 中执行，脚本事实源是 `app/package.json`。

| 命令 | 用途 |
| --- | --- |
| `npm run dev:e` | 加载本地配置，同时启动 API 和 Vite |
| `npm run start:e` | 检查构建产物后启动生产单服务 |
| `npm run dev` / `npm run dev:api` | 单独启动前端或 API；需要自行对齐端口 |
| `npm run build` | TypeScript 项目构建与 Vite 打包 |
| `npm run build:api` | 依据 `app/tsconfig.api.json` 编译 API 到 `dist-api/` |
| `npm run lint` | ESLint 与架构事实/归属校验 |
| `npm run collaboration:inspect -- --manifest` | 只读版本包检查，不代表某会话已加载 |
| `npm test` | 通过 tsx 执行 `app/test/unit/*.test.mjs` |
| `npm run test:e2e` | 执行 `app/test/browser/` 的 Playwright 用例 |

`app/scripts/dev-e.mjs` 读取 `app/.env.e`，默认 API 端口 3300、前端端口 5173；端口已占用即失败，不借用别的服务。它通过 `/api/runtime/status` 检查启动结果，子进程退出后会收尾其他子进程。

`app/scripts/e-control.mjs` 导出 `controlSession`，供私有运行时 worker 使用，不能当成独立命令运行。它获取控制依据，验证 authoritative capability 与有效期，携带会话修订号和幂等标识发消息、取消运行或处理审批；只对 `STALE_STATE` 再取一次依据并重试。

`app/playwright.config.ts` 默认启动 5189 端口的 Vite，也可用 `CANVAS_TEST_URL` 指向指定实例。`app/test/browser/real-e.spec.ts` 只有设置 `CANVAS_REAL_E2E=1` 才运行真实模型用例；该用例会创建工作区、发送消息并验证恢复前后的 native session 一致。

## 数据怎么流

日常启动先检查本地配置和端口，再启动前后端。开发模式的浏览器请求经前端代理送往 API；生产模式由 API 同时提供网页和接口。关闭启动器时先向子进程请求退出，超时后才强制结束。

单元测试直接导入模块，用临时目录和测试替身隔离持久化或外部运行时；路由测试可直接向路由实例发请求，无须启动监听端口。浏览器用例分为界面 fixture 和显式启用的真实会话验收，前者验证界面行为，不能证明模型确实执行了任务。

旧版演示脚本由终端调度器调用，通过运行目录写入进度、审批标记和消息，等待标准输入继续或中止。它们会产生演示结果，不能用于证明真实 Agent 能力。

## 改动指南

本地真实会话前提和参数见 `docs/guides/E_BACKEND.md`；其 Node 要求是 22.13 以上，且需要已有 ADE/Pi 依赖。旧 Node 20 Dockerfile、配套 .dockerignore 和过时 info.md 已移除，app/README.md 改为实际启动与检查说明；当前不宣称 e 后端已支持容器部署。未使用源码与依赖先通过入口/闭包核对，再分提交清理。

改端口时同时核对启动器、前端代理和控制面的来源校验。改 API 编译输出时注意 `tsconfig.api.json` 仅编译 API TypeScript；示例 JSON、运维脚本和外部运行时依赖不能假设会自动复制进输出目录。

新增测试优先沿用 `app/test/unit/e-routes.test.mjs` 的临时目录隔离模式。运行真实用例前明确指定独立实例；历史 `docs/guides/E_INTEGRATION_VERIFICATION.md` 和 UI 证据中的端口、测试计数只是当时记录。不要为了验收重启用户已有服务，也不要把带自动审批的历史脚本加入默认测试入口。
