---
title: 代码体检
description: 未使用文件、循环依赖、历史热点和静态解析断点。
generated: npm --prefix docs-site run architecture:analyze
generated-at: e122d9b971a064ce0d101a6fb79970b1f2600270
---
# 代码体检

本页由 `npm --prefix docs-site run architecture:analyze` 再生。范围为当前工作区（包含未跟踪、未忽略文件），共 230 个 JS/TS 源文件。历史 churn 仅来自已提交记录，不代表未提交代码的风险大小。原始结果位于 `docs/architecture/reports/`。

## 死代码

2026-10-20 的 62 项人工复核：62 个文件已删除；0 个保留未提交内容、0 个保留其依赖，均仍计入未使用候选。0 项内容或存在状态改变，需要重新复核；0 项不再由 Knip 报未使用。逐项证据与职责见[未使用文件复核](unused-files.md)。

Knip 报告 0 个未使用文件、0 个未使用导出。经过文件名和基础名的全仓字符串搜索，0 个没有引用痕迹，0 个保留为疑似；分析脚本本身不删除文件，人工清理见复核记录。

本次未发现符合此分类的文件。

### 疑似（存在动态引用痕迹，需人工确认）

字符串痕迹可能来自文档、CSS 或通用名称，并不证明运行时使用；人工保留原因见上方逐项复核。

本次未发现符合此分类的文件。

## 循环依赖

规定命令 `npx -y knip@5 --reporter json --include files,exports,cycles` 返回 `Invalid issue type: cycles`。死文件/导出改用支持的 `files,exports`；循环使用 oxc 导入图上的 Tarjan 强连通分量复核，不把命令失败当作零循环。

本次静态图没有多节点循环分量或自环。模板字符串动态导入不在此结论范围内。

## 高危热点

按 `git log --since="12 months ago" --name-only --pretty=format:` 的改动次数乘当前行数排序；这是审查优先级信号，不是已确认缺陷。

| 文件 | 12 个月改动次数 | 行数 | 乘积 |
| --- | ---: | ---: | ---: |
| `app/api/routes.ts` | 3 | 521 | 1563 |
| `app/src/pages/canvas/mock-server.ts` | 2 | 640 | 1280 |
| `app/api/coordinator.ts` | 2 | 617 | 1234 |
| `app/src/pages/canvas/index.tsx` | 2 | 610 | 1220 |
| `app/src/pages/reactflow/index.tsx` | 2 | 475 | 950 |
| `app/src/pages/canvas/live-store.ts` | 2 | 463 | 926 |
| `app/api/herdr-adapter.ts` | 2 | 409 | 818 |
| `app/scripts/demo-quant-canvas/run.mjs` | 1 | 763 | 763 |
| `app/api/e/session-manager.ts` | 2 | 366 | 732 |
| `app/src/pages/canvas/LiveEdge.tsx` | 3 | 235 | 705 |

## 断点

oxc 未报告解析失败或无法解析的相对导入。别名按 tsconfig 自动解析；依赖包与仓库外 ADE 路径不当作仓内断链。

模板字符串动态导入对静态解析不可见（不进 imports 也不进 unresolved），靠死文件复核与边界回报兜底。

零入度文件的逐项裁决见[入口对账](entrypoints.md)，人工 Review 见[代码审查](review.md)，导出的逐项处理见[未使用导出复核](unused-exports.md)。
