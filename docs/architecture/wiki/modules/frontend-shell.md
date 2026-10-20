---
title: 浏览器入口与工作区
description: 页面路由、工作区首页、主题和前端构建配置。
sources:
  - app/src/main.tsx be1df370b3d8 createRoot BrowserRouter
  - app/src/App.tsx 10682b846ed7 App
  - app/src/pages/home/index.tsx 4ca46119c6b9 HomePage WorkspaceCard
  - app/src/pages/home/CreateSessionForm.tsx 5a3183cc3eb9 CreateSessionForm
  - app/src/theme/ThemeProvider.tsx ebbfcb273a1c ThemeProvider
  - app/src/index.css 41d59ac8e5b6
  - app/vite.config.ts cf1d2d5a5f57 apiPort
  - app/src/lib/utils.ts bd0c391ddd10 cn
covers:
  - app/src/App.tsx
  - app/src/main.tsx
  - app/src/index.css
  - app/src/pages/home/
  - app/src/theme/
  - app/src/lib/
  - app/index.html
  - app/vite.config.ts
  - app/tsconfig.app.json
  - app/tsconfig.node.json
  - app/tailwind.config.js
  - app/postcss.config.js
  - app/components.json
---

## 职责

提供浏览器应用的入口和工作区首页。用户在首页查看真实会话、示例或已归档工作区，也可以创建工作区并启动一个 e 会话，再进入画布。主题、通用样式与开发代理在这一层统一配置。

## 对外接口

`app/src/main.tsx` 在根元素挂载 `ThemeProvider` 和 `BrowserRouter`，`app/src/App.tsx` 注册以下路由：

| 路径 | 组件 | 行为 |
| --- | --- | --- |
| `/` | `HomePage` | 工作区列表与创建会话表单。 |
| `/welcome` | `PocLanding` | 原型对比落地页。 |
| `/react-flow` | `ReactFlowPage` | React Flow 本地演示。 |
| `/tldraw` | `TldrawPage` | tldraw 本地演示。 |
| `/canvas` | `CanvasRedirect` | 定位活跃工作区。 |
| `/canvas/:workspaceId` | `CanvasPage` | 指定工作区实时画布。 |

`HomePage` 位于 `app/src/pages/home/index.tsx`，列表读取复用 `live-store.ts` 的 `fetchWorkspaces`。`CreateSessionForm` 位于同目录，调用运行环境探测、工作区创建和会话创建端点。

`ThemeProvider`（`app/src/theme/ThemeProvider.tsx`）使用 `next-themes`，通过根元素 class 切换主题，存储键是 `agent-canvas-theme`，默认跟随系统。`cn`（`app/src/lib/utils.ts`）合并类名。旧侧栏专用的 `useIsMobile` 随未接入组件一起删除，产品布局继续由各界面的响应式规则处理。

`App` 在全局配色容器内提供卡片视图入口的挂载槽；仅主画布页面挂入该入口，其他页面保持原来的配色控制。入口与配色一起在浮层/全屏期间可访问，不进入聊天消息内容或运行器配置。

## 数据怎么流

首页先读取工作区列表，按后端类型、来源和项目路径分组，组内按最近活跃时间排序。卡片显示轻量图预览，点击后在新标签页打开对应画布。地址中的视图参数决定读取普通列表、归档列表还是示例列表。

新建表单先探测本机运行环境及可用模型。用户提交后，先创建工作区，再在其中创建 e 会话，两次请求成功才跳转。第二步失败时保留已创建工作区标识，提供打开失败会话的入口；它不是一个原子事务。

重命名和归档在首页直接提交工作区更新请求，成功后刷新列表。归档前明确提示会停止该工作区的 Agent 并保留历史。列表加载失败会展示错误，只有明确的演示参数允许本地示例回退。

开发环境下，浏览器仍请求同源 API 和 WebSocket，Vite 把它们转发到本机后端。默认前端端口为 5173，后端代理端口为 3000，可分别通过环境变量覆盖。应用资源从根路径加载，避免深层画布地址刷新时错找静态资源。

## 改动指南

- 路由事实以 `App.tsx` 为准，部分历史组件注释仍把原型落地页写成首页。文档网站的 Landing Page 不应覆盖运行应用的工作区首页。
- 首页读取在 `home/index.tsx`，创建事务在 `CreateSessionForm.tsx`。调整创建流程时保留部分成功后的恢复入口，不能只给出泛化错误。
- 前后端开发代理见 `app/vite.config.ts`，变量为 `CANVAS_UI_PORT` 和 `API_PORT`。不要在页面中硬编码另一端口，否则会绕过同源代理。
- 全局颜色与尺寸令牌在 `app/src/index.css`，Tailwind 映射在 `app/tailwind.config.js`。主题改变还会影响共享组件、终端和 tldraw，需分别检查。
- 基础组件与共享显示层分别见[UI 基础组件](ui-primitives.md)和[画布原型与共享呈现](prototypes.md)。
