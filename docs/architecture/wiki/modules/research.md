---
title: 研究与历史实验
description: 设计依据、协议实证和旧验收工具的阅读边界。
sources:
  - tools/legacy/spike/REPORT.md f75c37d5e7bd
  - tools/legacy/spike/herdr_client.py 08676f7951c4 Herdr
  - tools/legacy/spike/events_subscribe.py 4c1cd70eb79a
  - tools/legacy/render-preview/accept-run.py 5c5a78439092
  - tools/legacy/render-preview/ws-term-test.mjs 8d0caaf52495
  - docs/research/analysis/agent_canvas_cross_verification.md 7ba406fc20e6
  - docs/plans/plan_poc.md b49a4a4b2ca0
  - docs/plans/plan_product.md 49c20fee682c
  - docs/research/report/agent_canvas.agent.final.md 77c747ba261a
covers:
  - tools/legacy/
  - docs/research/analysis/
  - docs/plans/plan.md
  - docs/plans/plan_poc.md
  - docs/plans/plan_product.md
  - docs/plans/canvas-optimization.md
  - docs/research/report/agent_canvas.agent.final.converted.md
  - docs/research/report/agent_canvas.agent.final.md
  - docs/research/report/agent_canvas.agent.outline.md
  - docs/research/report/agent_canvas.citation.jsonl
  - docs/research/report/agent_canvas_ref.md
  - docs/research/report/agent_canvas_sec00.md
  - docs/research/report/agent_canvas_sec00_refs.md
  - docs/research/report/agent_canvas_sec01.md
  - docs/research/report/agent_canvas_sec01_refs.md
  - docs/research/report/agent_canvas_sec02.md
  - docs/research/report/agent_canvas_sec02_refs.md
  - docs/research/report/agent_canvas_sec03.md
  - docs/research/report/agent_canvas_sec03_refs.md
  - docs/research/report/agent_canvas_sec04.md
  - docs/research/report/agent_canvas_sec04_refs.md
  - docs/research/report/agent_canvas_sec05.md
  - docs/research/report/agent_canvas_sec05_refs.md
  - docs/research/report/agent_canvas_sec06.md
  - docs/research/report/agent_canvas_sec06_refs.md
  - docs/research/report/agent_canvas_sec07.md
  - docs/research/report/agent_canvas_sec07_refs.md
  - docs/research/report/agent_canvas_sec08.md
  - docs/research/report/agent_canvas_sec08_refs.md
---

# 研究与历史实验

## 职责

这里保存项目为什么选择当前交互和后端路径的历史依据，包括早期调研、协议实验及旧版验收脚本。文件数量较多，但共同职责明确：保留决策来源，不参与生产服务的模块装配。

阅读时应区分研究建议、当时实测结论和当前实现。早期计划中的能力不能直接视为已经交付，历史测试通过也不代表现在的工作区已经验证过。

## 对外接口

- `docs/research/analysis/agent_canvas_cross_verification.md` 汇总 12 个研究维度，标明验证日期为 2026-09-22。`docs/research/report/agent_canvas.agent.final.md` 是综合报告；分章节草稿、引用与转换版保留写作过程，不由应用构建读取。
- `docs/plans/plan_poc.md` 记录 React Flow 与 tldraw 双实现的早期计划，`docs/plans/plan_product.md` 记录接入 herdr 的产品化路径。这些是历史设计材料，不是现行 API 合同。
- `tools/legacy/spike/REPORT.md` 记录 herdr 0.9.1 的实测边界，包括一次请求一个连接、事件订阅长连接、终端输出轮询以及退出事件没有退出码。`tools/legacy/spike/herdr-api.schema.json` 和 `tools/legacy/spike/events-sample.jsonl` 是当时的协议与事件样本。
- `tools/legacy/spike/herdr_client.py` 提供早期 `Herdr` 客户端，`tools/legacy/spike/events_subscribe.py` 订阅事件并写 NDJSON。它们含实验机器的硬编码路径，不是运行时适配器的替代品。
- `tools/legacy/render-preview/accept-run.py`、`poll-run.py`、`parity-test.py`、`ws-term-test.mjs` 是旧版服务验收入口；`herdr-structure.py` 读取本地工作区结构。目录名不能当成无副作用保证：其中脚本会运行图、发送终端输入、自动批准或重置工作区。

## 数据怎么流

研究材料先按维度收集参考，再交叉验证，最终汇入综合报告和产品计划。这条链路用于追溯设计，不进入在线请求处理。

协议实验直接连接本地终端服务，把请求和事件记录为样本。旧验收脚本则向既有 API 发送请求，轮询节点状态或订阅终端快照，再打印结果。它们依赖已经启动的外部服务；脚本本身不会提供一个隔离的测试后端。

## 改动指南

协议差异先比较 `tools/legacy/spike/REPORT.md` 与当前 `app/api/herdr-adapter.ts`，以当前实现及本次实测为准。不要照搬实验脚本中的 `/home/kimi`、`/root` 或 `/mnt/agents` 路径。

运行 `tools/legacy/render-preview/accept-run.py` 前先读自动审批逻辑，确认目标工作区和副作用。`tools/legacy/render-preview/ws-term-test.mjs` 会运行并重置固定示例工作区；它不能在用户正在运行的工作区上随手执行。

研究报告中的竞品判断和数字属于历史调研，不在本轮架构 Review 中重新背书。修改现行行为时更新代码事实页；历史材料保留日期和语境，避免把计划改写成实现。日常开发与分层验证入口见[启动与验证](development.md)。
