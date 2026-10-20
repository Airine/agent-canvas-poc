---
title: 目录约定
description: 产品、测试、文档与历史工具的放置规则和迁移对照。
sources:
  - app/package.json 76486a23e156
  - app/knip.jsonc 5f091132ff40
  - app/src/pages/canvas/contracts.ts 75be9b49a4d0
  - tools/legacy/README.md 7a5e19d96d98
---

# 目录约定

根目录只保留项目说明和四个职责目录；没有改动产品或文档站的启动位置。

```text
app/                      产品：Vite 前端 + Hono API
  api/                    控制面与 e / herdr 运行时
  src/                    页面、共享视图和 UI 基础组件
  shared/                 浏览器与服务端共用的内容校验
  scripts/                启动器、IPC worker、演示脚本
  test/
    unit/                 隔离的 Node 单元与路由测试
    browser/              Playwright fixture 和显式启用的真实测试
    manual/               手工连接服务的探针，不进 npm test
docs-site/                Fumadocs 网站代码；content/docs 为派生内容
docs/
  architecture/wiki/      当前架构的 Markdown 事实源
  guides/                 启动、运维与验收指南
  plans/                  历史计划和优化设计
  research/analysis/      分维度调研
  research/report/        综合报告、章节与引用
tools/legacy/             原 spike、render-preview 历史脚本
```

## 迁移对照

| 原位置 | 新位置 |
| --- | --- |
| 根目录 `agent_canvas*` | `docs/research/report/`，保留原文件名 |
| `research/` | `docs/research/analysis/` |
| 根目录 `plan*.md`、`canvas-optimization.md` | `docs/plans/` |
| 根目录 `E_BACKEND.md`、`E_INTEGRATION_VERIFICATION.md`、`RUNBOOK_WSL.md` | `docs/guides/` |
| `spike/`、`render-preview/` | `tools/legacy/` 下的同名目录 |
| `app/api/test/` | `app/test/unit/`，同时修改导入与 npm 测试入口 |
| `app/api/test-ws.mjs` | `app/test/manual/ws-smoke.mjs` |

研究正文和实验脚本没有借搬迁改写历史结论。旧脚本保留当时的硬编码地址，
可能运行、重置或自动批准工作区；它们不是安全的默认验收入口。

## 新文件放哪里

- 产品代码仍按当前职责归到 `api/`、`src/`、`shared/`。这轮没有为了统一目录外观而改动编译输出、运行数据或本机配置路径。
- 前端画布消息与数据类型放在 `app/src/pages/canvas/contracts.ts`。真实 store 和 mock 都依赖合同，mock 不再反向依赖 store。旧类型导入由 store 转导出兼容。
- 单元测试统一放 `app/test/unit/`，不能再塞进 `api/`；需要真实服务或真实模型的检查不加入默认 `npm test`。
- `app/knip.jsonc` 明确声明动态 worker、测试与手工入口，并说明声明文件豁免。未使用组件仍在体检报告中，不靠把整个 UI 目录标成入口来掩盖问题。
- `docs-site/content/docs/` 和架构 HTML 都从 Wiki 生成。更新正文后按[维护流程](maintenance.md)复核、同步与再生。

## 这轮没有做什么

上一轮删除了无引用的旧画布占位页；本轮又复核剩余 59 个候选，删除 34 个没有未提交改动的 UI 文件。
另有 18 个未提交文件及 7 个依赖原样保留，不搬动、不改 import，也不以归档隐藏。
具体职责和每个文件的结论见[未使用文件复核](unused-files.md)。这次减少源码维护面，不声称减少了产品运行时体积。
大文件仍可按职责继续拆分；先补回归用例，再重构调度器和路由，避免一次混入多种风险。
