# Plan: Agent Canvas 节点（Agent Runtime）可视化方式调研

## 背景
用户在设计一款 agent canvas 产品：无限画布（类异星工厂）编排多 agent。
- Agent 构成：harness（LLM provider + reasoning + tool 编排）/ env（sandbox、VM、物理机）/ substrate（nervafs.xyz 分布式文件系统，同步身份、记忆、技能、知识、工具配置、凭证）
- 三类任务 → 三类节点：产物构建（MD/HTML/PPT 实时产物可视化+版本）、执行操作（computer use/browser use/CLI，VNC/WebRTC/ttyd 实时画面+回放）、通用分析/Coding（TUI/结构化 chat）
- 编排：根节点 Coordinator Agent + 子节点图，实线=强事务依赖，虚线=通信/产物弱依赖
- 节点三态：全局模式（摘要节点）、默认模式（内嵌执行窗口）、专注模式（全屏交互：annotation / 辅助认证 / approval）

## Stage 1 — 调研（加载 deep-research-swarm）
多角度并行调研：
1. 现有 agent 编排/可视化产品：LangGraph Studio、Flowise、Dify、n8n、ComfyUI、AutoGen Studio、CrewAI、Devin/Manus 等 agent 工作台的 UI 范式
2. 无限画布/节点图 UI 技术：React Flow / tldraw / Excalidraw / LiteGraph，节点缩略态-详情态-全屏态的多层级渲染（semantic zoom），性能优化
3. 产物实时可视化：artifact 预览（Claude Artifacts、v0、OpenAI Canvas）、流式增量渲染、版本时间线/diff、annotation 交互
4. 操作可视化：VNC / noVNC、WebRTC 低延迟流、ttyd/asciinema 终端回放、computer-use 操作回放（OSWorld 等）、远程协助/接管交互
5. 通用对话节点：TUI（如 Claude Code、Aider）与结构化 chat（tool call 折叠、reasoning 展示、approval 中断）的 UX 模式
6. 多 agent 图编排可视化：依赖边语义（强/弱链接）、数据流 vs 控制流、 Factorio/游戏化类比（Satisfactory、Node-based automation）

输出：交叉验证的调研简报（research briefs），供 Stage 2 使用。

## Stage 2 — 综合写作（加载 report-writing）
将调研结论与用户的五点设计映射，产出结构化调研报告：
- 行业现状与竞品图谱
- 三类节点的可视化方案选型（含技术栈对比、交互模式、风险）
- 三态展示（全局/默认/专注）的设计模式参考
- 图编排（边语义、Coordinator 发散）的可视化参考
- 落地建议
输出：.agent.final.md

## Stage 3 — 格式交付（加载 docx）
转换为 Word 文档交付（.md + .docx）。
