# Agent Canvas 中 Agent 节点（Agent Runtime）可视化方式调研报告

## Executive Summary
### 核心结论
#### 三态展示（全局摘要/默认内嵌活窗/专注全屏）是行业空档，可映射为成熟的 Semantic Zoom/LOD 体系，差异化成立[^1^]
#### 「对话流+操作画面」双窗格、事件流重建回放、Plan/Todo 一等公民、过程透明建立信任是四条已被反复验证的行业共识[^2^]
#### 建议架构主线：统一事件溯源（append-only agent 事件流）+ 三类节点三种投影 + substrate 持久化，实时与回放同构[^3^]

## 1. 行业现状与竞品图谱（约 2500 字，2 个表格）
### 1.1 双谱系：编排画布与 agent 工作台
#### 1.1.1 编排画布谱系（LangGraph Studio/Dify/Coze/n8n/Flowise/Langflow/ComfyUI）以「画布=执行视图」建立信任：执行路径高亮、节点状态标记是全员标配[^4^]
#### 1.1.2 工作台谱系（Devin/Manus/Kimi OK Computer/ChatGPT agent/OpenHands）收敛于「对话流+计算机画面」双窗格结构[^5^]
#### 1.1.3 节点信息展示现状：图标/标题/端口/状态为基线，token/耗时仅头部产品做到 on-canvas 展示，产物内联预览以 ComfyUI 为标杆[^6^]
### 1.2 执行可视化的能力梯度与共识
#### 1.2.1 节点状态六态模型（running/completed/failed/waiting/skipped/queued）与「skipped 必须区别于未到达」的行业教训[^7^]
#### 1.2.2 单节点调试能力梯度：LangGraph Studio time-travel > Dify 1.5.0 变量监视器 > n8n pin data > Coze > Flowise/Langflow[^8^]
### 1.3 现有产品的系统性短板（机会窗口）
#### 1.3.1 大图集体崩坏：Flowise/Langflow/ComfyUI 的规模失控与 n8n 执行可视化回归 bug 频发[^9^]
#### 1.3.2 多模块对应关系不清晰、结果呈现割裂、版本管理缺失是工作台谱系的公认痛点[^10^]
#### 1.3.3 语义缩放/三级展示态在主流 agent 画布中完全缺位（表格：9 款产品能力速查）[^11^]

## 2. 节点三态展示的信息架构（约 2500 字，2 个表格）
### 2.1 三态的本质：信息密度 × 交互权限的二维矩阵
#### 2.1.1 全局=零交互只读聚合、默认=观察权（pointer-events 隔离）、专注=交互权移交（annotation 写入/VNC 接管/approval 签发）[^12^]
#### 2.1.2 状态机设计：展示密度与交互权限正交建模，进入专注=视觉全屏化+权限申请，退出双回收[^13^]
### 2.2 全局模式与默认模式：Semantic Zoom/LOD 的成熟技术储备
#### 2.2.1 按「节点屏幕像素尺寸」阈值切换详略（tldraw 模式），zoom 值防抖，集中式 ViewModeManager 统一下发档位[^14^]
#### 2.2.2 全局模式内容：harness/env/agent id/标题 + 六态状态徽章 + 最近产物快照（飞行记录器模式）[^15^]
#### 2.2.3 活节点配额与降级阶梯：全帧流→低帧流→心跳帧→快照；浏览器对隐藏 iframe 的冻结与 GPU 合成开销是硬约束[^16^]
### 2.3 专注模式：全屏化的工程铁律
#### 2.3.1 移动 DOM 节点不重挂载（remount 导致 iframe reload/WebRTC 断流/终端会话丢失）[^17^]
#### 2.3.2 真实宽高布局避免 CSS scale 放大模糊；焦点仲裁（滚轮/键盘归属）需显式设计[^18^]
### 2.4 状态可见性的冗余编码原则
#### 2.4.1 颜色+图标+文本+动画多通道冗余；n8n 回归 bug 与「小红点找不到错误」的反面教训[^19^]
#### 2.4.2 长耗时节点必须显示 elapsed time 与进度，而非裸 spinner（ComfyUI「40 秒无反馈像死机」教训）[^20^]

## 3. 产物实时可视化节点（约 2500 字，1 个表格）
### 3.1 流式增量渲染的技术路线
#### 3.1.1 编辑粒度按产物大小路由：约 400 行实证分界，小产物全量重写、大产物 diff；fast-apply 两段式（规划/应用分离）[^21^]
#### 3.1.2 「每步可见」的最优解是结构化增量+容错解析（Streamdown 未闭合块补全、增量高亮），朴素打字机会卡死渲染线程[^22^]
#### 3.1.3 非代码产物（PPT/文档/表格）走「结构化数据流→声明式渲染」，slide/card 为天然增量单元；Live preview 开关[^23^]
### 3.2 渲染沙盒
#### 3.2.1 iframe（跨源+sandbox 属性+严格 CSP）是行业默认；单文件用 srcdoc/子域，多文件全栈才上 WebContainer[^24^]
#### 3.2.2 安全基线：sandbox 逐服务白名单、禁 srcdoc 拼接用户输入（Excalidraw CVE-2024-32472 教训）[^25^]
### 3.3 版本管理与 annotation 交互
#### 3.3.1 版本浏览默认线性链（版本选择器/后退按钮），自动快照+命名里程碑双层，旧版本编辑产生分支而非覆盖[^26^]
#### 3.3.2 diff 按产物分层：文本 tracked-changes、代码 unified/split、可视化产物 side-by-side/wipe/onion/pixel-diff 四模式[^27^]
#### 3.3.3 Annotation 结构化回传（selector+bbox+intent+status），「先指后说」；评论（临时）与标注（永久）分态、@agent 转指令[^28^]
#### 3.3.4 人机并发防护：pending 临时态不落盘、区域锁可见、冲突高亮裁决；AI 内容永不静默覆盖[^29^]

## 4. 操作可视化节点（约 2500 字，2 个表格）
### 4.1 实时画面流方案选型
#### 4.1.1 MVP 标准答案：noVNC+websockify+x11vnc/Xvfb（Anthropic/E2B/Selenium/Browser Use 四方验证），升级路径 KasmVNC[^30^]
#### 4.1.2 场景路由：公网多人围观上 WebRTC（借道 mediamtx）；节点轻量预览用 CDP screencast（~5fps 上限）；回放审计用 DOM 重建（表格：四方案延迟/带宽/画质/成本对比）[^31^]
### 4.2 Watch ↔ Takeover 控制权切换
#### 4.2.1 三段式：同一会话+view_only 开关+应用层控制权令牌；takeover 期间 agent 操作硬性失败不夺回[^32^]
#### 4.2.2 凭证隐私：接管期间停止截图与录屏（OpenAI Operator 范式），会话 handoff 不重启浏览器[^33^]
#### 4.2.3 辅助认证/登录：凭证不进 agent 环境（sensitive_data placeholder），cookie 归还后保留[^34^]
### 4.3 终端任务与历史回放
#### 4.3.1 实时终端：xterm.js+WebSocket 事实标准（ttyd 单二进制），延迟≈WS RTT[^35^]
#### 4.3.2 回放格式：asciinema 字符流（体积 1/100~1/1000、可复制可搜索）与 rrweb 快照+增量互补；回放=实时管道旁路 tap[^36^]
#### 4.3.3 Playwright trace viewer 范式：动作时间轴+每步 before/after 状态对+自包含工件；agent 轨迹回放（OpenHands/SWE-agent inspector）[^37^]
#### 4.3.4 Time travel 三档实现：快照还原查看→checkpoint 重放→全量环境 checkpoint，按价值密度递进[^38^]

## 5. 通用 Agent 节点与根 Coordinator（约 2000 字，1 个表格）
### 5.1 对话流的信息层级
#### 5.1.1 渐进式披露三层：答复永显→步骤摘要默认折叠→完整 trace 深层开关[^39^]
#### 5.1.2 工具调用按类型定制渲染（Edit→diff、Grep→高亮、Bash→命令/输出分离），四种状态显式设计[^40^]
#### 5.1.3 噪音自动折叠+阈值可配置；步骤文案用动宾短语用户语言；动画编码系统状态[^41^]
### 5.2 常驻元素
#### 5.2.1 Plan/Todo 吸附式外显（sticky 面板），实时勾选高亮当前项[^42^]
#### 5.2.2 状态栏惯例：模型|上下文%|成本$|耗时|权限模式（Claude Code statusLine 生态）[^43^]
#### 5.2.3 中断分级：排队纠偏（Enter）vs 立即中断（Esc）vs 检查点回滚（Esc Esc）；中断成本须低于撤销成本[^44^]
### 5.3 Coordinator 节点的汇报范式
#### 5.3.1 子任务=折叠委派卡片（名称+描述+状态），展开为嵌套对话流；并行子 agent 面板聚合[^45^]
#### 5.3.2 对话委派卡片与画布子节点双向锚定：点卡片飞向节点、点节点定位对话段落（双生视图）[^46^]

## 6. 图编排与强弱链接语义（约 2000 字，1 个表格）
### 6.1 边的视觉编码
#### 6.1.1 实线=强/事务、虚线=弱/通信成立（BPMN 消息流/UML dependency 同构），但业界惯例分裂，必须内置图例[^47^]
#### 6.1.2 双通道冗余编码：颜色+线宽+端口形状（Unreal Blueprint 执行线/数据线范式）[^48^]
### 6.2 运行态可视化
#### 6.2.1 边上动画仅运行态开启：沿路径粒子而非 dasharray 滚动（性能边界），reduced-motion 降级[^49^]
#### 6.2.2 虚线弱链接升级为可观测数据面：消息速率、产物版本引用、滞后告警、点击打开消息 trace 泳道时间轴[^50^]
#### 6.2.3 Factorio 心智的取舍：要速率/瓶颈/吞吐量的一阶可视化，不要物理布局导致的重构成本[^51^]
### 6.3 层级与聚合
#### 6.3.1 子图折叠（ComfyUI Collapse to Subgraph 范式）+折叠节点聚合状态徽章[^52^]
#### 6.3.2 循环用容器节点内嵌子图而非回边（Dify/Coze 主流解），条件分支出口内联标签[^53^]

## 7. 底层架构：事件溯源、trace 数据模型与 substrate 可视化（约 2500 字，2 个表格）
### 7.1 统一事件溯源：一条事件流，三种投影
#### 7.1.1 三类节点共享 append-only agent 事件流，各自投影（产物快照序列/环境画面/消息序列），实时与回放同构[^54^]
#### 7.1.2 数据模型对齐 OTel GenAI：invoke_agent 根 span，chat/execute_tool 同级子 span（tool 不嵌入 LLM span）[^55^]
### 7.2 节点信息设计：展示「绑定」而非「副本」
#### 7.2.1 节点头=AgentCard 子集（agent id/harness/版本）+env 生命周期态+substrate 同步状态（K8s conditions 数组模式）[^56^]
#### 7.2.2 NervaFS 四对象（Agent Volume/Namespace Contract/Runtime Binding/Provider Adapters）与八 namespace 映射到节点信息架构[^57^]
#### 7.2.3 「谁在写」的可视化：audit 事件流反推 + awareness 式 presence 组合[^58^]
#### 7.2.4 凭证只展示引用元信息（来源/scope/轮换时间），值级遮罩，denied 事件标红[^59^]
### 7.3 画布技术选型与性能预算
#### 7.3.1 DOM 渲染架构是唯一可行路线：React Flow（MIT/生态）vs tldraw SDK（LOD/embed/协作最全，许可待核对）（表格：7 框架对比）[^60^]
#### 7.3.2 性能分档与三件套：虚拟化+LOD+活内容降级；ComfyUI DOM 化翻车（60→<5FPS）的警示[^61^]
#### 7.3.3 画布基础设施：Canvas 像素 minimap、60fps 合批 presence、深缩放 minZoom 配置[^62^]

## 8. 落地建议、决策点与未决问题（约 1500 字，1 个表格）
### 8.1 分阶段落地路线
#### 8.1.1 MVP：DOM 画布+三态 LOD+noVNC 操作窗+产物 iframe 预览+事件流埋点
#### 8.1.2 进阶：事件流回放时间轴、annotation 管线、审批 Inbox、活节点配额调度
#### 8.1.3 差异化：弱链接数据面、知识沉淀管线、time travel、多人协作
### 8.2 关键决策点（表格：决策项/选项/建议）
#### 8.2.1 React Flow vs tldraw：原型期双轨验证，许可与嵌入自由度权衡
#### 8.2.2 活内容上限策略、审批超时默认策略、回放存储格式
### 8.3 未决问题
#### 8.3.1 NervaFS 跨机实时同步协议未披露（M1 为 local-first+bundle handover）
#### 8.3.2 凭证是否 NervaFS 一等 namespace；多人审批 claim/lock 机制无开源先例；PPT 结构 diff 资料稀缺

# References
## agent_canvas_dim01.md ~ agent_canvas_dim12.md
- **Type**: 分维度调研证据文件（12 个）
- **Description**: 竞品、画布技术、产物渲染、版本标注、画面流、终端回放、HITL、对话 UX、图语义、可观测性、substrate
- **Path**: /mnt/agents/output/research/

## agent_canvas_cross_verification.md
- **Type**: 交叉验证
- **Description**: 置信度分级、冲突区消解、未决问题
- **Path**: /mnt/agents/output/research/agent_canvas_cross_verification.md

## agent_canvas_insight.md
- **Type**: 跨维度洞察
- **Description**: 7 条核心洞察（事件流三投影、二维矩阵、冗余编码、弱链接数据面、知识管线、活节点配额、双生视图）
- **Path**: /mnt/agents/output/research/agent_canvas_insight.md

## agent_canvas.agent.outline.md
- **Type**: 报告大纲
- **Description**: 本文件
- **Path**: /mnt/agents/output/agent_canvas.agent.outline.md
