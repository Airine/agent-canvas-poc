# Agent Canvas 调研 · 维度 07：终端实时共享与操作/Session 回放的技术与产品方案

> 调研范围：ttyd / gotty / wetty / xterm.js、asciinema（录制+回放+嵌入）、tmate/tmux 共享、rrweb/OpenReplay 会话回放、Playwright trace viewer、agent trajectory 回放工具（OpenHands trajectory visualizer、SWE-agent inspector、LangGraph time travel）、终端录屏与事件流回放。
> 调研方法：21 次独立中英文搜索，优先官方文档 / GitHub / 工程博客。所有结论附原文摘录、URL、日期、置信度。
> 调研日期：2026（检索时点）。注：部分来源页面为搜索引擎快照日期，标注为 "page-date"。

---

## 〇、设计启示（Top 7）

1. **实时终端嵌入：直接用 xterm.js + WebSocket 是事实标准，无需自研渲染层。** ttyd（C 单二进制 + xterm.js）、wetty（Node + xterm.js）、tmate web 端全部收敛到同一前端组件；VS Code 的官方渲染优化博客证明 xterm.js 可达 60fps、5–45 倍性能提升。用户侧延迟基本等于 WebSocket RTT（同机房 <10ms，跨地域约等于 ping），不存在视频流的编码延迟（秒级）。agent canvas 的 CLI 节点建议内嵌 xterm.js，后端用 ttyd 式 PTY→WS 桥或直接复用 ttyd。

2. **回放格式选字符流（asciinema 路线）而非视频：5 分钟终端演示从几十 MB 降到几十 KB（约 1/100～1/1000），且天然可复制、可搜索、可全文索引。** asciicast v2 是 NDJSON 事件流（header + `[time, type, data]` 事件行），支持增量读写、断点续录、streaming friendly——格式简单到 Go/Python 几十行代码就能生成（有工程实践先例）。

3. **"事件流 + 全量快照" 的 rrweb 模式是解决"可跳转性"的通用架构，与 asciicast 互补。** rrweb：一次全量快照（50–200KB）+ 增量 MutationObserver 事件（单次交互 200–500B），回放器在 iframe 中确定性重建。对 CLI 场景的等价物：asciicast 记录输出流，跳转到 t 时刻 = 从头把事件喂进一个 headless 终端模拟器（xterm-headless / avt）重建屏幕缓冲——asciinema player 就是这么做的。

4. **Playwright trace viewer 被好评的核心：动作时间轴 + 每个动作 before/after DOM 快照 + 网络瀑布 + console + 源码定位，打包成一个自包含 trace.zip，可拖进 trace.playwright.dev 纯浏览器打开。** 它证明了"可交互的确定性 post-mortem 工件"（无需复现失败现场）是调试工作流的最大杠杆。对 agent 操作回放的借鉴：把每个 agent step 做成时间轴节点，节点上挂"当时产物"（文件 diff、终端屏幕缓冲、浏览器 DOM、网络日志），时间轴即导航。

5. **agent 轨迹回放已有成熟产品形态：OpenHands trajectory visualizer（action 蓝色 / observation 灰色-red 时间轴，键盘导航，支持 URL/Gist 加载）、SWE-agent inspector（CLI + Web 双形态，vim 键位，逐步浏览 .traj）、Langfuse agent graph（aggregated 折叠 vs expanded 展开双模式）。** 结构化 thought→action→observation 序列是体积最小、可检索性最强的回放载体，应作为 agent canvas 的"主时间轴"，终端字符流/DOM 快照作为 observation 的"富媒体附件"。

6. **"跳到某一步看当时环境状态"（time travel）有三档实现成本**：①重放重算（LangGraph time travel：checkpoint 前不重跑、之后真重跑，非确定性但成本低）；②快照还原（Playwright trace 的 before/after DOM、asciinema 屏幕缓冲重建——确定性查看，不能继续执行）；③全量环境 checkpoint（Crab 论文：ZFS 文件系统快照 + CRIU 进程快照，turn 边界做增量 checkpoint，成本与 LLM 等待时间重叠隐藏）。产品化建议按 ②→①→③ 递进。

7. **实时共享与回放可统一成一条数据管道：PTY 输出 → 事件流（asciicast v3/WS）→ 边录边播。** asciinema 3.0（2025-09，Rust 重写）已实现：`asciinema session -o demo.cast -r -l` 同时本地直播 + 远程直播 + 落盘录制，server 可把直播流转成常规 recording。tmate 提供"只读 web 链接 + SSH 双通道"的极简共享 UX。即：录制不是事后补录，而是实时管道的旁路 tap。

---

## 一、实时终端嵌入网页的成熟方案与延迟表现

### Claim 1.1：ttyd 是最成熟的"终端→网页"共享工具：C 单二进制、libwebsockets + libuv、xterm.js 前端，支持只读/可写、CJK/IME、ZMODEM、Sixel，跨平台
- **Source**: ttyd 官方站（项目主页）
- **URL**: https://tsl0922.github.io/ttyd/
- **Date**: n/a（项目 2016 年起，持续维护至 2025）
- **Excerpt**: "Built on top of Libwebsockets with libuv for speed; Fully-featured terminal based on Xterm.js with CJK and IME support; Graphical ZMODEM integration; Cross platform: macOS, Linux, FreeBSD/OpenBSD, OpenWrt, Windows." 默认端口 7681，`-R` 只读、`-W` 可写、`-m` 最大客户端数、`-o` 单客户端退出。
- **Context**: gotty（Go 实现）已停止维护，社区普遍推荐 ttyd 作为继承者（"Before ttyd, there used to be an excellent project named gotty... that project is clearly abandoned now. ttyd works perfectly well today and is regularly maintained." — akos.ma 2024-12-27）。
- **Confidence**: 高（官方文档 + 多个独立工程博客一致）

### Claim 1.2：实时性的工程结论——WebSocket 转发 PTY 字节流的延迟接近本地终端体验，xterm.js 渲染可达 60fps
- **Source**: ① VS Code 官方博客 "Integrated Terminal Performance Improvements"；② ttyd+Caddy 实战博客 unixy.io；③ 中文对比评测 52runoob
- **URL**: https://code.visualstudio.com/blogs/2017/10/03/terminal-renderer ; https://unixy.io/blog/browser-terminal-ttyd-caddy/ ; https://www.52runoob.com/archives/5512
- **Date**: 2017-10-03（官方）; 2025-03-25; 2025-09-01（page-date）
- **Excerpt**: VS Code 官方："With the new renderer... you can now enjoy up to 60 FPS in the terminal... renders approximately 5 to 45 times faster than before." 实战博客：ttyd "fast enough to not feel like I am typing through wet cement"；前端 xterm.js "copy-paste works, colors work, vim works, even mouse support works"。中文评测："几乎无延迟，输入体验接近本地"（vs shellinabox 的 AJAX 方案"偶尔卡顿"）。
- **Context**: 延迟构成 = WebSocket RTT + xterm.js 渲染（<16ms/帧）。ttyd 二进制仅约 5MB，无 daemon 框架。ttyd 默认 `-P ping-interval 5s` 保活。无公开权威 benchmark 数字，"接近本地"为多来源定性一致结论。
- **Confidence**: 高（定性方向）；精确延迟数字无权威基准（中）

### Claim 1.3：xterm.js 是浏览器终端模拟的事实标准组件，VS Code/Hyper 等大量使用；Canvas/WebGL 渲染器 + 纹理图集持续优化输入延迟
- **Source**: xterm.js GitHub 5.1.0 release discussion；bestofjs
- **URL**: https://github.com/xtermjs/xterm.js/discussions/4334 ; https://bestofjs.org/projects/xtermjs
- **Date**: 2022-12-19
- **Excerpt**: "Optimize critical I/O path for input latency... Use microtask to flush the write buffer after input"；"Multiple texture atlas page support... Less time from drawing a glyph to rendering it. Less CPU is used when lots of glyphs are used." bestofjs："Performant... includes an optional GPU-accelerated renderer. Rich Unicode support: CJK, emojis, and IMEs."
- **Context**: 注意 Safari 下 WebGL 渲染器对 Unicode box-drawing 字符有已知乱码问题，需 `rendererType:'dom'` 回退（hermes-agent issue #18773，2026-05-02）——对 agent canvas 嵌入场景的实操提醒。
- **Confidence**: 高

### Claim 1.4：wetty = Node.js 版 Web TTY/SSH（SSH 模式可连远程主机），支持 iframe 嵌入（`--allow-iframe`），适合需要"浏览器里 SSH 到别处"的场景
- **Source**: X-CMD wetty 安装文档（汇整官方 README 信息）；GitHub butlerx/wetty
- **URL**: https://www.x-cmd.com/install/wetty/
- **Date**: 2026-09-12（page-date）
- **Excerpt**: "Browser Access: http://host:3000/wetty; Dual Mode: runs /bin/login as root; connects via SSH as regular user; Remote SSH: --ssh-host/--ssh-port/--ssh-user; iframe Support: Embed in other pages with --allow-iframe"。可作为 Node library 编程调用（`import { start } from 'wetty'`）。
- **Context**: 需 Node.js ≥18。生产建议反代做 TLS。与 ttyd 的差异：wetty 内建 SSH 客户端（跳板场景），ttyd 直接执行任意本地命令（更轻、更适合包 PTY 会话进 agent 节点）。
- **Confidence**: 高

### Claim 1.5：tmate = tmux fork + 即时共享：一行命令生成 SSH 与 Web 双链接（只读/读写两档），自带 NAT 穿透，可自托管 relay；tmux 提供会话持久化与多客户端 attach
- **Source**: tmate 实战（dev.to / credativ 工程博客 / mtmux）；Tailshell 博客（ttyd+tmux 组合分析）
- **URL**: https://dev.to/odmikes/tmate-the-fastest-way-to-share-your-terminal-17fj ; https://www.credativ.de/en/blog/howtos-en/tmate-efficient-remote-maintenance-and-data-sovereignty/ ; https://www.visorcraft.com/news/2026/07/tailshell-ttyd-tmux-web-ui-with-mfa/
- **Date**: 2026-03-13；2025-08-27；2026-07-30（page-dates）
- **Excerpt**: "web session read only: https://tmate.io/t/ro-ptJWCzDvxntCGkfhZSU37HrXg / ssh session read only: ssh ro-...@lon1.tmate.io / web session: https://tmate.io/t/JH3... / ssh session: ssh ..."。Tailshell："a tmux session lives on the server, survives the client vanishing, and lets any number of clients attach to the same view... `tmux attach -t main`... ttyd serves a terminal over WebSocket with a proper xterm.js front end."
- **Context**: 读写链接=交出一台机器的全部权限，安全实践上只发只读链接。对 agent canvas 的价值：证明"会话在服务端存活、客户端随时 attach/detach"的拓扑（tmux 语义）非常适合"agent 长时间 CLI 任务 + 人类随时围观/接管"。
- **Confidence**: 高

---

## 二、回放技术路线对比：视频 vs asciinema 字符流 vs 事件流重建 vs rrweb DOM 快照

### Claim 2.1：asciicast v2 格式 = NDJSON：首行 header（宽高/时间戳/env/theme），其后每行一个 `[time, "o|i|m|r", data]` 事件；设计目标即"增量写读、流式友好、崩溃不丢"
- **Source**: asciinema 官方文档 asciicast v2 spec；官方博客 2.0 发布文
- **URL**: https://docs.asciinema.org/manual/asciicast/v2/ ; https://blog.asciinema.org/post/two-point-o/
- **Date**: 2018-02-18（v2 发布）；文档现行
- **Excerpt**: "asciicast v2 is a file format for terminal sessions... based on newline-delimited JSON. First line... represents the header... All following lines form the event stream. Each line represents a separate event, encoded as 3-element JSON array." 事件类型：`o` output、`i` input、`m` marker、`r` resize。"minimal memory usage when recording and replaying arbitrarily long sessions... when the recording session is interrupted you don't lose the whole recording... it's real-time streaming friendly."
- **Context**: 最新一代为 asciicast v3（asciinema 3.x 默认，`asciinema-convert` 可在 v2/v3/raw/txt 间转换）。marker 事件天然支持"章节跳转"。建议扩展名 `.cast`，MIME `application/x-asciicast`。
- **Confidence**: 高（官方 spec）

### Claim 2.2：字符流 vs 视频的量化对比：5 分钟终端演示，视频几十 MB vs cast 几十 KB（官方中文文档称可压缩至视频约 15% 甚至更小；10 分钟录制约 <100KB，比视频小数百倍）
- **Source**: X-CMD asciinema 推荐页（中文）；dev.to 对比表；狐火笔记
- **URL**: https://cn.x-cmd.com/install/asciinema/ ; https://dev.to/anderson_leite/asciinema-the-secret-weapon-for-better-documentation-training-and-handovers-1m9i ; https://foxfire.com.cn/article/1957.html
- **Date**: 2026-08-14；2025-11-19；2025-05-03（page-dates）
- **Excerpt**: "一段 5 分钟的终端演示，视频可能几十 MB，而 asciinema 记录可能只有几十 KB。更重要的是，观看者可以暂停、选中文字、复制命令。" dev.to 对比表：Asciinema File Size ✅Tiny / Copy-paste ✅Yes / Searchable ✅Yes / Live Streaming ✅Yes vs Video ❌Large/❌No/❌No/⚠️Complex。"单个10分钟录屏文件大小通常不超过100KB，相比传统视频缩小了数百倍。"
- **Context**: 衍生优势：文本可全文检索/索引（对 agent 操作日志尤其关键——可以直接 grep 某条命令出现在哪些 session）；自适应终端宽度不糊；可用文本工具后期编辑（asciinema-edit）；`agg` 可转 GIF。劣势：非终端内容（图形界面）录不了。
- **Confidence**: 高

### Claim 2.3：事件流回放需要"确定性终端模拟器"在回放端重建屏幕；asciinema player 内建 Paul Williams ANSI parser 的终端模拟器实现这一重建
- **Source**: asciinema 官方博客（player 2.0 / self-hosting 篇、3.4.0 篇）
- **URL**: https://blog.asciinema.org/post/
- **Date**: 2016-01-06（self-hosting 篇）
- **Excerpt**: "the new player directly supports asciicast v1 format... This is possible thanks to built-in terminal emulator based on Paul Williams' parser for ANSI-compatible video terminals. It covers only the display part of the emulation... Handling of escape sequences is fully compatible with most modern terminal emulators like xterm, Gnome Terminal, iTerm, mosh etc." player 3.4.0 起支持自定义 parser，可回放 typescript/ttyrec 等任意格式。
- **Context**: 这是"事件流→任意时间点屏幕状态"的关键机制：跳转到 t 时刻 = 把 [0, t] 的事件全部喂给 headless 终端模拟器重放。xterm.js 也有 xterm-headless 变体可做同样的事。实现成本：自研约等于"选一个成熟 vt parser（pyte / avt / xterm-headless）+ 事件喂入循环"。
- **Confidence**: 高

### Claim 2.4：rrweb 模式 = 全量 DOM 快照一次 + MutationObserver 增量事件流（JSON），回放端在 iframe 确定性重建；单次典型交互仅 200–500B，初始快照 50–200KB；JSON 可检索、可编程分析
- **Source**: rrweb 深度解析博客（brightcoding）；temps.sh 自托管 session replay 指南
- **URL**: https://www.blog.brightcoding.dev/2025/09/01/record-and-replay-user-sessions-on-the-web-a-deep-dive-with-rrweb ; https://temps.sh/blog/session-replay-how-it-works
- **Date**: 2026-09-20；2026-03-12（page-dates）
- **Excerpt**: "Full Snapshot – Once, at the beginning, the entire DOM (including CSS rules and form values) is serialized into a compact JSON tree. Incremental Snapshots – every subsequent change... is emitted as a delta event with a micro-second timestamp." "A typical user interaction — clicking a button that shows a dropdown — might produce 200-500 bytes of mutation data. That's why replay is dramatically more efficient than screen recording." "initial snapshot typically 50-200KB for a modern web app."
- **Context**: rrweb 是 Sentry/PostHog/OpenReplay/Highlight 的底层引擎，GitHub 17k–19k stars。三件套：rrweb-snapshot（序列化/重建）、rrweb（record/replay）、rrweb-player（时间轴 UI：scrubbing、倍速、skip-inactivity）。隐私：mask/block/ignore 选择器。对 agent canvas 的借鉴：canvas 上非终端节点（浏览器、富文本）可用同构的"快照+增量"方案。
- **Confidence**: 高

### Claim 2.5：OpenReplay 证明 rrweb 类回放可产品化为"回放 + 当时技术上下文"（网络/console/JS 错误/store state/性能指标），但全栈自托管成本高（17 微服务 + Kafka + ClickHouse，最低 8GB/4vCPU）
- **Source**: OpenReplay GitHub README（gitee 镜像）；zeabur 部署模板
- **URL**: https://gitee.com/cskchensk_admin/openreplay?skip_mobile=true ; https://zeabur.com/templates/E2KAUU
- **Date**: 2025-10-24；2026-04-27（page-dates）
- **Excerpt**: "OpenReplay replays what users do... also shows you what went under the hood... capturing network activity, console logs, JS errors, store actions/state, page speed metrics, cpu/memory usage." "Architecture: PostgreSQL, ClickHouse; Redis; MinIO; Kafka; 17 microservices; Nginx. Minimum: 8 GB RAM, 4 vCPU."
- **Context**: 教训：session replay 平台本身重，agent canvas 不应引入整套 OpenReplay，而应借鉴其"回放画面旁边挂 DevTools 上下文面板"的 UX 范式。license 为 Elastic License 2.0（注意非 OSI）。
- **Confidence**: 高

### Claim 2.6：经典终端录屏工具谱系：script+scriptreplay（typescript+timing 两文件）、ttyrec/ttyplay（二进制，可变速）、TermRecord（自包含 HTML）、showterm、asciinema（JSON + web player 生态最完整）
- **Source**: coelhorjc 工具横评（Linux 终端录制工具对比，长期被引）；51cto/博客园中文教程
- **URL**: https://coelhorjc.wordpress.com/2015/01/22/how-to-recordplayback-terminal-in-linux-using-scriptreplay-ttyrec-termrecord-asciinema-showterm/ ; https://www.cnblogs.com/kevingrace/p/10188283.html
- **Date**: 2015-01-22；2018-12-28
- **Excerpt**: "script -t 2> timingfile / scriptreplay timingfile"；"ttyrec is just a derivative of script command for recording timing information with microsecond accuracy as well"；"TermRecord saves your recording locally as a self-contained html file"；"asciinema... 录制与播放都是使用的同一个工具和文件... 可以播放来自网络的会话文件"（script 需两个文件+单独 replay 工具，asciinema 单文件单工具）。
- **Context**: asciinema 生态胜出原因：单文件、web 嵌入播放器、托管服务、格式开放（第三方可用任意语言生成 cast 文件）。
- **Confidence**: 高

### Claim 2.7：路线对比汇总（调研综合，非单一来源）

| 路线 | 体积 | 可检索性 | 可跳转性 | 实现成本 | 适用面 |
|---|---|---|---|---|---|
| 录屏视频（MP4） | 大（数十 MB/5min） | 无（像素） | 仅时间轴拖拽，帧级粗 | 低（ffmpeg/系统录屏） | 通用画面，含 GUI |
| asciinema 字符流 | 极小（数十 KB/5min） | 强（纯文本可 grep/索引） | marker 章节 + 时间轴；精确到事件 | 低（现成 CLI+player；格式极简可自生成） | 仅终端 |
| keystroke/action 事件流重建 | 极小 | 强（结构化 JSON） | 强（精确到 action） | 中（需确定性模拟器重放） | 终端 + 结构化 agent 步骤 |
| rrweb DOM 快照+增量 | 中（百 KB 级快照 + 小增量） | 强（JSON） | 强（事件级 + skip-inactivity） | 中（引入 rrweb 三件套） | 网页/DOM 界面 |

- **Source**: 综合 Claim 2.1–2.6
- **Confidence**: 高（各单元数据均有出处；表格为归纳）

---

## 三、Playwright trace viewer：格式与时间轴 UI 为何被好评

### Claim 3.1：trace 是单个自包含 .zip：动作时间轴 + 每动作 before/after DOM 快照 + 截图 + 网络瀑布 + console + 源码定位 + 内部 call log；可交互（hover DOM、检查元素样式、点击元素看 locator）
- **Source**: qaskills.sh Playwright trace viewer 指南；TestDino 指南
- **URL**: https://qaskills.sh/blog/playwright-trace-viewer-complete-guide-2026 ; https://testdino.com/blog/playwright-trace-viewer
- **Date**: 2026-05-22；2026-08-30（page-dates）
- **Excerpt**: "A trace is stored as a single .zip file... containing: Action log: every Playwright API call with timestamps; DOM snapshots: the full HTML before and after each action; Screenshots: PNG captures at each step; Network requests; Console messages; Source code; Test annotations. Unlike video recordings, the trace is interactive: you can hover the DOM, inspect element styles, and even click on logged elements to see which locator selected them." "Trace recording slows tests by roughly 10–25%."
- **Context**: 面板映射：Actions / Snapshots(Before-Action-After) / Screenshots(filmstrip) / Source / Call / Log / Errors / Console / Network / Metadata / Attachments。
- **Confidence**: 高

### Claim 3.2：被好评的根本原因：确定性 post-mortem 工件——"不需要复现失败"，把 30 分钟猜测变成 30 秒诊断；且浏览器内零安装打开（trace.playwright.dev 纯本地处理、数据不出浏览器）
- **Source**: qaskills.sh debugging guide；momentic.ai "time travel debugging" 指南
- **URL**: https://qaskills.sh/blog/playwright-trace-viewer-debugging-guide ; https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging
- **Date**: 2026-06-23；2025-10-10（page-dates）
- **Excerpt**: "Console logs answer 'what did my code print.' A trace answers 'what was the page actually doing, what did the user-facing DOM look like at that instant, what requests were in flight...' That difference turns a 30-minute guessing session into a 30-second diagnosis. Crucially, traces are deterministic post-mortem artifacts. You do not need to reproduce the failure locally." "The DOM Time Machine... Click 'Before'... Click 'After'... Hover over any element to see the exact selector."
- **Context**: 时间轴本身也有分析价值："That massive bar eating up the first 613ms? That's your setup time... No overlapping bars means everything runs sequentially." 生态延伸：VS Code 插件、Chrome 扩展（把任意人工浏览会话录成 trace.zip）、Playwright 1.59 新增 `npx playwright trace` 纯文本 headless 消费（面向 CI 与 AI agent）。
- **Confidence**: 高

### Claim 3.3：对 agent 操作回放的借鉴要点（调研归纳）
- 每步动作节点挂"before/after 状态对"，而非只挂结果文本；
- 时间轴 bar 长度=耗时，一眼暴露慢步骤与串行瓶颈；
- 工件自包含、单文件、可拖拽打开、纯前端查看（数据不出浏览器=敏感信息友好）；
- 同一工件提供 GUI（人类）与 CLI 文本（AI agent 消费）两种投影。
- **Source**: 综合 3.1–3.2
- **Confidence**: 高

---

## 四、Agent 轨迹（thought→action→observation）结构化回放的产品案例与开源工具

### Claim 4.1：OpenHands trajectory visualizer：官方开源 Web 应用，上传/URL/base64 加载 trajectory JSON，时间轴区分 action（蓝）与 observation（灰/红），键盘导航
- **Source**: GitHub OpenHands/trajectory-visualizer README；托管实例
- **URL**: https://github.com/OpenHands/trajectory-visualizer ; https://trajectory-visualizer.all-hands.dev/
- **Date**: 2025-02-27（repo 更新）
- **Excerpt**: "The timeline shows: Actions (commands, edits, searches) in blue; Observations (messages, errors) in gray/red; Each step shows the timestamp, title, content, and any metadata; You can navigate through steps using arrow keys or clicking." 支持 `?fileUrl=` 加载 Gist/公网存储中的轨迹，支持 base64 内嵌 URL 分享。
- **Context**: OpenHands 核心即 event stream 架构（action-observation 对序列）。另有官方 issue #6049（2025-01-04）讨论 trajectory replay（按轨迹重放 action，假设环境确定性），并引用 SWE-agent 的 run_replay.py 作为先例。
- **Confidence**: 高

### Claim 4.2：SWE-agent 提供双形态 trajectory inspector（CLI pager + Web UI），.traj 文件逐步浏览、vim 键位、可跳转查看日志与文件；并支持 run-replay 重放轨迹做调试/演示
- **Source**: SWE-agent 官方文档（Trajectory inspector）；opendeep.wiki 中文 FAQ
- **URL**: https://swe-agent.com/latest/usage/inspector/ ; https://opendeep.wiki/SWE-agent/SWE-agent/faq
- **Date**: 文档现行（v1.x，2025）
- **Excerpt**: "Trajectories are the main output of SWE-agent... Use swe-agent inspect (or sweagent i) to open the command line inspector. Use swe-agent inspector (or sweagent I) to open the web inspector." 键位："H/L 切换轨迹，t 搜索，h/l 步进，v 切换详略，o 打开日志，e 在 $EDITOR 中打开文件。" 中文 FAQ："sweagent run-replay --traj_path <path>：重放轨迹文件以调试工具或创建演示。"
- **Context**: mini-swe-agent 附带 TUI inspector（textual 实现，源码公开可参考其"按 step 分组消息"算法：每个 assistant 消息/tool action 开新 step）。另有 traj-to-demo 工具把执行历史转成教学演示。学术生态中 Graphectory Viewer（arXiv 2608.17195）等以 SWE-agent inspector 为基线对比，说明其已是事实标准参照物。
- **Confidence**: 高

### Claim 4.3：Langfuse / LangSmith / AgentOps 等可观测平台的"agent graph + trace timeline"是结构化回放的商业化形态；AgentOps 主打 "time-travel debugging / session replay"
- **Source**: Langfuse 官方博客（agent observability）；AIMultiple 横评（含开销基准）；LangChain 官方资源
- **URL**: https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse ; https://aimultiple.com/agentic-monitoring ; https://www.langchain.com/resources/agent-observability
- **Date**: 2026-08-17；2026-08-11；2026-04-07（page-dates）
- **Excerpt**: Langfuse agent graph 双模式："Aggregated: A node is one unique step name, repeated calls collapse into a single node with a counter, loops drawn as cycles... Expanded ('as it ran'): every call is its own node and loops unrolled in execution order." AIMultiple 实测开销："LangSmith ~0%, Laminar 5%, AgentOps 12%, Langfuse 15%"。LangSmith："traces show the full execution tree: every LLM call, tool invocation, retrieval step, and the reasoning that connected them."
- **Context**: 对 agent canvas 的启示：① 提供"折叠结构视图"与"逐步展开视图"双模式以应对长轨迹；② 观测埋点尽量异步、采样，避免侵入执行路径（LangSmith 近 0 开销的架构）；③ 树状视图 + Gantt 时间轴 + 实时 WebSocket 推送是 Hermes agent 等开源项目也在自建的通用三层（追踪/存储/可视化）。
- **Confidence**: 高

### Claim 4.4：LangGraph time travel：每步持久化 checkpoint，`get_state_history` 遍历时间线，replay（原样重跑）与 fork（`update_state` 改状态后分叉）两种操作；checkpoint 前不重跑、之后真重跑（含 LLM 调用，非确定性）
- **Source**: LangChain 官方文档 use-time-travel（Python/JS）；LangSmith deployment API 文档
- **URL**: https://docs.langchain.com/oss/python/langgraph/use-time-travel ; https://docs.langchain.com/langsmith/human-in-the-loop-time-travel
- **Date**: 2026-06-11（page-date）
- **Excerpt**: "LangGraph supports time travel through checkpoints: Replay: Retry from a prior checkpoint. Fork: Branch from a prior checkpoint with modified state... Nodes before the checkpoint are not re-executed (results are already saved). Nodes after the checkpoint re-execute, including any LLM calls, API requests, and interrupts (which may produce different results)." "Every state change in a LangGraph agent creates a checkpoint... It's a debugger, an undo button, and an audit log all in one... Your UI can render this timeline and let users jump to any point."（官方前端文档原文）
- **Context**: 社区有 langgraph-replay（Devendra116/agent-replay-engine，2026-05-30）实现"录制每步到 SQLite、确定性回放（替换 LLM/工具响应，零 API 调用）、从任意 checkpoint fork"，dashboard 内建——是 time travel 用于回放的具体开源实现。类比金句："Time-travel debugging for agents is Redux DevTools for AI... Each checkpoint is a commit you can checkout."（akashnotes）
- **Confidence**: 高（官方文档）

---

## 五、"跳转到某一步查看当时产物/环境状态"（time travel）的实现思路

### Claim 5.1：三档实现路线（调研归纳）
1. **快照还原查看（确定性、不可继续执行）**：Playwright trace 的 before/after DOM；asciinema 用 headless vt 模拟器重放到 t 时刻得屏幕缓冲；OpenReplay 在回放时间点同步展示网络/console/store 状态面板。成本最低，对"查看当时产物"（文件内容、终端画面、页面 DOM）足够。
2. **状态 checkpoint + 重放续跑（LangGraph 模式）**：checkpoint 前不重复执行、之后真实重跑，支持 fork 改状态探索分支；代价是非确定性（LLM/外部环境可能变化），社区解法是把 LLM/工具响应一并录制做确定性回放（langgraph-replay）。
3. **全量环境 checkpoint（文件系统 + 进程，可恢复执行现场）**：学术论文 Crab（arXiv 2604.28138）：turn 边界 eBPF 观测副作用分级（无需/仅 FS/仅进程/全量 checkpoint），ZFS CoW 快照 + CRIU dump，checkpoint 成本与 LLM 等待窗口重叠隐藏；恢复状态表示为版本化 manifest `Ci=(Pj,Fk)`。商业实现如 tensorlake sandbox `checkpoint(CheckpointType.MEMORY)` 一键捕获 filesystem+memory+processes。
- **Source**: 综合；Crab 论文 https://arxiv.org/html/2604.28138v1（2026-04-30）；tensorlake 实践 https://pub.towardsai.net/building-stateful-ai-agents-that-survive-session-kills-e1877e3c78f0（2026-07-10）
- **Confidence**: 高（分级框架为归纳；各档均有具体出处）

### Claim 5.2：轻量务实方案——"事件流重放 + 按需产物快照"组合：终端用 cast 重放；每步产物（文件 diff / 命令输出 / 截图）作为结构化 artifact 挂在 step 节点上，点击 step 即展开
- **Source**: 综合 Claim 3.1（Playwright before/after 快照）、4.1（OpenHands 每步 timestamp/title/content/metadata）、4.3（Langfuse trace 上下文捕获）
- **Excerpt（佐证）**: Langfuse "Context is captured: the prompt version, retrieved documents, and everything else the model actually saw at each step."；Hermes agent 自建可观测栈提案（GitHub issue，2026-07-29）："树状视图：嵌套 span 层级；时间轴视图：Gantt 风格；实时流：WebSocket 推送轨迹更新；SQLite + WAL 存储 Trace/Span/Event，7 天 TTL。"
- **Context**: 对 agent canvas 的具体建议：step 节点数据模型 = {thought, action(command), observation(cast 区间 + artifacts), artifacts[{type: file-diff|screenshot|dom|network, payload}], state_snapshot_ref}；时间轴 UI 参考 Playwright trace；"跳转" = cast 事件流 seek + artifacts 直读，无需 CRIU 级重型方案即可覆盖 90% 查看诉求。
- **Confidence**: 高（作为设计综合）；具体实现未经原型验证（中）

### Claim 5.3：asciinema 3.0 已把"实时直播 + 落盘录制 + 服务器把直播转常规 recording"统一进一条管道，验证了"录制即实时管道旁路"的架构可行性
- **Source**: asciinema 官方博客 3.0 发布文；官方 streaming 文档
- **URL**: https://blog.asciinema.org/post/three-point-o/ ; https://docs.asciinema.org/manual/server/streaming/
- **Date**: 2025-09-15
- **Excerpt**: "asciinema CLI 3.0... a complete rewrite of asciinema in Rust, upgrading the recording file format, introducing terminal live streaming." "`asciinema session -o demo.cast -r -l`" 同时录制 + 远程直播 + 本地直播。"asciinema server can now record every live stream and turn it into a regular recording." 播放器带自适应缓冲："measures network latency in real-time and adjusts the buffer size constantly, aiming for a good balance between low latency and buffer-underrun protection." 流协议 = asciicast v3 over WebSocket（每条 JSON 行一个 WS text message），另有 ALiS 协议。
- **Context**: 这直接支持 agent canvas 的统一架构：CLI 节点一条 PTY 输出流 → WS 广播（实时围观）+ NDJSON 落盘（事后回放），实时与历史共用同一数据格式与播放器组件。
- **Confidence**: 高（官方一手来源）

---

## 附：检索覆盖清单（21 次独立搜索）

ttyd 架构与用法 / gotty 现状 / wetty 功能 / tmate 共享机制 / tmux+ttyd 组合 / xterm.js 性能与渲染器 / asciicast v2 官方 spec / asciinema 3.0 streaming / asciinema vs 视频对比（中/英）/ script·ttyrec·TermRecord 谱系（中）/ rrweb 快照+增量机制 / OpenReplay 架构与部署成本 / Playwright trace 格式与 UI（×3 不同角度）/ Playwright trace CLI / LangGraph time travel 官方文档（×2）/ LangGraph Studio/前端 time travel / agent sandbox checkpoint（Crab/tensorlake）/ agent 轨迹可视化（中/英，含 OpenHands、SWE-agent、Graphectory）/ agent 可观测平台横评（Langfuse/LangSmith/AgentOps）。

## 附：置信度与遗留问题

- 高置信：所有格式规范、官方功能描述、有原文摘录的产品能力。
- 中置信：ttyd/xterm.js 的精确延迟数字（无公开权威 benchmark，仅有"接近本地"的定性一致结论）；设计综合类建议（5.2）未经原型验证。
- 遗留：① xterm-headless 做 cast seek 重放的性能上限未实测；② asciicast v3 相对 v2 的完整 diff 未深入（v3 引入 delta timestamps 等）；③ GUI 类 agent 操作（非终端）的回放选型（rrweb vs 截图序列）本维度只覆盖了 rrweb 侧；④ ttyd 项目 2024-03 后发布节奏放缓（最后 release 1.7.7，2024-03；最后 commit 2025-07），长期维护风险需关注。
