---
title: 代码体检
description: 未使用文件、循环依赖、历史热点和静态解析断点。
generated: npm --prefix docs-site run architecture:analyze
generated-at: bc3fe792b0fa1cc587067690e7494ab127bf01b2
---
# 代码体检

本页由 `npm --prefix docs-site run architecture:analyze` 再生。范围为当前工作区（包含未跟踪、未忽略文件），共 241 个 JS/TS 源文件。历史 churn 仅来自已提交记录，不代表未提交代码的风险大小。原始结果位于 `docs/architecture/reports/`。

## 死代码

2026-10-19 的 59 项人工复核：34 个文件已删除；12 个保留未提交内容、7 个保留其依赖，均仍计入未使用候选。6 项内容或存在状态改变，需要重新复核；0 项不再由 Knip 报未使用。逐项证据与职责见[未使用文件复核](unused-files.md)。

Knip 报告 25 个未使用文件、36 个未使用导出。经过文件名和基础名的全仓字符串搜索，0 个没有引用痕迹，25 个保留为疑似；分析脚本本身不删除文件，人工清理见复核记录。

本次未发现符合此分类的文件。

### 疑似（存在动态引用痕迹，需人工确认）

字符串痕迹可能来自文档、CSS 或通用名称，并不证明运行时使用；人工保留原因见上方逐项复核。

- `app/src/hooks/use-mobile.ts`：引用痕迹见 `app/src/components/ui/README.md`、`app/src/components/ui/sidebar.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/alert-dialog.tsx`：引用痕迹见 `app/info.md`、`app/package.json`、`app/src/components/ui/README.md`、`app/src/index.css`、`app/src/pages/canvas/chat/ChatPopover.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/badge-variants.ts`：引用痕迹见 `app/src/components/ui/README.md`、`app/src/components/ui/badge.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/badge.tsx`：引用痕迹见 `app/info.md`、`app/src/components/ui/README.md`、`app/src/components/ui/badge-variants.ts`、`app/src/components/ui/sidebar.tsx`、`app/src/index.css`；静态未使用不等于可删除。
- `app/src/components/ui/button-group-variants.ts`：引用痕迹见 `app/src/components/ui/README.md`、`app/src/components/ui/button-group.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/button-group.tsx`：引用痕迹见 `app/info.md`、`app/src/components/ui/README.md`、`app/src/components/ui/button-group-variants.ts`；静态未使用不等于可删除。
- `app/src/components/ui/calendar.tsx`：引用痕迹见 `app/info.md`、`app/src/components/ui/README.md`；静态未使用不等于可删除。
- `app/src/components/ui/form-context.ts`：引用痕迹见 `app/src/components/ui/README.md`、`app/src/components/ui/form.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/form.tsx`：引用痕迹见 `app/README.md`、`app/api/e/attachments.ts`、`app/api/e/session-manager.ts`、`app/api/eventbus.ts`、`app/api/graphs/etl-nightly.json`；静态未使用不等于可删除。
- `app/src/components/ui/input.tsx`：引用痕迹见 `app/api/coordinator.ts`、`app/api/e/approval-engine.ts`、`app/api/e/approval-reviewer.ts`、`app/api/e/approval-rules.ts`、`app/api/e/collaboration.ts`；静态未使用不等于可删除。
- `app/src/components/ui/label.tsx`：引用痕迹见 `app/api/coordinator.ts`、`app/api/e/collaboration.ts`、`app/api/e/contracts.ts`、`app/api/graph.ts`、`app/api/graphs/demo-release-pipeline.json`；静态未使用不等于可删除。
- `app/src/components/ui/navigation-menu-variants.ts`：引用痕迹见 `app/src/components/ui/README.md`、`app/src/components/ui/navigation-menu.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/navigation-menu.tsx`：引用痕迹见 `app/info.md`、`app/package.json`、`app/src/components/ui/README.md`；静态未使用不等于可删除。
- `app/src/components/ui/pagination.tsx`：引用痕迹见 `app/info.md`、`app/src/components/ui/README.md`；静态未使用不等于可删除。
- `app/src/components/ui/separator.tsx`：引用痕迹见 `app/info.md`、`app/package.json`、`app/src/components/ui/README.md`、`app/src/components/ui/button-group.tsx`、`app/src/components/ui/sidebar.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/sheet.tsx`：引用痕迹见 `app/index.html`、`app/info.md`、`app/src/components/ui/README.md`、`app/src/components/ui/sidebar.tsx`、`app/src/index.css`；静态未使用不等于可删除。
- `app/src/components/ui/sidebar-context.ts`：引用痕迹见 `app/src/components/ui/README.md`、`app/src/components/ui/sidebar.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/sidebar.tsx`：引用痕迹见 `app/info.md`、`app/src/components/ui/README.md`、`app/src/index.css`、`app/tailwind.config.js`、`docs/guides/E_INTEGRATION_VERIFICATION.md`；静态未使用不等于可删除。
- `app/src/components/ui/skeleton.tsx`：引用痕迹见 `app/info.md`、`app/src/components/ui/README.md`、`app/src/components/ui/sidebar.tsx`、`docs/research/analysis/agent_canvas_dim04.md`；静态未使用不等于可删除。
- `app/src/components/ui/toggle-group.tsx`：引用痕迹见 `app/info.md`、`app/package.json`、`app/src/components/ui/README.md`；静态未使用不等于可删除。
- `app/src/components/ui/toggle-variants.ts`：引用痕迹见 `app/src/components/ui/README.md`、`app/src/components/ui/toggle-group.tsx`、`app/src/components/ui/toggle.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/toggle.tsx`：引用痕迹见 `app/info.md`、`app/package.json`、`app/src/components/ui/README.md`、`app/src/components/ui/sidebar-context.ts`、`app/src/components/ui/sidebar.tsx`；静态未使用不等于可删除。
- `app/src/components/ui/tooltip.tsx`：引用痕迹见 `app/info.md`、`app/package.json`、`app/src/components/ui/README.md`、`app/src/components/ui/sidebar.tsx`、`app/src/pages/canvas/ApprovalModeControl.tsx`；静态未使用不等于可删除。
- `app/src/pages/canvas/EApprovalCard.tsx`：引用痕迹见 `docs/chat-experience.md`；静态未使用不等于可删除。
- `app/src/pages/canvas/collaboration-demo/model.ts`：引用痕迹见 `app/api/coordinator.ts`、`app/api/e/approval-reviewer.ts`、`app/api/e/config.ts`、`app/api/e/contracts.ts`、`app/api/e/session-manager.ts`；静态未使用不等于可删除。

## 循环依赖

规定命令 `npx -y knip@5 --reporter json --include files,exports,cycles` 返回 `Invalid issue type: cycles`。死文件/导出改用支持的 `files,exports`；循环使用 oxc 导入图上的 Tarjan 强连通分量复核，不把命令失败当作零循环。

本次静态图没有多节点循环分量或自环。模板字符串动态导入不在此结论范围内。

## 高危热点

按 `git log --since="12 months ago" --name-only --pretty=format:` 的改动次数乘当前行数排序；这是审查优先级信号，不是已确认缺陷。

| 文件 | 12 个月改动次数 | 行数 | 乘积 |
| --- | ---: | ---: | ---: |
| `app/src/components/ui/sidebar.tsx` | 1 | 705 | 705 |
| `app/src/pages/canvas/mock-server.ts` | 1 | 640 | 640 |
| `app/api/coordinator.ts` | 1 | 617 | 617 |
| `app/src/pages/canvas/index.tsx` | 1 | 610 | 610 |
| `app/api/routes.ts` | 1 | 507 | 507 |
| `app/src/pages/reactflow/index.tsx` | 1 | 475 | 475 |
| `app/src/pages/canvas/live-store.ts` | 1 | 469 | 469 |
| `app/api/herdr-adapter.ts` | 1 | 421 | 421 |
| `app/src/pages/tldraw/EdgesLayer.tsx` | 1 | 385 | 385 |
| `app/src/pages/canvas/LiveTerminal.tsx` | 1 | 325 | 325 |

## 断点

oxc 未报告解析失败或无法解析的相对导入。别名按 tsconfig 自动解析；依赖包与仓库外 ADE 路径不当作仓内断链。

模板字符串动态导入对静态解析不可见（不进 imports 也不进 unresolved），靠死文件复核与边界回报兜底。

零入度文件的逐项裁决见[入口对账](entrypoints.md)，人工 Review 见[代码审查](review.md)。
