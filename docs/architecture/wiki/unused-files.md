---
title: 未使用文件复核
description: 先保存未提交工作，再删除确认无入口的源码、依赖和过时模板；逐项证据可回溯。
sources:
  - docs/architecture/unused-file-review.json 9258143a8e36
  - app/src/App.tsx 10682b846ed7
  - app/components.json 411f77047b2c
---

# 未使用文件复核

## 两阶段清理

2026-10-19 首次复核 59 个 Knip 候选：删除 34 个干净文件，暂时保护 18 个未提交文件与 7 个依赖。用户随后明确授权提交并清理过时内容。2026-10-20 先将完整已验证工作保存至 `a1858ae`，再删除剩余 25 个无入口源码（2261 行），另移除过时 `app/info.md`、Node 20 Dockerfile 和其 .dockerignore。

## 判断依据

- 重新运行 Knip，并核对当前 oxc 导入图：25 文件组成的移除闭包没有来自集合外的导入。
- 检查实际路由、动态 worker/扩展、脚本命令、测试与配置。字符串命中研究正文、CSS 通用名称不算运行消费者。
- 删除前核对 SHA-256 和快照提交的原始内容；任何并行改动都会停止删除。
- `unused-file-review.json` 保留每个路径、摘要、引用证据，以及前一次保护决定；人工记录不是静态扫描豁免。
- 依赖只删除已无导入/配置使用者的直接声明；不批量升级在用依赖，也不裁剪日常服务的 node_modules。使用独立干净安装验证锁文件和构建。

## 明确保留

按钮/开关/通知、两个有路由的画布原型、Herdr 兼容后端、私有运行时入口、独立协作 Skill、只读检查器和新离线量化示例都有用途，均保留。历史研究与验收保留。没有删除用户会话、认证、全局配置、工作树或分支。

当前组件入口见 [UI 基础组件](modules/ui-primitives.md)，实时扫描见 [代码体检](health.md)。需要找回已保存源码时可只读查看 `git show a1858ae:<原路径>`，不必回退其他实现。

## 逐项结论

| 文件 | 裁决 | 依据 |
| --- | --- | --- |
| `app/src/components/ui/accordion.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/alert-dialog.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/alert.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/aspect-ratio.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/avatar.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/badge-variants.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/badge.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/breadcrumb.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/button-group-variants.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/button-group.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/calendar.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/card.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/carousel.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/chart.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/checkbox.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/collapsible.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/command.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/context-menu.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/dialog.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/drawer.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/dropdown-menu.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/empty.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/field.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/form-context.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/form.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/hover-card.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/input-group.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/input-otp.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/input.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/item.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/kbd.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/label.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/menubar.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/navigation-menu-variants.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/navigation-menu.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/pagination.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/popover.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/progress.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/radio-group.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/resizable.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/scroll-area.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/select.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/separator.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/sheet.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/sidebar-context.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/sidebar.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/skeleton.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/slider.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/spinner.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/table.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/tabs.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/textarea.tsx` | 删除 | 首次复核已删除（干净、未使用） |
| `app/src/components/ui/toggle-group.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/toggle-variants.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/toggle.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/components/ui/tooltip.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/hooks/use-mobile.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/pages/canvas/EApprovalCard.tsx` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/src/pages/canvas/collaboration-demo/model.ts` | 删除 | 保存至 a1858ae 后删除；依赖闭包无外部入口 |
| `app/info.md` | 删除 | Outdated generated scaffold inventory and machine path; superseded by app/README.md |
| `app/Dockerfile` | 删除 | Unreferenced Node 20 container template does not provide the current e/Pi runtime; supported startup uses dev:e/start:e |
| `app/.dockerignore` | 删除 | Only paired with the removed, unsupported container template |
