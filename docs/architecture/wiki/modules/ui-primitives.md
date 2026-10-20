---
title: UI 基础组件
description: 区分产品在用的基础交互与受保护的未提交控件。
sources:
  - app/src/components/ui/button.tsx bee89f17a67d Button
  - app/src/components/ui/button-variants.ts b2018207499f buttonVariants
  - app/src/components/ui/switch.tsx 6a2b5241d8c0 Switch
  - app/src/components/ui/form.tsx b52dfacdeae5 Form FormField
  - app/src/components/ui/sidebar.tsx 86c5b01b9891 SidebarProvider Sidebar
  - app/src/components/ui/sonner.tsx 7c5672d5f3fd Toaster
  - app/src/components/ui/README.md 5578ebc47e52
  - app/components.json 411f77047b2c
covers:
  - app/src/components/ui/
---

# UI 基础组件

## 职责

提供不含会话业务的基础交互。产品当前使用按钮、开关与通知，其余保留控件尚未接入。
保留未接入控件不是能力承诺，而是保护原有未提交修改及其依赖。

本轮清理了 34 个无未提交改动、无产品入口、也不被保留代码依赖的文件。
目录中仍有超过 20 个文件，是因为侧栏、表单及样式变体的未完成工作没有被删除或强行接入。

## 对外接口

| 接口 | 定义位置 | 当前使用 |
| --- | --- | --- |
| `Button`、`buttonVariants` | `button.tsx`、`button-variants.ts` | 工作区首页、原型入口、共享聊天与旧版审批 |
| `Switch` | `switch.tsx` | 共享连线图例 |
| `Toaster` | `sonner.tsx` | 产品画布、React Flow 与 tldraw 原型 |
| `Form`、`FormField` | `form.tsx`、`form-context.ts` | 尚未接入；保留字段上下文拆分 |
| `SidebarProvider`、`Sidebar` | `sidebar.tsx`、`sidebar-context.ts` | 尚未接入；保留上下文拆分与确定性占位宽度 |

以上文件位于 `app/src/components/ui/`。职责索引在同目录 `README.md`。
`app/components.json` 只是组件生成配置，不会把整个目录注册为运行入口。

## 数据怎么流

产品页面把状态与事件回调传给按钮和开关，再由页面处理业务请求。通知容器读取主题并设置通知颜色，不参与会话管理或网络请求。

保留的表单和侧栏内部仍有相互依赖，但没有产品调用路径。保留干净的标签、输入、分隔线、抽屉、占位、提示和移动端判断，是为了不让未提交组件出现断链，不是为它们新增使用场景。

## 改动指南

- 基础控件不得依赖工作区 store 或会话合同；业务条件由上层传入。
- 按钮样式仍集中在 `button-variants.ts`，不要恢复重复导出以绕过现有拆分。
- 不要按 Knip 文件名单直接删除保留依赖。先检查所有未提交根节点，再求传递依赖闭包。
- 需要使用未接入的表单或侧栏时，补实际消费入口和针对性测试；不要单靠测试 import 降低未使用计数。
- 不批量生成无需求的控件，也不靠新增 ignore 或移动到扫描范围外隐藏候选。
- 完整的 59 项证据与保护原因见[未使用文件复核](../unused-files.md)，实时结果见[体检报告](../health.md)。样式约束见[浏览器入口](frontend-shell.md)。
