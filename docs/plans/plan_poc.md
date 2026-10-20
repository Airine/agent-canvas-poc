# Plan: Agent Canvas PoC × 2（React Flow / tldraw）

## 目标
用同一套设计 + 同一套 mock 数据，分别基于 React Flow 与 tldraw 实现 agent canvas PoC，验证报告核心结论：
1. 三态展示：全局模式（摘要卡：标题/harness/env/agent id/六态徽章）→ 默认模式（卡片+内嵌活窗）→ 专注模式（全屏交互，DOM 搬迁不 remount）
2. 三类节点：产物实时可视化（流式增量渲染+版本切换）、操作可视化（模拟终端/画面流+回放时间轴）、通用对话（tool call 折叠+todo 吸附+approval）
3. 图编排：Coordinator 根节点发散子节点；实线=强依赖、虚线=弱链接（运行态粒子动画）
4. zoom 阈值 LOD 切换（按节点屏幕像素尺寸）
5. mock agent 事件流驱动（模拟实时执行 + 可回放）

## 交付形态
一个 Vite+React+TS 静态站点，三个路由：
- `/` 对比首页（决策点摘要 + 双入口）
- `/react-flow` React Flow 版 PoC
- `/tldraw` tldraw 版 PoC
共享：mock 事件流引擎、节点内容组件（ArtifactView/TerminalView/ChatView）、配色与样式。

## Stage 1 — 脚手架与共享层（加载 vibecoding-webapp-swarm）
- Vite + React + TS + Tailwind + shadcn 项目初始化
- mock agent 事件流（append-only 事件序列 + 播放/暂停/seek）
- 三类节点内容组件（产物/终端/对话）

## Stage 2 — 双实现（并行 2 个 coder 子 agent，不同 worktree/目录）
- impl-reactflow/：React Flow 自定义节点 + onlyRenderVisibleElements + zoom LOD + nodrag 交互
- impl-tldraw/：tldraw 自定义 shape + embed 交互模型（单击选中/双击交互）+ getEfficientZoomLevel
- 各自实现三态切换与全屏专注（DOM 搬迁）

## Stage 3 — 集成与验证
- 合并为单站点双路由，构建，检查截图
- website_version_manager build_version 交付
