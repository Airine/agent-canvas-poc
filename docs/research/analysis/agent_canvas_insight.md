# Agent Canvas 调研 · Phase 6 跨维度洞察

> 洞察定义：由多个已验证发现交叉推导出的高阶推断，不重复任何单一维度的已有结论。每条标注来源维度与置信度。

---

## Insight 1：「一条事件流，三种投影」——三类节点与实时/回放可以统一在同一个事件溯源架构上
- **Derived from**：dim02（event-stream 架构与事件溯源投影）、dim07（asciinema 3.0 实时管道旁路=录制）、dim11（append-only 是回放地基）、dim12（NervaFS audit 流带 caller/binding/reason）
- **Rationale**：产物构建、操作执行、通用对话表面上是三种 UI，但底层都可以是对同一条 append-only agent 事件流（thought/action/observation/artifact-diff/env-op）的不同投影：产物节点投影 artifact 快照序列、操作节点投影环境画面（VNC 帧 + 终端字符流 + DOM 快照作为富媒体附件）、对话节点投影消息序列。NervaFS 的审计流天然就是这个事件总线。回放 = 同一投影对历史事件区间的重放，因此"实时观看"与"历史回放"不需要两套系统。
- **Implications**：架构上先定义统一事件模型（对齐 OTel GenAI `invoke_agent/chat/execute_tool` + 自定义 artifact/env span），再让三类节点各自订阅投影；substrate 承担事件持久化。这直接降低三类节点的实现重复度，并让"跳到某一步看当时产物/环境状态"（time travel）成为免费能力。
- **Confidence**：high

## Insight 2：三态展示的本质不是"缩放级别"，而是「信息密度 × 交互权限」的二维矩阵
- **Derived from**：dim03（LOD/语义缩放）、dim08（介入三级：插话→接管→approval + 凭证不可见）、dim01（六态节点 overlay + hover 详情）、dim02（watch mode vs takeover 控制权仲裁）
- **Rationale**：全局/默认/专注三态表面是视觉密度递减/递增，但每一态同时隐含交互权限变化：全局=零交互（只读状态聚合）；默认=观察权（看活窗但不操作，pointer-events 隔离）；专注=交互权移交（annotation 写入、VNC 输入接管、approval 决策）。tldraw embed 的"单击选中/双击交互"正是把这条权限边界做成交互显式态的先例。
- **Implications**：状态机设计应把"展示密度"与"交互权限"建模为两个正交维度：专注模式的进入动作 = 视觉全屏化（DOM 搬迁不 remount）+ 交互权限申请（如 VNC view_only 翻转、annotation 写通道打开、审批 token 签发）。退出时两者同时回收。这能避免"放大了却不能操作"或"能操作但凭证泄露"两类事故。
- **Confidence**：high

## Insight 3：信任 = 状态可见性的冗余编码，且执行可视化的回归成本极高
- **Derived from**：dim01（n8n 执行可视化回归 bug 引发 issue 风暴；错误标识太 subtle 是排错首因；六态模型共识）、dim02（过程透明是最大好评点、黑盒是最大吐槽点）、dim09（动画编码系统状态）、dim10（双通道边编码）
- **Rationale**：多个独立维度发现同一规律——用户对 agent 的信任几乎完全来自"什么在跑/什么完了/什么错了"的一瞥可见，且任何状态信号的弱化（小红点→找不到错误节点）或丢失（执行高亮回归）都会立刻引发强烈负面反应。单通道编码（仅颜色或仅线型）在缩放、色盲、大图场景下必然失效。
- **Implications**：节点状态必须默认多通道冗余（颜色 + 图标 + 文本 + 位置/动画），"skipped vs 未到达"必须区分；执行可视化应被当作核心功能做回归测试，而非装饰层。全局模式的聚合状态（子图完成度、瓶颈标记）比单节点状态更需要精心设计。
- **Confidence**：high

## Insight 4：虚线弱链接不应只是视觉装饰，而应升级为「可观测的数据面」——通信速率、产物版本引用、消息 trace 的载体
- **Derived from**：dim10（Factorio 真正价值=速率/瓶颈/吞吐量一阶可视化；BPMN 消息流先例；实时粒子流适合演示、排查靠时间轴回放）、dim11（泳道用于并行 trace 时间重叠；指标三级展示）、dim01（n8n 虚线 ai_tool 承载真实执行语义）
- **Rationale**：用户的"虚线=通信/产物依赖"设计与 BPMN 消息流同构，但 BPMN 只给了静态语义。Factorio 类比的实证教训是：游戏感的价值不在动画而在可验证指标（速率/瓶颈）。n8n 证明边线型可以承载真实执行语义（ai_tool 虚线不能传 item）。
- **Implications**：弱链接边上应可挂动态信息：消息速率（msg/min）、最近消息预览、产物版本引用（artifact v3 → 下游节点）、滞后告警（上游 v5 下游还在消费 v2）。排查模式下点击虚线边打开消息 trace 时间轴（泳道视图）。这让强弱链接之分从"图示规范"变成"调试面"，是画布相对 Dify/n8n 的差异化。
- **Confidence**：high

## Insight 5：Canvas 是「知识生产界面」——annotation/接管/审批记录经 substrate 回写，构成机构记忆的采集管线
- **Derived from**：dim08（Devin Knowledge 反馈→建议→人审→召回；介入记录沉淀）、dim05（annotation envelope：selector+bbox+intent+status 结构化回传；评论@agent 转指令）、dim12（substrate 同步记忆/知识/skills；audit 流）
- **Rationale**：三个维度独立指向同一件事——人工介入不是一次性的救火，而是 agent 系统最稀缺的高质量反馈数据。dim05 给出了标注的结构化格式，dim08 给出了"反馈→知识草稿→人审入库→自动召回"的管线，dim12 给出了跨 env 持久化的 substrate 层。
- **Implications**：专注模式的每类交互都应产出结构化记录：产物 annotation → 修改指令 + 偏好样本；操作接管 → 该站点的登录/操作 runbook 草稿；approval 拒绝 → 风险策略样本。这些记录以"知识草稿"形态进入 substrate 的 knowledge namespace，经人确认后对同一 agent id 的所有 env 生效。这把 canvas 从"监控工具"升级为"agent 能力进化的训练场"，也是 substrate 价值在 UI 层的直接兑现。
- **Confidence**：medium-high（管线各环节均有先例，但作为整体产品形态尚无完整先例）

## Insight 6：「活节点配额 + 降级阶梯」是化解活内容保活与性能矛盾的必然设计
- **Derived from**：dim03（隐藏 iframe 必被冻结；保活 N 个 iframe 有合成开销；ComfyUI GPU 合成器竞争 47%）、dim06（CDP screencast 5fps 适合轻量预览；流分层交付）、dim01（飞行记录器：默认展示上次产物）
- **Rationale**：浏览器对隐藏 iframe 的冻结策略 + 多活窗 GPU 合成开销，决定了"所有节点同时直播"在物理上不可行；而 dim01 证明"展示上次产物"已能满足大部分观察需求。
- **Implications**：需要显式的活内容资源管理：全局模式=静态快照（最近产物缩略图/终端最后 N 行）；默认模式=活窗但限额（如 ≤4 个节点直播，其余 1fps 心跳帧或快照，可手动点亮）；专注模式=全帧率独占。降级阶梯（全帧流 → 低帧流 → 心跳帧 → 快照）应可配置并自动按视口/优先级调度。
- **Confidence**：high

## Insight 7：Coordinator 根节点的对话 UI 与画布图结构互为「双生视图」——子任务卡片 ↔ 子节点的双向锚定
- **Derived from**：dim09（Coordinator 汇报范式=单行委派卡+可展开嵌套树；Manus 三栏 vs Devin work log）、dim02（多模块对应关系不清晰是通病；时间轴 scrubber 同步）、dim10（逻辑流图+trace 回放成熟形态）
- **Rationale**：dim02 证明"模块间对应关系不清晰"是 Manus/Gemini 类产品的公认痛点；dim09 证明 Coordinator 对话流里的子任务呈现已收敛为"委派卡片"范式。在 canvas 里这两个视图天然共存：对话流中的委派卡片应与画布上的子节点共享同一数据源并双向锚定（点卡片飞向节点、点节点定位对话段落）。
- **Implications**：根节点的通用对话窗口中，每个"发起子任务"的消息即子节点的另一投影；边上动画、节点状态徽章同时反映在对话卡片上。这把行业痛点（对应关系不清）转化为 canvas 形态的原生优势。
- **Confidence**：high
