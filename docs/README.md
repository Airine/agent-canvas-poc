# 文档索引

## 目录约定

```text
docs/
├── runbooks/             # 环境配置、启动和排障
├── plans/                # 调研计划、实施计划与优化待办
└── research/
    ├── reports/          # 完整报告、提纲、引用清单
    ├── chapters/         # 分章节正文与对应来源映射
    └── dimensions/       # 12 个维度调研、交叉验证与洞察
```

应用源码与配置仍在 `app/`；协议实验仍在 `spike/`；运行复验脚本仍在 `render-preview/`。这些目录本次未迁移。

## 运行与实施

- [WSL 运行手册](runbooks/RUNBOOK_WSL.md)
- [调研计划](plans/plan.md)
- [双画布 PoC 计划](plans/plan_poc.md)
- [herdr 产品化计划](plans/plan_product.md)
- [Canvas 操作优化列表](plans/canvas-optimization.md)
- [应用说明](../app/README.md)
- [herdr 协议实证报告](../spike/REPORT.md)

## 研究资料

- [完整研究报告](research/reports/agent_canvas.agent.final.md)
- [转换版报告](research/reports/agent_canvas.agent.final.converted.md)（保留原始版本，不在目录整理中合并）
- [研究提纲](research/reports/agent_canvas.agent.outline.md)
- [参考文献](research/reports/agent_canvas_ref.md) / [结构化引用](research/reports/agent_canvas.citation.jsonl)
- [分章节资料](research/chapters/)：`agent_canvas_sec00.md` 至 `agent_canvas_sec08.md`；同名 `_refs.md` 为对应来源映射。
- [维度调研](research/dimensions/)：`agent_canvas_dim01.md` 至 `agent_canvas_dim12.md`。
- [交叉验证](research/dimensions/agent_canvas_cross_verification.md)
- [研究洞察](research/dimensions/agent_canvas_insight.md)

## 路径与历史资料说明

原根目录的 `RUNBOOK_WSL.md` 迁至 `runbooks/`，`plan*.md` 和 `canvas-optimization.md` 迁至 `plans/`，`agent_canvas*` 迁至 `research/reports/` 或 `research/chapters/`；原根目录 `research/` 的内容迁至 `research/dimensions/`。

历史文档中的 `/mnt/agents/output/...` 等绝对路径记录的是原生成环境，并非当前仓库路径，因此保留原文。运行手册中的 `app/`、`spike/`、`render-preview/` 和相关命令仍以仓库根目录为基准。

报告原有的 4 张 PNG 插图未入库，目前无法显示（整理前已缺失）：`agent_canvas_sec02_lod_tiers.png`、`agent_canvas_sec03_fastapply.png`、`agent_canvas_sec04_stream_replay.png`、`agent_canvas_sec07_perf.png`。如恢复原始图片，需在 `research/reports/` 和 `research/chapters/` 中放置对应图片，或统一调整正文图片链接。

新增文档按以上用途归类，并在本索引增加入口；不要再把研究生成文件散放到仓库根目录。
