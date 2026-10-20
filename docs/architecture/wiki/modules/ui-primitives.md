---
title: UI 基础组件
description: 产品在用的按钮、开关和通知，以及按实际入口维护组件的规则。
sources:
  - app/src/components/ui/button.tsx bee89f17a67d Button
  - app/src/components/ui/button-variants.ts b2018207499f buttonVariants
  - app/src/components/ui/switch.tsx 6a2b5241d8c0 Switch
  - app/src/components/ui/sonner.tsx 7c5672d5f3fd Toaster
  - app/src/components/ui/README.md 04977d6b9865
  - app/components.json 411f77047b2c
covers:
  - app/src/components/ui/
---

# UI 基础组件

## 职责

提供不含会话业务的按钮、开关与通知。早期先清理了 34 个干净的未接入控件；用户随后授权清理全部过时内容，剩余未提交组件先存入 `a1858ae`，再连同仅被它们依赖的文件一起删除。没有把未接入组件改造成虚假的入口。

## 对外接口

| 接口 | 定义位置 | 当前使用 |
| --- | --- | --- |
| `Button`、`buttonVariants` | `button.tsx`、`button-variants.ts` | 工作区首页、原型入口、共享聊天与旧版审批 |
| `Switch` | `switch.tsx` | 共享连线图例 |
| `Toaster` | `sonner.tsx` | 产品画布、React Flow 与 tldraw 原型 |

以上文件位于 `app/src/components/ui/`。职责索引在同目录 `README.md`。
`app/components.json` 只是组件生成配置，不会把整个目录注册为运行入口。

## 数据怎么流

产品页面把状态与事件回调传给按钮和开关，再由页面处理业务请求。通知容器读取主题并设置通知颜色，不参与会话管理或网络请求。

清理使用完整依赖闭包：没有剩余源码导入被删组件，按钮、样式变体、开关与通知的实际消费路径保持不变。

## 改动指南

- 基础控件不得依赖工作区 store 或会话合同；业务条件由上层传入。
- 按钮样式仍集中在 `button-variants.ts`，不要恢复重复导出以绕过现有拆分。
- 不要按 Knip 名单直接删除文件。先检查动态入口与外部消费者，再计算完整依赖闭包；未提交内容先保留在可追踪提交中。
- 新增组件需要实际消费入口和针对性测试；不要单靠测试 import 降低未使用计数。
- 不批量生成无需求的控件，也不靠新增 ignore 或移动到扫描范围外隐藏候选。
- 逐项历史保护与后续删除证据见[未使用文件复核](../unused-files.md)，实时结果见[体检报告](../health.md)。样式约束见[浏览器入口](frontend-shell.md)。
