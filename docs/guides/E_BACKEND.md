# 主画布的真实 e / Pi 会话

> **当前状态：本地 Agent Canvas MVP。** 真实会话、工具审批/拒绝、中断、运行中消息、多会话隔离和恢复已完成实际验收。默认首页只展示真实工作区，示例在独立入口。当前访问 `http://127.0.0.1:5199/`（API 3319）。

本版本使用现有首页和 `/canvas/:workspaceId`，不是 iframe 或独立 ADE ChatServer。真实链路是 Canvas API → 私有 IPC worker → ADE CoreSocketClient / OrcaAgentSessionBridge → e-core + Pi/e-pi-adapter。

## 当前 UI/UX 版本

底部输入台只保留附件、权限模式图标、执行模型与发送/中断。“发送方式”已移除：空闲发送新消息，运行中自动进入 Canvas 待发队列，可编辑或明确立即发送（Steer）。上下文与右上状态球合并，异常优先显示状态、不展示旧百分比。卡片视图、停止与诊断位于标题会话菜单，恢复入口在标题栏。模型摘要点击后进入推理主面板，再点击模型名进入真实目录；推理预览完成后提交一次，以回读确认。真实 e/Pi 协议与审批边界未改。

当前完整回归为 154 单测、74 浏览器夹具通过，1 个 opt-in 真实模型用例默认跳过；独立运行的版本包真实双 Agent 协作闭环另已通过。日常 5199 前端可热加载，但没有为本次验收重启 3319 后端或操作用户任务。当前证据见 [协作版本包验收](../chat-ui-polish-evidence/collaboration-package/README.md)，阶段对比见 [聊天改进](../chat-ui-polish.md)；下文旧地址与测试计数均属于明确标注的历史阶段。

## 桌面聊天交付（2026-10-19，功能阶段历史）

当前主画布已包含昵称、单一状态灯、浮层/全屏、统一 Composer、真实会话模型/思考/上下文、可编辑 Canvas 待发队列和安全附件。完整规则、35 条能力验收与截图见 [docs/desktop-chat-experience.md](../desktop-chat-experience.md)。其最新证据取代本文较早阶段的测试计数/登录态描述；历史记录不删除。

本轮 lint、89 单测、API/UI build、28 Playwright（27 fixture + 1 real）及 diff 检查通过。真实验收使用独立 3326/5206 和生产单服务 3327，不重启日常 3319/5199。

## 前提与配置

- Node >= 22.13、可执行的 Pi、已有合法的 Pi 模型配置。
- 本机 ADE 源码与其运行依赖已安装（包括 e-core 的原生 FD helper）。
- 在 **这个 worktree 的 `app` 目录** 执行：

```bash
export ADE_ROOT="/absolute/path/to/ADE"  # 按本机目录设置，不是 Windows 示例路径
# 可选：export PI_BIN="/absolute/path/to/pi"
npm install
npm run dev:e
```

默认入口 `http://127.0.0.1:5173/`，API 3300。端口被占用会明确退出，不会静默使用另一工作区。

```bash
API_PORT=3301 CANVAS_UI_PORT=5174 npm run dev:e
```

`dev:e` 不自动发送模型请求、不自动启动 herdr。页面上的 runtime 状态来自依赖/Pi 探测，不是仅判断环境变量是否存在。模型请求可能消耗已有服务额度，只在用户发送消息后执行。

可选配置：
- `ADE_ROOT`：ADE checkout 根目录，服务端使用；不经浏览器传入。
- `PI_BIN`：Pi CLI 可执行文件，默认 PATH 中的 pi。
- `CANVAS_PROJECT_ROOT`：工作目录，默认从模块位置定位当前 canvas worktree。必须是真实可访问目录。
- `CANVAS_DATA_DIR`：持久化目录，默认 `app/api/data`；不要放在会话 scratch 或共享临时目录。
- `API_PORT` / `CANVAS_UI_PORT`：统一启动端口。

不要把 token 或 API key 写入提交文件。运行时复用 Pi 原有认证配置，不输出凭据、不把 FD/token 下发给网页。

## 在主画布体验

1. 打开首页的真实 e 创建入口，使用当前项目和 Pi 默认模型或明确选择模型。
2. 创建画布/会话，等待真实 runtime ready；同一 `/canvas/:workspaceId` 中显示 Agent 节点。
3. 在节点或专注模式内发送整条消息，查看真实回复、工具详情、审批和 action 状态。
4. `nextTurn`、steer、follow-up、abort 和审批由有效能力租约决定。不可用时按钮禁用并给出原因。
5. 可添加多个独立 Pi 节点。连线不自动执行调度；首版不伪造 Agent 间关系。

**重要语义：**
- idle 不等于任务完成，exited 不等于失败。
- submitted/dispatched 不等于 applied。无法确认的动作展示 outcome-unknown，不自动重放。
- “abort 当前 run”“停止整个会话”“整理布局”是不同操作。
- 页签关闭只退订视图。点击停止或退出 API 才关闭本服务持有的子进程。
- 会话可归档：停止并从画布隐藏，保留历史，可在顶部“已归档”恢复。已归档会话可删除；删除需要确认，会移除本地会话记录和原生历史，不可恢复。

## 刷新、重连与恢复

- 浏览器刷新/WS 断线：保留最后会话快照，标注离线并禁用写操作；重连同步图和会话，不切换 mock。
- API 重启：从持久化数据加载历史，显示 stopped/interrupted；用户明确恢复后才重启相同受管 native session。
- 恢复不会重发历史消息，不会在找不到原会话时悄悄创建新空会话。恢复归档会话失败会把失败原因带回画布，不会伪装成功。
- 会话日志、Pi session、canonical 快照与控制 journal 保留。Ctrl+C 只清理当前启动器管理的进程。
- 会话恢复后仍提示队列待核实，不表示运行器恢复失败。展开待发列表，核对历史和工具结果，再使用“人工核实并结束跟踪”，填写说明并确认。该操作不改写运行器证据、不重发、不标记成功，且仍保持队列暂停；随后如需执行其余待发，单独点击“恢复待发”。

## API 与隔离

- 并发会话默认上限为 4，可由 `CANVAS_MAX_SESSIONS` 调整至 1–8；它只限制正在运行/启动的会话，归档或停止的记录不占额度。
- `GET /api/runtime/status`
- `POST /api/workspaces`，指定 `backend: "e"` 创建空画布
- `POST /api/workspaces/:wid/sessions`
- `GET /api/workspaces/:wid/nodes/:nid/session`
- `PATCH /api/workspaces/:wid/nodes/:nid/session`：昵称与 expectedVersion CAS
- `POST /api/workspaces/:wid/nodes/:nid/configuration`：当前配置回读/受管变更
- `POST /api/workspaces/:wid/nodes/:nid/queue`：持久待发 CAS/幂等操作
- `POST /api/workspaces/:wid/nodes/:nid/{messages,abort,approval,stop,resume}`
- `PATCH /api/workspaces/:wid/layout`

控制请求携带稳定 `intentId`；服务端从 e 获取 native identity/revision 和能力再提交。只有明确的过期 revision 拒绝可受控重试；网络超时不盲目重发。

`/ws` 绑定明确 workspace；图/会话更新带同步代次和序号。未知 workspace 返回错误，不回退全局 active。旧 `/api/e/*` legacy socket/bind API 已退休，返回 410。

服务只监听 loopback，HTTP/WS 校验本地 Host/Origin。ADE 核心源码只读复用，画布布局和 Zone 不写入 e-core。

## herdr / 示例兼容

herdr 的原有图执行、终端 pump 和示例入口保留。真实 e 会话不经过 herdr coordinator，不挂载 xterm，不自动回退浏览器 mock。

三份内置示例 JSON 的 `path: "."` 从 checkout 解析。仅精确匹配旧 Windows 示例的记录会迁移；用户自定义路径保留。示例拓扑不意味着已经存在对应真实 Agent。

## 检查

在 `app` 目录：

```bash
npm test
npm run build:api
npm run build
npm run test:e2e
```

自动化 fixture 明确标为测试数据，不代表真实模型验证。真实浏览器冒烟使用实际 ADE/Pi，以节点回复、native ID、AgentSession ID 和 action applied 共同验收。

实际执行过的检查、真实冒烟结果和未完成项记录在 `docs/guides/E_INTEGRATION_VERIFICATION.md`；不能仅凭首页 HTTP 200 宣称端到端完成。

## 已验证的真实 E2E

默认 `npm run test:e2e` 只运行 fixture UI 测试，真实模型用例默认跳过。运行中的本地服务准备好后，可显式运行（会调用当前 Pi 模型）：

```bash
CANVAS_REAL_E2E=1 CANVAS_TEST_URL=http://127.0.0.1:5199 npm run test:e2e -- --grep 'real Pi responds'
```

画布复用本机现有 Pi 配置，不自动切换账户/provider。首页 readiness 使用有界 `pi --list-models`；会话内模型、思考及上下文从当前 Pi RPC 回读。认证或网络失败仍显示真实错误；本文旧的 8787/401 故障属于历史阶段，不代表当前环境。

运行中普通消息通过“加入待发”明确保留在 Canvas，仅在确认空闲与前项消费后按序派发；Steer/Follow-up 仍须显式选择。停止/归档/API 或运行器重启后，恢复会话不会自动恢复待发。

本地体验启动器的 PID 由本轮 scratch 中 `integration/experience.pid` 记录。手动运行 `npm run dev:e` 时用 Ctrl+C 正常停止，会保留会话数据。

## MVP 日常使用

本机已在忽略的 `app/.env.e` 保存 ADE 路径与 3319/5199 端口（不含凭据）。以后在 `app` 目录运行 `npm run dev:e` 即可，启动器自动读取此文件；已有环境变量优先。换机器可复制 `.env.e.example` 为 `.env.e` 后修改路径。

生产构建无需 Vite：

```bash
npm run build
npm run build:api
npm run start:e
```

单服务页面位于 API 端口（本机配置为 `http://127.0.0.1:3319/`）。不要与已启动的 dev:e 同时占用该端口；先在启动终端 Ctrl+C。

- 首页“工作区”仅显示真实 e 工作区；“示例 / herdr 兼容入口”显式进入旧示例。
- 卡片支持重命名、归档、恢复工作区。归档会停止对应受管会话并保留历史；归档工作区不可写，恢复工作区不会自动发消息或启动 Agent。
- 未有运行时数据的成本/上下文使用 `—`，不再假装 `$0.00 / 0%`。
- 运行中普通消息显示“加入待发”，可编辑/删除/排序；立即发须确认 Steer。Steer/Follow-up 已真实验证，未知结果不重发。
- bash/write/edit 的请求由 ADE 发出审批；批准/拒绝使用真实 approval ID。敏感操作仍需用户逐条判断，不要盲目批准。
- “中断当前轮”保留会话，“停止会话”关闭受管进程，“归档”隐藏工作区但不删除历史。

### 重复运行真实工具验收（会调用当前模型）

使用单独的测试数据目录启动服务，不要对日常工作区做自动清理。真实工具测试只批准预定的 printf 与短 sleep，不修改文件。

```bash
export CANVAS_REAL_E2E=1
export CANVAS_TEST_URL=http://127.0.0.1:5201
# 如果 Playwright 未安装 Chromium，可指定本机浏览器：
# export CHROME_PATH=/absolute/path/to/chrome
node test/browser/real-tools.mjs
node test/browser/real-multi.mjs
```

第二个脚本接着第一个的测试工作区验证 Steer/Follow-up 和多节点/多工作区隔离，最后只停止这些测试创建的会话。证据默认放会话 scratch 或 `test-results/real-mvp`，可用 CANVAS_EVIDENCE_DIR 指定。

质量门禁：`npm run lint && npm test && npm run build:api && npm run build && npm run test:e2e`。真实模型测试默认不执行，必须显式选择。

## 新版结构化对话

当前 LiveChat 已独立实现轮次时间线、工具/审批关联、Markdown/代码复制、待审批突出与已决历史折叠。草稿在运行中/暂时离线仍可编辑；发送由能力租约与 run 状态控制，不自动切换模式或重发。缩放至摘要、进入/退出专注和重连保留草稿与阅读状态。

完整规则、同数据前后截图、基础库 MIT 声明与本轮测试结果见 [docs/chat-experience.md](../chat-experience.md)。本轮 44 项单测和开发/生产各 10 项浏览器 fixture 通过；真实模型回归发现默认 provider 上游登录态刷新 401，需要重新登录模型代理后复跑。本轮不把此前的真实工具验收成功当成本次回归成功。

现有用户会话未被重启；Vite 前端会载入新版。后端安全摘要和归档状态广播在下一次正常 API 启动生效。


## 重新登录后的真实回归：通过（取代上述登录态阻塞结论）

用户重新登录后，使用原默认模型，未切换账户/provider 或修改默认配置：

- 新版主画布真实 Playwright：1 passed（28.6s）；创建、随机标记回复、上下文追问、刷新、停止及恢复原 native 会话。
- real-tools：真实工具批准与拒绝通过；abort action applied，run cancelled。
- real-multi：Steer/Follow-up 均 applied，实际收到后续回复；跨工作区隔离和同图多节点身份独立通过。
- 本轮只运行既有验收脚本，使用独立数据目录，未修改 runtime/UI 实现，未重发用户任务。
- 此前上游 OAuth 401 阻塞已解除。上文保留为历史诊断，不代表当前状态。

## 全站主题切换

已支持浅色／深色／跟随系统。只有全局“配色”选择器，浮层/全屏期间仍可访问；不再在专注标题栏重复提供，偏好持久化并同步同源标签页。画布、聊天、代码块、终端、toast 与弹层共用主题；无需重启会话。配置和截图见 [docs/themes.md](../themes.md)。

## 卡片视图与审批策略

每卡可独立选择自动／缩略／详细，刷新后保留。真实会话的“工具审批”可选手动、帮我审批（白名单＋显式配置的独立 AI）、Full Access。后两者仅当前运行实例有效，停止/恢复/服务重启回到手动；不改变 Pi 全局默认。实际规则、风险边界、审计和验收见 [docs/card-views-and-approvals.md](../card-views-and-approvals.md)。旧 `auto` API 不再接受。审批策略 v2 将支持的引号/管道/命令链、静态只读 Node 及受管 Canvas 工具交给 AI，而非因语法直接转人工；高风险与未知执行仍由规则拦截。权限详情显示实际 API 策略版本，旧 API 需要安全重载，前端刷新不足以启用。


## Canvas 协作工具（后续增量）

同画布引用与真实消息/文本产物协作已实现。Pi 通过 Canvas 显式加载的 `canvas_agents/read/publish/send` 工具发起操作，仍经过 e 审批；私有 FD 和父 IPC 绑定来源，不增加公开远程发送接口。产生实际记录后才投影通信边；不会因为 `@` 而自动发消息，也不做 DAG 调度或 Git 合并。

独立 Skill 位于 `skills/canvas-collaboration/SKILL.md`，工具参数/结果/错误/限额共用 `app/shared/collaboration-protocol.mjs`。`npm run collaboration:inspect -- --manifest` 只检查资源；会话状态球中的“Canvas 协作能力”才显示运行时握手结果。必须确认 Skill 已发现、4 个工具启用、系统指令绑定与版本/摘要一致，旧布尔值不算就绪。

原 ADE 保持只读；Canvas 在自有 generation 中生成仅扩展审批工具名单的过渡适配器副本。结构不匹配、旧 API 无 manifest 或握手失败时停用协作，普通聊天回退原适配器，不绕过审批。停止目标只暂停入队，恢复会话与恢复队列分开。范围、容量、可信来源和可复验脚本见 [Canvas 协作](../canvas-collaboration.md)。现有 API/Pi 不热注入工具，日常服务需在安全时显式重载。

API 编译设置 `noEmitOnError:true`，编译和 lint 排除 `api/data/**`、`dist-api/**`，防止运行时生成文件被当作源码。不要删除会话数据来解决构建错误。
## 会话归档与删除（2026-10-20）

- 会话菜单提供“归档会话”：停止 worker、暂停待发、从画布隐藏，保留本地记录。
- 顶部“已归档”列出可恢复会话；恢复沿用同一 native session。缺少原生历史时恢复会失败并显示原因，不创建空替代会话。
- 删除只在归档列表中出现，需明确确认；它删除本地会话目录和画布卡片，不能撤销，也不从协作账本重建会话。
- 文件系统拒绝删除时保留内存记录，显示错误并允许重试；不会将删除失败显示成成功。
- 前端根据运行中 API 的 `sessionLifecycleVersion` 显示入口；旧 API 未重启时不会出现不可用按钮。
- 当前日常 API 仍需安全重载后才有这些路由；本次实现没有归档或删除任何真实会话。
