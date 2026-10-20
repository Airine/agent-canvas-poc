# Agent Canvas 本地 MVP 验收记录

## 结论

本轮将可体验首版补成**可执行真实任务的本地 Agent 会话工作台 MVP**。不是 mock 页面，也不依赖单独的 ADE ChatServer。

正式 worktree：`agent-canvas-e`，分支 `feat/agent-canvas-e`。

**日常入口：http://127.0.0.1:5199/**（API 3319）。之前验证的会话 `ws-d959ce63` 已在更新后恢复，native ID 保持 `c70c1b50-eee5-4243-8310-d744eb73d7a2`，没有重发历史消息。

## 可用能力

- 首页默认只展示真实工作区，示例/herdr 兼容入口显式分开。
- 创建真实 Pi、同图多个独立节点、跨工作区隔离。
- 结构化消息、工具详情、能力租约、真实模型/cwd、动作确认状态。
- 工具审批/拒绝、中断当前轮、Steer、Follow-up、停止/恢复会话。
- 重命名、归档、恢复工作区。归档停止受管进程但不删除历史，归档状态下禁止写操作。
- WS 重连、刷新、API 重启后历史保留；明确恢复原 native session，不偷偷新建或自动重发。
- `.env.e` 本地配置自动加载；dev:e 和生产单服务 start:e；端口占用时明确失败。
- 未知成本/上下文显示 `—`，不再用 0% / $0.00 假占位。

## 本轮真实验收（非 fixture）

使用用户原默认 provider/model，未切换账户、未修改全局默认或凭据。8787 本地代理保持由用户管理。

| 场景 | 实际证据 | 结果 |
|---|---|---|
| 首页创建 → 主画布消息 → 连续追问 | 随机标记得到两次真实 assistant 回复，action applied | 通过 |
| 工具批准 | bash `printf` 的指定标记经审批后出现在真实工具结果；approval approved、tool completed | 通过 |
| 工具拒绝 | 第二条 printf 被拒绝；approval rejected、工具返回拒绝失败而非执行输出 | 通过 |
| 中断执行 | 批准 `sleep 45` 后点击中断；abort action applied、run cancelled | 通过 |
| 运行中 Steer | 已批准的 `sleep 12` 期间发送；deliverAs steer、action applied | 通过 |
| Follow-up | 同一运行期间排入后续消息，模型实际回复 follow-up 标记；action applied | 通过 |
| 双工作区隔离 | 第二画布的独立标记仅在第二画布出现 | 通过 |
| 同画布多节点 | 新增第二个真实 Pi 节点，native ID 不同且均 ready | 通过 |
| 刷新/停止/恢复 | 真实 E2E 验证历史和 native ID 保持 | 通过 |
| API 重启恢复 | 前轮真实验证 + 本轮正式服务更新后恢复原 native ID、无重发 | 通过 |
| 生产单服务 | start:e 页面创建、两轮回复、深路由刷新、停止/恢复 | 通过 |
| 重命名/归档/恢复 | 在生产页面操作；归档后写请求返回 409，历史记录保留 | 通过 |

真实工具测试仅允许指定 printf 与短 sleep，没有读写用户文件或仓库。测试服务使用独立数据目录，完成后只停止测试创建的会话/启动器。

脱敏证据在本轮 scratch 的 `mvp/tools-evidence.json`、`multi-evidence.json`、`management-evidence.json`、`real-tools.png`。

本轮工具验收工作区：`ws-1fcb72bc`；节点：`n-da8ef693-03b8-48c4-b4ce-e6d4940e4422`。日常体验数据不使用这个临时测试目录。

## 质量门禁

| 检查 | 结果 |
|---|---|
| `npm run lint` | **通过，0 errors / 0 warnings** |
| `npm test` | **27 passed** |
| `npm run build:api` | 通过 |
| `npm run build` | 通过 |
| 默认 Playwright | **3 passed，真实模型用例默认 skipped** |
| 显式真实 Playwright（dev:e） | **1 passed** |
| 显式真实 Playwright（start:e） | **1 passed** |
| 浏览器实际工具/运行中消息/多会话脚本 | 全部通过 |
| `git diff --check` | 通过 |

26 项基础测试之外，新增生产深路由静态资源回归：构建资源必须为根路径 `/assets/...`。本轮实测先发现 `base: './'` 导致生产刷新失败，修成 `/` 后重新跑真实生产 E2E 通过。

此前 9 个 lint 错误已经实际修复：非组件样式/Hook 移入独立模块，sidebar 不在渲染中使用随机数，终端 ref 更新移入 effect。没有禁用规则来掩盖错误。

## 可重复验收

- `test/browser/real-e.spec.ts`：显式开启 CANVAS_REAL_E2E=1 后，从首页完成真实回复/追问/恢复。
- `test/browser/real-tools.mjs`：真实审批通过、拒绝和中断。
- `test/browser/real-multi.mjs`：接续 tools 测试工作区，验证 Steer/Follow-up、多工作区/节点隔离。
- 默认测试不调用模型。实际命令见 docs/guides/E_BACKEND.md。

## 数据保护与剩余边界

- 原 `agent-canvas-poc` 项目源码、ADE 源码哈希对照未变化；原目录 `.DS_Store` 有 macOS 元数据变化，未覆盖。
- 全部实现位于 e worktree；没有 stash/reset/clean、自动 commit/push/pull。
- 本机 `.env.e` 不含凭据且已被 gitignore；会话数据留在忽略的 api/data 或显式数据目录。
- 保留日常 5199/3319 服务；独立验收 5201/3321 和 3322 服务已停止，模型 8787 服务未被改动。
- 构建仍有 Browserslist 数据较旧和大 bundle 警告，不影响构建/运行；不是质量门禁失败。
- 这是本地受信任用户的多会话工作台，不宣称多用户公网部署或进程沙箱。
- 连线仅为视图关系，不自动执行 DAG、跨 Agent 委派或 Git 合并；不会把未实现的编排能力标成可用。


## 后续：结构化对话体验升级（本轮）

- 已实现独立聊天展示层，不复制 PI-Desktop 源码、不改变 e 控制协议。
- 新增 17 项纯逻辑回归，当前单测 **44 passed**；lint、API/UI build、diff check 通过。
- 新旧 UI/终端与专项体验浏览器用例合计 **10 passed**，开发及生产单服务均通过；真实模型用例在默认测试中显式 skipped。
- 单独执行真实 Pi 用例时：创建与输入 applied 成功，但默认模型代理刷新上游登录态返回 **401 / session has ended**（外层 502），没有取得模型回复。因而本轮工具/审批/abort/steer/follow-up 的真实复测被该依赖阻塞，未切换模型或凭据。
- 这与上文历史 MVP 验收是不同时间的结果。详细证据、截图和运行边界见 `docs/chat-experience.md`。


## 重新登录后的真实回归：通过（取代上述登录态阻塞结论）

用户重新登录后，使用原默认模型，未切换账户/provider 或修改默认配置：

- 新版主画布真实 Playwright：1 passed（28.6s）；创建、随机标记回复、上下文追问、刷新、停止及恢复原 native 会话。
- real-tools：真实工具批准与拒绝通过；abort action applied，run cancelled。
- real-multi：Steer/Follow-up 均 applied，实际收到后续回复；跨工作区隔离和同图多节点身份独立通过。
- 本轮只运行既有验收脚本，使用独立数据目录，未修改 runtime/UI 实现，未重发用户任务。
- 此前上游 OAuth 401 阻塞已解除。上文保留为历史诊断，不代表当前状态。
