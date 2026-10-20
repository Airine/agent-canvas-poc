---
title: 未使用文件复核
description: 59 个候选逐项裁决：删除 34 个干净文件，保护 18 个未提交文件及其 7 个依赖。
sources:
  - docs/architecture/unused-file-review.json 980db61b3b1c
  - app/src/App.tsx 10682b846ed7
  - app/components.json 411f77047b2c
---

# 未使用文件复核

2026-10-19 对上一轮的 59 个 Knip 候选逐项核对。结果是 **34 个删除、18 个保护未提交内容、7 个保护依赖**，不是把 25 个保留文件认定为已经使用。

## 判断依据

- oxc 导入图中，没有从候选集合外部指向这 59 个文件的边。候选之间的内部引用不等于产品入口可达。
- 再核对应用路由、测试、动态导入和组件生成配置。产品中的按钮、开关与通知仍在使用；shadcn 生成配置的路径别名不是自动加载所有组件的入口。
- 文件名搜索会命中研究正文、CSS 和通用词，例如 `chart`、`input`、`select`。这些命中留在原始证据中，不能当成运行引用。
- 删除前再次检查 Git 状态与文件 SHA-256。只删除仍然干净的文件；不重置、不暂存、不覆盖修改版，也不删除新增文件。
- 从所有未提交候选出发计算传递依赖闭包，额外留下 7 个干净依赖。删除集合没有被任何剩余源码导入。
- 原始路径、SHA-256、Git 状态、导入边和字符串引用保存于 `docs/architecture/unused-file-review.json`。体检会检查保留文件的内容、删除文件是否被恢复，以及候选是否已经接入；发生变化就标为需复核或不再未使用，不作为永久豁免。

## 按职责保留

| 职责 | 文件 | 为什么保留 |
| --- | --- | --- |
| 产品基础交互（不在 59 个候选内） | `button.tsx`、`button-variants.ts`、`switch.tsx`、`sonner.tsx` | 页面、边图例和通知有真实调用；保留在通用 UI 目录 |
| 表单与日期（未接入） | `form.tsx`、`form-context.ts`、`calendar.tsx`；依赖 `label.tsx` | 保留已拆分的字段上下文与日期按钮改动 |
| 导航与确认（未接入） | `navigation-menu.tsx`、`navigation-menu-variants.ts`、`pagination.tsx`、`alert-dialog.tsx` | 保留样式变体拆分及对应引用 |
| 控件变体（未接入） | `badge*`、`button-group*`、`toggle*`；依赖 `separator.tsx` | 保留现有未提交的组件／样式拆分 |
| 响应式侧栏（未接入） | `sidebar.tsx`、`sidebar-context.ts`；依赖 `input.tsx`、`separator.tsx`、`sheet.tsx`、`skeleton.tsx`、`tooltip.tsx`、`use-mobile.ts` | 保留上下文拆分和确定性 skeleton 改动；依赖不能单独删除 |
| 审批兼容外观（未接入） | `app/src/pages/canvas/EApprovalCard.tsx` | 新增的兼容转发组件；当前真实聊天直接使用 ApprovalRequest，不制造调用来消除告警 |
| 协作演示模型（未接入） | `app/src/pages/canvas/collaboration-demo/model.ts` | 新增的模拟剧本、状态转换与输出；不是实际多 Agent 编排 |

除完整路径已标出的文件外，UI 文件位于 `app/src/components/ui/`，移动端 hook 位于 `app/src/hooks/`。本轮用职责索引区分已使用与未完成代码，**不为整理外观搬动未提交文件、重写其 import，或隐藏到排除目录**。

## 59 项逐项结论

| 文件 | 裁决 | 源码引用证据（清理前） |
| --- | --- | --- |
| `app/src/components/ui/accordion.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/alert-dialog.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/alert.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/aspect-ratio.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/avatar.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/badge-variants.ts` | 原样保留（未提交改动／新增） | 仓内导入者：`app/src/components/ui/badge.tsx` |
| `app/src/components/ui/badge.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/breadcrumb.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/button-group-variants.ts` | 原样保留（未提交改动／新增） | 仓内导入者：`app/src/components/ui/button-group.tsx` |
| `app/src/components/ui/button-group.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/calendar.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/card.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/carousel.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/chart.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/checkbox.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/collapsible.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/command.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/context-menu.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/dialog.tsx` | 删除（原文件无未提交改动） | 仓内导入者：`app/src/components/ui/command.tsx` |
| `app/src/components/ui/drawer.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/dropdown-menu.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/empty.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/field.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/form-context.ts` | 原样保留（未提交改动／新增） | 仓内导入者：`app/src/components/ui/form.tsx` |
| `app/src/components/ui/form.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/hover-card.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/input-group.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/input-otp.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/input.tsx` | 原样保留（未提交组件的依赖） | 仓内导入者：`app/src/components/ui/input-group.tsx`、`app/src/components/ui/sidebar.tsx` |
| `app/src/components/ui/item.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/kbd.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/label.tsx` | 原样保留（未提交组件的依赖） | 仓内导入者：`app/src/components/ui/field.tsx`、`app/src/components/ui/form.tsx` |
| `app/src/components/ui/menubar.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/navigation-menu-variants.ts` | 原样保留（未提交改动／新增） | 仓内导入者：`app/src/components/ui/navigation-menu.tsx` |
| `app/src/components/ui/navigation-menu.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/pagination.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/popover.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/progress.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/radio-group.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/resizable.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/scroll-area.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/select.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/separator.tsx` | 原样保留（未提交组件的依赖） | 仓内导入者：`app/src/components/ui/button-group.tsx`、`app/src/components/ui/field.tsx`、`app/src/components/ui/item.tsx`、`app/src/components/ui/sidebar.tsx` |
| `app/src/components/ui/sheet.tsx` | 原样保留（未提交组件的依赖） | 仓内导入者：`app/src/components/ui/sidebar.tsx` |
| `app/src/components/ui/sidebar-context.ts` | 原样保留（未提交改动／新增） | 仓内导入者：`app/src/components/ui/sidebar.tsx` |
| `app/src/components/ui/sidebar.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/skeleton.tsx` | 原样保留（未提交组件的依赖） | 仓内导入者：`app/src/components/ui/sidebar.tsx` |
| `app/src/components/ui/slider.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/spinner.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/table.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/tabs.tsx` | 删除（原文件无未提交改动） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/textarea.tsx` | 删除（原文件无未提交改动） | 仓内导入者：`app/src/components/ui/input-group.tsx` |
| `app/src/components/ui/toggle-group.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/toggle-variants.ts` | 原样保留（未提交改动／新增） | 仓内导入者：`app/src/components/ui/toggle-group.tsx`、`app/src/components/ui/toggle.tsx` |
| `app/src/components/ui/toggle.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/components/ui/tooltip.tsx` | 原样保留（未提交组件的依赖） | 仓内导入者：`app/src/components/ui/sidebar.tsx` |
| `app/src/hooks/use-mobile.ts` | 原样保留（未提交组件的依赖） | 仓内导入者：`app/src/components/ui/sidebar.tsx` |
| `app/src/pages/canvas/EApprovalCard.tsx` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |
| `app/src/pages/canvas/collaboration-demo/model.ts` | 原样保留（未提交改动／新增） | 无仓内导入者；产品路由、动态加载与配置中未找到入口 |

## 清理边界

删除 34 个文件，共 3850 行源码，均为未接入的通用控件。没有删改依赖声明和锁文件：其中有未提交工作，也仍支撑保留组件，不能据本次文件清理直接推断某个包可以移除。

保留的 25 个候选继续出现在[体检报告](health.md)，没有新增 Knip ignore 或伪造入口。后续由作者确认未提交组件是否继续开发，再决定接入或删除。职责入口见[UI 基础组件](modules/ui-primitives.md)，目录规则见[目录约定](repository-layout.md)。
