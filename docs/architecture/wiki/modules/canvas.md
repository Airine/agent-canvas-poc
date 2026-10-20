---
title: 实时画布
description: 将工作区图、终端与会话状态投影到可交互画布。
sources:
  - app/src/pages/canvas/GlobalCardViewControl.tsx 5eeacac098c7 GlobalCardViewControl
  - app/src/pages/canvas/CardViewControl.tsx 2a0b6806cfd0 CardViewControl
  - app/src/pages/canvas/ApprovalModeControl.tsx 600aaa3b12e7 ApprovalModeControl
  - app/src/pages/canvas/SessionHeaderActions.tsx ee6d5ea0e0ef SessionHeaderActions
  - app/src/pages/canvas/contracts.ts 572415b9994f
  - app/src/pages/canvas/index.tsx 0c93d9ab6b59 CanvasPage CanvasRedirect computeTiers
  - app/src/pages/canvas/live-store.ts 056a5d79638a LiveStore fetchWorkspaces sessionAction subscribeTerm
  - app/src/pages/canvas/session-store.ts a1af822c02ec SessionStore capabilityAvailable
  - app/src/pages/canvas/LiveNode.tsx 4465d81b5bb1 LiveNode LiveNodeComponent
  - app/src/pages/canvas/LiveTerminal.tsx c93871702251 LiveTerminal EventReplay
  - app/src/pages/canvas/SessionIdentity.tsx ce0ed7d1b0ab SessionIdentity SessionStatus
  - app/src/pages/canvas/RunBar.tsx d2020529a6d3 RunBar
covers:
  - app/src/pages/canvas/GlobalCardViewControl.tsx
  - app/src/pages/canvas/global-card-view.css
  - app/src/pages/canvas/SessionHeaderActions.tsx
  - app/src/pages/canvas/ApprovalCard.tsx
  - app/src/pages/canvas/ApprovalModeControl.tsx
  - app/src/pages/canvas/CardViewControl.tsx
  - app/src/pages/canvas/L0Summary.tsx
  - app/src/pages/canvas/LiveChat.tsx
  - app/src/pages/canvas/LiveEdge.tsx
  - app/src/pages/canvas/LiveNode.tsx
  - app/src/pages/canvas/LiveTerminal.tsx
  - app/src/pages/canvas/RunBar.tsx
  - app/src/pages/canvas/SessionControls.tsx
  - app/src/pages/canvas/SessionIdentity.tsx
  - app/src/pages/canvas/TracePanel.tsx
  - app/src/pages/canvas/ZoneNode.tsx
  - app/src/pages/canvas/canvas-context.ts
  - app/src/pages/canvas/identity-window.css
  - app/src/pages/canvas/index.tsx
  - app/src/pages/canvas/live-store.ts
  - app/src/pages/canvas/contracts.ts
  - app/src/pages/canvas/mock-server.ts
  - app/src/pages/canvas/session-identity.ts
  - app/src/pages/canvas/session-store.ts
  - app/src/pages/canvas/utils.ts
---

## 职责

把一个工作区的运行状态呈现在画布上，并把用户的操作交给后端。真实 e 会话显示对话窗口，herdr 节点显示终端；它们共用布局、缩放、分区和专注窗口。画布本身不启动本机 Agent 进程，也不把演示状态当成真实运行结果。

本页覆盖的文件超过 20 个，但职责仍集中在工作区的实时画布适配。对话内容与输入规则单列在[会话交互](chat-ui.md)，跨画布的显示组件单列在[画布原型与共享呈现](prototypes.md)。

## 对外接口

| 接口 | 定义位置 | 调用方与用途 |
| --- | --- | --- |
| `CanvasPage`、`CanvasRedirect` | `app/src/pages/canvas/index.tsx` | 路由分别打开指定工作区，或从工作区列表选择活跃项后跳转。 |
| `LiveStore` | `app/src/pages/canvas/live-store.ts` | 持有图、连接状态、事件和终端订阅；封装 `/ws` 与 `/api`。 |
| `SessionStore`、`capabilityAvailable` | `app/src/pages/canvas/session-store.ts` | 按节点订阅 `SessionView`；同工作区只接收更高版本，能力还须满足 ready、authoritative、available 与未过期。 |
| `LiveNode` | `app/src/pages/canvas/LiveNode.tsx` | 根据节点后端选择对话或终端内容，接入共享专注窗口。 |
| `LiveTerminal` | `app/src/pages/canvas/LiveTerminal.tsx` | 订阅 ANSI 全量快照；输入走工作区限定的节点端点。 |
| `SessionIdentity`、`SessionStatus` | `app/src/pages/canvas/SessionIdentity.tsx` | 展示身份与会话状态；昵称更新提交 `title` 和 `expectedVersion`。 |

`LiveStore.sessionAction` 接受 `messages`、`abort`、`approval`、`stop`、`resume`、`configuration`、`queue`。请求落在 `/api/workspaces/:wid/nodes/:nid/:operation`；没有工作区标识时使用旧节点路径。e 操作要求连接在线，响应中的会话快照回写 `SessionStore`。

`contracts.ts` 独立承载图与消息类型，真实 store 和 mock 共同依赖它；store 保留类型转导出，避免一次改动所有调用方。

## 数据怎么流

打开工作区后，浏览器建立同源 WebSocket，先声明要查看的工作区。收到全量图后建立节点、边和分区，再按增量更新局部状态。消息带有工作区、代次和序号时，客户端过滤错工作区和旧帧；发现序号缺口就重新请求全量图。连接失败会退避重连，保留最后快照。

真实会话的消息历史通过独立的会话快照更新，不必每次重建整张图。终端快照按节点分发；前三个活窗实时更新，第四个按半秒抽帧，其余显示最后快照，专注窗口提升为实时显示。终端键入内容提交给后端，屏幕回显仍以后端快照为准。

标题中的状态与上下文共用一个圆形入口：正常且数据有效时显示真实用量环与百分比，悬停或焦点只提示当前状态和查看详情的动作，完整用量、时间和原因在点击弹层中说明；异常时同一位置切换为红色状态，不并列旧百分比。等待审批仍有明确提示，不从“中断”等字样猜测故障。没有错误证据的待恢复记录用中性色，真实运行器失败或降级保留告警。详细节点与专注标题栏只保留身份、状态和操作入口；普通待恢复或已停止会话直接在标题栏提供恢复，不重复占据正文通知块。卡片视图选择与诊断放在会话菜单，历史模型在输入台与会话详情中明确标为上次使用。缩略卡没有输入台，仍保留模型摘要。

拖动节点先改变本地位置，拖动结束再提交位置数组。一键布局请求由后端计算，返回的节点补丁更新图。昵称修改附带用户开始编辑时的版本；遇到冲突时保留草稿，更新已知版本后等待用户重试。

演示回退有明确条件：列表请求失败且地址带演示参数时才返回本地示例。画布连接回退还要求先前已确认是演示源、非 e 后端，并且连续握手失败两次。首次完全离线时，画布默认来源仍是真实源，不会凭空生成演示图。以上行为以 `live-store.ts` 的实现为准，文件头的旧注释比实际条件宽。

输入台权限入口只显示当前模式图标：手动为盾牌，辅助为带勾盾牌，Full Access 为警示盾牌。菜单展示三种图标、说明和已选状态；风险模式仍有明显色调、可聚焦说明及启用前确认，审批授权逻辑不变。模型、状态和权限入口的自绘 hover 提示采用同一视觉样式，不再同时叠加原生 title；弹层打开时隐藏对应 hover 提示。

`GlobalCardViewControl` 将全局默认选择器挂到 `App` 的配色旁。全局值跨当前浏览器同源主画布生效；单卡有 inherit/auto/compact/detail 四种设置。全局变化保留单卡覆盖，只有明确点击“本画布全部跟随全局”才清除当前 workspace 的覆盖，不影响其他画布。

`SessionHeaderActions` 组合原有 `SessionControls`、`CardViewControl` 与浮出菜单。诊断开关由 `LiveNode` 持有，传给 `LiveChat`；诊断关闭后的焦点返回当前标题栏入口。不会重建聊天内容容器或触发隐式恢复。

昵称编辑旁有复制按钮，复制共享的名字与完整 hash 引用；同画布补全排除自己。真实通信边使用独立类型、方向和状态标签，读取与消息分道避免重叠；点击只显示该关系的持久化记录，不混入节点全部事件。没有操作时不因提及产生连线，细节见 [Canvas 协作](collaboration.md)。

## 改动指南

- 新增消息类型先改 `contracts.ts` 的 `ServerMessage` 与 `live-store.ts` 的分发逻辑，再决定通知图订阅者、单节点订阅者还是会话订阅者；不要让每个 token 都触发整图布局。
- 修改连接恢复时，要同时检查 `LiveStore.connect`、`subscribeTerm` 和 `LiveTerminal` 的订阅 effect。新连接和序号缺口重同步收到完整图后，会恢复仍有订阅者的 herdr 终端；e 会话不走这条恢复路径。
- 调整布局看 `index.tsx` 的拖拽位置缓存、`resetSeq`、`layoutSeq` 和 `computeTiers`。一键布局后的适应视图 effect 显式依赖布局序号，等待节点补丁渲染后重新适配视口。
- e 会话操作使用 `sessionAction`，不要复用允许空后端静默返回的旧 `run`、`reset`、`sendInput` 路径。
- 昵称冲突处理在 `SessionIdentity.tsx`；保留 `expectedVersion` 和工作区、节点身份校验，不能用最后写入覆盖冲突。
