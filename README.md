# Agent 画布 PoC

React Flow 画布 + herdr 后端的 Agent 编排可视化概念验证。

核心概念映射：**Canvas = Workspace / Zone = Tab / 节点 = Pane** —— 一张画布即一个工作区，画布上的 Zone 对应 herdr 的 tab，Zone 内的节点对应 pane（终端 / 聊天 / 产物视图），Agent 间的消息流转以实时连线呈现。

## 目录结构

- `app/` — React + Vite 前端（React Flow 画布）+ Hono 后端（对接 herdr）
- `spike/` — herdr 协议实证（WebSocket / HTTP API 探测、事件采样、结论报告见 `spike/REPORT.md`）
- `docs/` — [文档索引](docs/README.md)：运行手册、实施计划、优化记录和研究资料
- `render-preview/` — 运行复验脚本与报告预览产物（保留原路径）

## 运行

见 [WSL 运行手册](docs/runbooks/RUNBOOK_WSL.md)。前端标准流程：`cd app && npm install && npm run dev`。

## herdr 二进制

`app/bin/herdr` 与 `spike/herdr`（Linux ELF，约 25MB）不入库。请从 https://herdr.dev 获取 herdr，放置到对应路径即可。

## 二进制资产说明

以下二进制资产未纳入版本库（Git 不适合管理，且当前推送通道仅支持文本）：

- 原根目录 `*.docx`（调研报告 Word 版，共 3 份）与 `*.png`（报告插图，共 4 张）——对应的 Markdown 源文已归入 `docs/research/`；缺失插图及恢复位置见[文档索引](docs/README.md)
- `render-preview/agent_canvas.pdf` 与 `render-preview/page-*.png`（85 张预览页）——可由入库的 Markdown 重新渲染生成
- `app/bin/herdr`、`spike/herdr` —— 见上节
