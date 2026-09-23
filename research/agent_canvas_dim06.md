# Agent Canvas 维度 06：远程桌面/浏览器实时画面流与远程接管技术选型调研

> 调研范围：VNC + noVNC + websockify、WebRTC（mediamtx/Pion）、Kasm Workspaces/KasmVNC、Guacamole、x11vnc、CDP 截图流、Playwright 录制、Selenium 直播、DOM 重建（rrweb）；商业参考：Browserbase、Steel.dev、E2B、Anthropic computer use 参考实现、OpenAI Operator takeover。
> 调研方法：18 次独立搜索（中英文混合），优先官方文档、GitHub、工程博客。日期为页面标注/检索日期，置信度分 High/Medium/Low。

---

## 一、方案对比总表

| 维度 | VNC + noVNC + websockify | WebRTC（mediamtx/Pion/KasmVNC UDP） | CDP 截图流（Page.startScreencast） | DOM 重建（rrweb/Playwright Trace） |
|---|---|---|---|---|
| **端到端延迟** | 局域网 ~100–300ms，公网 300ms–1s+（TCP 帧缓冲） | 典型 200–500ms，优化管线实测 ~267ms；WHIP 推流 ~150ms | 帧率受限：实测仅约 5fps（headless 下 1fps），延迟 200ms–1s，只适合"近实时预览" | 非实时视频，事件流重放；live 模式秒级 |
| **带宽** | 中高（增量矩形 + Tight/JPEG；动态画面 1–10Mbps） | 中（H.264 视频编码，自适应码率，UDP） | 高（JPEG/PNG 帧，1080p 原始 RGBA ~8.29MB/帧，必须压缩） | 极低（全量快照 50–200KB JSON，增量事件每次数百字节） |
| **画质/保真** | 有损 JPEG 可调；KasmVNC 有 QOI 无损模式 | 视频编码有损，文字边缘略糊，但流畅 | 逐帧截图，静态画质最高 | "像素级"重建（非像素，重渲染），动画/Canvas/WebGL 还原度有限 |
| **实现成本** | 极低（3 个组件，几十行启动脚本；Anthropic/E2B/Selenium 官方镜像同款） | 高（信令、ICE/STUN/TURN、UDP 端口、编码器）；用 mediamtx 可降到中 | 低–中（Puppeteer/Playwright 几行 CDP 调用 + 转发） | 中（需注入 recorder、事件管道、自建 player UI） |
| **双向控制（接管）** | 原生支持（RFB 输入事件回传），view_only 一键切只读 | 视频单向，控制需另开 DataChannel/控制通道（如 WHIP + 自定义输入回传） | CDP Input domain 可注入输入，天然双向 | 基本只读（回放），不适合实时接管 |
| **适用范围** | 整个桌面（浏览器+终端+IDE 全可见），与 agent 控制通道（xdotool/CDP）解耦 | 同左，适合高帧率/弱网/多人观看 | 仅 Chromium 单页面/标签，非 Chromium 与跨标签需额外处理 | 仅 Web 页面（同域），跨域 iframe、原生 UI 不可见 |
| **典型场景** | computer-use 桌面可视化 + 人工接管（默认首选） | 多人围观、移动端观看、公网低延迟互动演示 | 浏览器 agent 的轻量内嵌"直播窗" | 事后回放、审计、轻量 watch mode |
| **商业佐证** | Anthropic computer-use-demo、E2B Desktop、docker-selenium、Browser Use WebUI | Kasm Workspaces（KasmVNC WebRTC UDP）、WHEP/WHIP 生态 | Browserbase/Steel 的 Live View 本质基于 CDP | Browserbase Session Replay（DOM 重建 + HLS）、Playwright Trace Viewer、Sentry/PostHog（rrweb） |

---

## 二、设计启示（5–8 条）

1. **默认走 noVNC + websockify + x11vnc/Xvfb 作为 MVP，这条路线被 Anthropic、E2B、Selenium、Browser Use WebUI 四方独立验证。** Anthropic 官方 computer-use-demo 容器就是 Xvfb + Mutter + tint2 + x11vnc + noVNC（端口 5900/6080）；E2B Desktop SDK 的 `stream.start()` 内部同样是 x11vnc + noVNC over WebSocket；docker-selenium 官方镜像内置 noVNC（7900 端口）。这不是"将就方案"，而是行业标准答案。升级路径是换 server 端为 **KasmVNC**（webp 省 30% 带宽、WebCodecs H.264/265/AV1、WebRTC UDP 传输、多用户权限 API、DLP 特性），协议层对前端几乎无感。

2. **watch ↔ takeover 不必自研输入锁：用"同一会话 + view_only 开关 + 应用层控制权仲裁"三段式。** VNC/RFB 天然共享同一 framebuffer，agent（xdotool/pyautogui）和人（noVNC 输入）看到的是同一个光标，不存在双光标冲突问题——真正的冲突是"双方同时操作"。工程解法：watch 模式下 viewer 用 `view_only=true`（noVNC RFB 属性、E2B `getUrl({viewOnly:true})`、Steel `interactive=true` iframe 参数均为此设计）；takeover 时控制权令牌转给人，**agent 侧操作要硬性失败**——ego-browser 的实现是最清晰的范本："user is controlling" 是一个 hard stop 错误，agent 不得重试、不得自动夺回，只能等用户显式确认后调 `takeOverTaskSpace` 恢复。会话保持的关键是 **handoff 不重启浏览器**（OpenAI 官方文档承认 takeover 后"may need to re-establish the run"，这是反模式；BrowserAct/Claw Browser 都以"同一会话续跑"为核心卖点）。

3. **凭证输入的隐私保护学 OpenAI Operator/ChatGPT agent 的做法：takeover 期间停止截图与录屏，而不是事后打码。** OpenAI 官方："While you control the browser, screenshots are not captured"。实现上：进入 takeover 即暂停 computer-use 循环的 screenshot 调用 + 暂停录制管道（录像暂停或遮罩），视觉上给用户明确的"隐私模式"指示。DOM 录制路线则可借鉴 rrweb 的 block/mask 选择器（`input[type="password"]` 默认屏蔽）。Anthropic 侧另有自动注入分类器：检测到截图中疑似注入内容时自动暂停并要求用户确认——可作为"watch mode 敏感站点加强监督"的参考。

4. **浏览器专用 agent 用"DOM/AxTree + SoM 标注截图"做 agent 的感知，用完整桌面流做人的观察，两者是并联不是二选一。** 给 LLM 的上下文走 AxTree + Set-of-Mark（可省 10–15x token、消除坐标幻觉）；给人的画布走 VNC/CDP 流。给人在画面上做"agent 正在看哪里"的标注，直接复用 SoM 的编号 bounding box 叠加层即可（browser-use、WebVoyager、Magentic-One 同源做法）。

5. **CDP `Page.startScreencast` 适合做"零额外进程"的浏览器内嵌预览，但不要指望它做高质量直播。** 社区实测约 5fps（headless 1fps），`page.screenshot()` 轮询更差（单次上百毫秒）。它的价值是：不装 Xvfb/x11vnc 就能从 headless Chromium 拿帧，适合 canvas 节点里的轻量 thumbnail/预览模式。要录像就用 `screencast → ffmpeg` 离线合成（puppeteer-screen-recorder 模式）或 Playwright `record_video`（结束后落盘 WebM）/ Trace Viewer（DOM 快照时间旅行），这些都不是实时流。

6. **公网/移动端/多人围观场景再引入 WebRTC，且优先借道 mediamtx（WHIP/WHEP）而不是自建 SFU。** mediamtx 单二进制、WebRTC 典型 <500ms、内置 ICE/STUN；KasmVNC 新版已内置 WebRTC UDP Transit + WebCodecs H.264/265/AV1，是"VNC 语义 + WebRTC 传输"的现成合体。注意工程成本点：UDP 端口不能走普通 HTTP 反代、NAT 严格环境需要 TURN、输入回传要另建通道（WebRTC DataChannel 或保留 WebSocket 控制面）——这正是"媒体面/控制面分离"架构。

7. **录制回放分两层交付：实时观看用流，事后审计用 DOM 重建。** Browserbase 是范式：Live View（实时、可交互、可 iframe 嵌入、断连发 `browserbase-disconnected` postMessage）+ Session Replay（DOM 重建，可导出 HLS/fMP4 嵌入自己产品，保留 31 天）。rrweb 证明 DOM 事件流比视频小几个数量级且可搜索/可程序化分析；Playwright Trace Viewer 证明"DOM 快照 + 动作时间线 + 点击位置高亮"是 debug agent 的最佳形态。Agent canvas 的"操作可视化节点"可以：直播=VNC/WebRTC，节点内时间轴回放=事件流重建。

8. **隔离与最小权限是底线而非加分项，且凭证绝不进 agent 环境。** Anthropic 官方四层防御：专用 VM/容器（最小权限）、不接触凭证/敏感文件、域名 allowlist、 consequential 动作人工确认。E2B 用 Firecracker microVM（独立内核，~150–200ms 启动）是托管标杆；Manus 即用 E2B Desktop。Kasm Workspaces 提供另一条路：容器化桌面 + 会话录屏 + SAML/OIDC + DLP（键盘/剪贴板限速与审计），社区版 5 并发免费可自托管验证。观察链接本身也要当凭证管：E2B stream 支持 `require_auth` + auth_key；VNC 原生 8 字符密码上限太弱（KasmVNC 因此改用完整用户名/密码 + HTTPS）。

---

## 三、证据条目（Claim / Source / URL / Date / Excerpt / Context / Confidence）

### A. VNC + noVNC + websockify 架构与佐证

**A1.**
- **Claim**: noVNC + websockify 是浏览器看远程桌面的标准最简架构：浏览器 ⇄(WebSocket)⇄ websockify ⇄(TCP)⇄ VNC server；websockify 纯转发字节不做渲染。
- **Source**: Medium 工程博客 "Why Browsers Don't Show Up in Docker (and How noVNC + websockify Fix It)"
- **URL**: https://medium.com/@Gayathri_krish/why-browsers-dont-show-up-in-docker-and-how-novnc-websockify-fix-it-1d5eb37569e3
- **Date**: 2025-12-13
- **Excerpt**: "websockify solves this by converting: WebSocket ⇄ TCP. It acts as a transparent bridge... websockify does no rendering. It just forwards bytes." 完整链路："Playwright Browser → Xvfb → Window Manager (Fluxbox) → x11vnc (:5900) → websockify (:8081) → noVNC (Browser UI)"
- **Context**: 针对"容器里跑 headed Playwright 如何可视化"的逐步教程，与 agent canvas 场景完全同构。
- **Confidence**: High

**A2.**
- **Claim**: Anthropic 官方 computer-use 参考实现就是 Xvfb + Mutter + tint2 + x11vnc + noVNC 的 Docker 容器，暴露 5900(VNC)/6080(noVNC)/8501(Streamlit)/8080(合并 UI) 四个端口；UI 有 "Toggle Screen Control" 按钮供人工接管调试。
- **Source**: GitHub anthropics/anthropic-quickstarts computer-use-demo README；ndurner.github.io 分析；laiso.hatenablog.com 日文拆解
- **URL**: https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/README.md ；https://laiso.hatenablog.com/entry/2024/10/23/194820
- **Date**: 2024-08-29（README 标注）/ 2024-10-23
- **Excerpt**: "it shows the essential agent loop running against a Linux desktop in Docker with X11 + VNC"；"xdotool to fake mouse & keyboard input, Xvfb to provide the offscreen desktop, Mutter as the window manager, tint2 as the panel/taskbar, and NoVNC"；"右上の「Toggle Screen Control (On)」ボタンを押すとデスクトップを操作できるようになります"
- **Context**: 业界最有影响力的 computer-use 参考架构；README 同时声明 "components are weakly separated... can only be used by one session at a time"，说明单会话设计的局限被官方承认。
- **Confidence**: High

**A3.**
- **Claim**: docker-selenium 官方镜像内置 Xvfb + x11vnc + noVNC（supervisord 拉起），7900 端口即 noVNC，支持 `SE_VNC_VIEW_ONLY=1` 只读模式；社区大量"直播 selenium 测试"实践。
- **Source**: docker-selenium README（best-of-web 镜像）; StackOverflow #78591277; zhoukekestar 中文笔记
- **URL**: https://best-of-web.builder.io/library/SeleniumHQ/docker-selenium ；https://stackoverflow.com/questions/78591277/
- **Date**: 2024-06-10 / 2025-03-29
- **Excerpt**: "This project uses noVNC to allow users to inspect visually container activity with their browser... Port 7900 is used to start noVNC"；compose 中 `SE_VNC_VIEW_ONLY=1`
- **Context**: "selenium 直播"问题的官方答案；view-only 环境变量证明只读观看是原生需求。
- **Confidence**: High

**A4.**
- **Claim**: x11vnc 直连现有 X 显示（:0/Xvfb）配置简单但重绘慢；TigerVNC/TurboVNC 性能更好，TurboVNC 在 3D/视频负载下只用 TightVNC 5–20% 的 CPU。
- **Source**: Manjaro 论坛讨论；TurboVNC 官方描述（fileeagle 镜像）
- **URL**: https://forum.manjaro.org/t/x11vnc-has-slow-redraw-reaction-while-tigervnc-server-on-a-new-display-is-much-faster/7414
- **Date**: 2020-08-19 / 2024-04-09
- **Excerpt**: "x11vnc is good for internal networks, but bad for connections over the internet unless you have a 100MBit connection"；"it compresses 3D and video workloads much better than TightVNC while using generally only 5-20% of the CPU time of the latter"
- **Context**: agent sandbox 里 x11vnc 的价值是"附着到已有 Xvfb 显示"，与 agent 的 xdotool 控制共享同一屏幕；性能短板在弱网才明显。
- **Confidence**: Medium（论坛经验性结论）

**A5.**
- **Claim**: KasmVNC 是 VNC 路线的现代化升级：webp 省 ~30% 带宽 + 动态画质再省 ~20%、多线程编码、WebCodecs H.264/H.265/AV1、WebRTC UDP Transit、QOI 无损（LAN）、打破 RFB 的完整用户名密码 + HTTPS、多用户权限 API、DLP（键盘/剪贴板限速与日志）。
- **Source**: GitHub kasmtech/KasmVNC README；Kasm 官网 kasmvnc 页；KasmVNC v1 发布稿（PRNewswire via VirtualBits）
- **URL**: https://github.com/kasmtech/KasmVNC ；https://www.kasmweb.com/kasmvnc
- **Date**: 2020-09-13（repo）/ 2022-12-02（v1 发布）
- **Excerpt**: "Webp image compression for better bandwidth usage... WebCodecs video streaming with H.264, H.265, and AV1 support... WebRTC UDP Transit... Multi-User support with permissions that can be changed via the API"；"KasmVNC uses username and password with unrestricted size and complexity. The VNC protocol by standard only supports a maximum of an 8 character password"
- **Context**: KasmVNC 自带 web 客户端与 websocket，可替代 x11vnc+websockify+noVNC 三件套；v1 明确 "breaking from the RFB specification"，需注意与标准 VNC 客户端的兼容性取舍（前端用其自带 web client 则无影响）。
- **Confidence**: High

**A6.**
- **Claim**: E2B Desktop SDK 的 `stream.start()` 本质是 x11vnc + noVNC over WebSocket，支持 `require_auth` + auth_key、窗口级流（window_id）、`getUrl({viewOnly:true})` 只读链接；沙箱为 Firecracker microVM。
- **Source**: PyPI e2b-desktop；DeepWiki e2b-dev/desktop；E2B 官方 docs computer-use 页
- **URL**: https://pypi.org/project/e2b-desktop/ ；https://deepwiki.com/e2b-dev/desktop ；https://e2b.dev/docs/use-cases/computer-use
- **Date**: 2025-07-26 / 2026-08-11
- **Excerpt**: "VNC Streaming | `stream.start()` | x11vnc + noVNC setup"；"Get the stream auth key... Print the stream URL"；"Start VNC streaming for browser-based viewing: `await sandbox.stream.start()`"
- **Context**: 证明"商业化 agent 沙箱"也把 noVNC 作为交付层；Manus 被报道使用 E2B Desktop（27 个工具）。
- **Confidence**: High

### B. WebRTC 低延迟路线

**B1.**
- **Claim**: mediamtx（原 rtsp-simple-server）单 Go 二进制支持 RTSP/RTMP/HLS/WebRTC/SRT 互转，WebRTC 典型延迟 <500ms；WHIP 推流 / WHEP 拉流是标准化对接方式。
- **Source**: mediamtx 官网；brightcoding 评测 FAQ；ThingsBoard 文档
- **URL**: https://mediamtx.net/ ；https://blog.brightcoding.dev/2026/06/07/stop-wrestling-with-ffmpeg-mediamtx-is-the-zero-dependency-streaming-server-you-need
- **Date**: 2026-07-31 / 2026-09-03（页面日期）
- **Excerpt**: "WebRTC: Sub-second (200-500ms typical)"；"WebRTC latency sits below 500ms in typical deployments"；"The browser POSTs an SDP offer to a WHEP URL, the server returns an SDP answer... The media that follows is what travels over UDP. Because UDP cannot be reverse-proxied like HTTP, WebRTC requires you to expose a UDP port directly"
- **Context**: 工程注意点：UDP 端口暴露、TURN 需求；适合"多人围观/公网低延迟"而非默认内网场景。
- **Confidence**: High

**B2.**
- **Claim**: 实测 mediamtx WebRTC 管线端到端 ~267ms（720p，无推理基线），HD 30fps 下稳定维持 ~500ms。
- **Source**: MDPI Computers 论文 "Low-Latency Autonomous Surveillance... Hybrid RTSP-WebRTC Architecture"
- **URL**: https://www.mdpi.com/2073-431X/15/1/62
- **Date**: 2026-01-16
- **Excerpt**: "The measured latency was approximately 267 ms, which is consistent with an optimized WebRTC pipeline... consistently achieved end-to-end latencies on the order of 500 ms for HD streams at 30 FPS"
- **Context**: 学术测量，比厂商宣称更可信；对照组显示 "HLS or JPEG image transmission via WebSocket exhibited significantly higher latencies"——即 JPEG-over-WebSocket（CDP 截图流思路）延迟显著更差。
- **Confidence**: High

**B3.**
- **Claim**: Pion（Go WebRTC 栈）适合把 WebRTC 能力编译进 agent 端；已有远程桌面项目（Overlord）用 Pion 做 browser↔agent P2P + MediaMTX WHIP/WHEP 中继双模式，并显式做媒体面/控制面分离。
- **Source**: GitHub vxaboveground/Overlord README；techatoq 架构对比
- **URL**: https://github.com/vxaboveground/Overlord ；https://techatoq.net/understanding-video-streaming-application-architecture
- **Date**: 检索于 2026-07
- **Excerpt**: "WebRTC P2P: browser ↔ agent direct... WebRTC Relayed: agent publishes to a MediaMTX sidecar via WHIP, browser plays via WHEP"；对比表 "Pion | Go | High | Building custom, high-performance media servers in Go."
- **Context**: 证明 P2P 直连 + WHIP/WHEP 中继的工程组合已有人落地；Pion 约 6MB Go 依赖。
- **Confidence**: Medium（单个开源项目佐证）

**B4.**
- **Claim**: Kasm Workspaces 全链路只用 HTTPS + WebSocket（容器会话经 kasm_proxy 的 WebSocket，HTML5 Canvas 渲染），渲染引擎是 KasmVNC；支持会话录屏、SAML/OIDC、API、Docker/K8s 水平扩展；社区版 5 并发免费。
- **Source**: Kasm 官方开发者文档 Reference Architecture；GitHub kasmtech/workspaces-machine-learning；DigitalOcean marketplace
- **URL**: https://docs.kasm.com/docs/develop/explanations/reference-architecture/planning-and-design ；https://github.com/kasmtech/workspaces-machine-learning
- **Date**: 2021-05-26 / 检索 2026-07
- **Excerpt**: "Browser opens a WebSocket stream via kasm_proxy to the container... Session is rendered client-side inside the browser tab (HTML5 Canvas)... container is destroyed; no persistent state remains"；"The rendering of the graphical-based containers is powered by the open-source project KasmVNC"
- **Context**: 商业级"浏览器里看隔离桌面"的完整平台；若不想自研调度层可直接评估 Kasm CE。
- **Confidence**: High

### C. Guacamole 与 CDP 截图流

**C1.**
- **Claim**: Guacamole 是协议无关网关：guacd（C 守护进程）把 VNC/RDP/SSH 翻译成 Guacamole 协议，Web 应用只懂 Guacamole 协议；容量经验值约 1 CPU 核 + 2GB 内存 / 25 并发用户。
- **Source**: Apache Guacamole 官方文档 Implementation and architecture；Apache 邮件列表性能测试
- **URL**: https://guacamole.apache.org/doc/gug/guacamole-architecture.html ；https://lists.apache.org/thread/zdlsnn2br4gvtx09q6zqtxym6dwlrjwc
- **Date**: 2018-03-07（性能帖）/ 文档持续更新
- **Excerpt**: "guacd is the heart of Guacamole which dynamically loads support for remote desktop protocols... neither the Guacamole client nor the web application need to be aware of what remote desktop protocol is actually being used"；"a typical server should be fine so long as roughly 1 CPU core and 2 GB of memory are available for every 25 concurrent users at peak"
- **Context**: 若 canvas 同时要支持 RDP/SSH/终端，Guacamole 是比 noVNC 更通用的网关；但视频播放时 guacd 单线程可达 100% CPU（同帖报告），不适合高帧率场景。
- **Confidence**: High

**C2.**
- **Claim**: CDP `Page.startScreencast` 由浏览器合成器在画面变化时推帧，远优于 `page.screenshot()` 轮询（单次上百毫秒），但实际帧率有限——社区实测约 5fps、headless 仅 1fps；适合预览与离线录像合成，不适合流畅直播。
- **Source**: GitHub puppeteer issue #478；StackOverflow #71437739；funfish 中文博客；dev.to "Streaming Browser Execution Video Feeds"
- **URL**: https://github.com/puppeteer/puppeteer/issues/478 ；https://stackoverflow.com/questions/71437739/ ；https://dev.to/programmingcentral/streaming-browser-execution-video-feeds-to-frontend-react-components-the-ultimate-guide-to-3613
- **Date**: 2022-03-11 / 2023-10-27 / 2026-08-06
- **Excerpt**: "I experimented with startScreencast() but I was only able to get about 5fps... On headless mode I got only 1 fps"；"一次耗时上百毫秒，所以推荐用 startScreencast 来获取每一帧的数据"；"the browser engine itself pushes JPEG or PNG encoded frames directly out of the compositor thread whenever a visual change occurs... A single 1920x1080 frame in uncompressed RGBA format consumes approximately 8.29 megabytes"
- **Context**: `maxFramesInFlight`/`screencastFrameAck` 机制自带背压；puppeteer-screen-recorder 用此 API + ffmpeg 离线合成视频。
- **Confidence**: High

**C3.**
- **Claim**: Playwright 的可视化资产是"事后"导向：record_video 在 context 关闭时才落盘 WebM；Trace Viewer 是 DOM 快照时间旅行（before/action/after 三态快照 + 点击位置高亮）；1.59 起 tracing 支持 `live: true` 实时写入。
- **Source**: Playwright 官方文档 videos / trace-viewer；TestDino 博客
- **URL**: https://playwright.dev/docs/videos ；https://playwright.dev/docs/trace-viewer ；https://testdino.com/blog/playwright-trace-viewer
- **Date**: 检索 2026-07（1.59 特性）
- **Excerpt**: "Videos are saved upon browser context closure at the end of a test"；"Playwright captures a set of complete DOM snapshots for each action... highlights both, the DOM Node as well as the exact click position"；"Playwright 1.59 added a live option to tracing. When enabled, the trace file updates in real time"
- **Context**: 定位：回放/审计，不是实时接管通道。Trace 单文件 10–50MB，全量开启成本高。
- **Confidence**: High

### D. 商业产品参考（Browserbase / Steel / E2B / OpenAI）

**D1.**
- **Claim**: Browserbase Live View 可 iframe 嵌入、支持 watch/click/type/scroll 实时交互，官方定位含 "delegate credentials - give control to the end user"；断连通过 `browserbase-disconnected` postMessage 通知宿主；Session Replay 走 DOM 重建并可按 HLS（fMP4）流式嵌入，保留 31 天。
- **Source**: Browserbase 官方文档 features/session-live-view；observability 文档；Session Replay API 博客
- **URL**: https://docs.browserbase.com/features/session-live-view ；https://docs.browserbase.com/platform/browser/observability/observability ；https://www.browserbase.com/blog/session-replay
- **Date**: 2026-05-14 / 2026-09-18
- **Excerpt**: "Human in the loop - instantly take control or provide input: handle iframes... delegate credentials - give control to the end user"；"Browserbase doesn't capture the webpage as a video. Rather, it uses the DOM to reconstruct the session"（data4ai 转述）；"you can curl a Browserbase session and get back HLS"
- **Context**: "实时交互用流 + 回放用 DOM 重建"双轨制的最佳商业范本；竞品 Kernel 用 MP4 回放（保真度更高）作差异化。
- **Confidence**: High

**D2.**
- **Claim**: Steel.dev（开源）提供 debugUrl + `?interactive=true&showControls=true` iframe 参数实现 HITL 接管，官方文档明确场景：登录凭证输入、CAPTCHA、纠偏；底层 Puppeteer/CDP，支持 Puppeteer/Playwright/Selenium 接入。
- **Source**: Steel 官方文档 human-in-the-loop；GitHub steel-dev/steel-browser
- **URL**: https://docs.steel.dev/overview/sessions-api/human-in-the-loop ；https://github.com/steel-dev/steel-browser
- **Date**: 2024-11-01（repo）/ 2026-06-12（docs）
- **Excerpt**: "interactive=true: Enables users to interact with the page through clicks, scrolling, and form inputs"；"Enter sensitive information like login credentials / Solve CAPTCHAs / Verify or correct automated actions"
- **Context**: 开源自托管可直接抄的 HITL 实现；注意 issue #72 显示开源版与云版 live-player 路由有差异。
- **Confidence**: High

**D3.**
- **Claim**: OpenAI Operator/ChatGPT agent 的 takeover 设计：敏感输入（登录/支付/CAPTCHA）主动请用户接管，**takeover 期间不采集、不截图**；敏感站点有 watch mode 强制监督；重大动作前需用户确认。
- **Source**: OpenAI 官方 Introducing Operator；OpenAI 帮助中心 ChatGPT agent 文档
- **URL**: https://openai.com/index/introducing-operator/ ；https://help.openai.com/en/articles/11752874-chatgpt-agent
- **Date**: 2025-01-23 / 2026-09-22（帮助页更新）
- **Excerpt**: "Takeover mode: Operator asks the user to take over when inputting sensitive information... When in takeover mode, Operator does not collect or screenshot information entered by the user"；"While you control the browser, screenshots are not captured, which helps protect passwords and other sensitive data you enter. After you complete the required step and return control, the agent attempts to continue from the prior workflow state; in some cases it may need to re-establish the run"
- **Context**: 隐私遮罩的行业基准做法；"re-establish the run" 说明即使 OpenAI 也没完全解决会话续跑，值得在自研时针对性优化。
- **Confidence**: High

**D4.**
- **Claim**: 商业 HITL 接管的工程共识：同一会话内 handoff（不重启浏览器）、agent 暂停等待、人完成后续跑；ego-browser 给出最严格的控制权协议——"user is controlling" 是 hard stop，agent 禁止重试/禁止自动夺回。
- **Source**: Scrapfly HITL 博客；Tessl registry ego-browser skill 文档；BrowserAct 博客；Claw Browser README（openclawdir）
- **URL**: https://scrapfly.io/blog/posts/human-in-the-loop-cloud-browsers ；https://tessl.io/registry/skills/github/citrolabs/ego-lite/ego-browser ；https://openclawdir.com/plugins/claw-browser-rkcgsh
- **Date**: 2026-07-24 / 2026-08-16
- **Excerpt**: "Keep the browser session alive with a persistent session ID... Treat the human step as a handoff in the same session, not as a restart"；"A 'user is controlling' error is a hard stop on the whole task — not an obstacle to route around... Never call takeOverTaskSpace on your own to grab control back"；"Human takeover via live UI + VNC stream; Shared continuity so both act on the same browser state"
- **Context**: 直接回答"输入锁/会话保持"问题：控制权是应用层互斥令牌，传输层（VNC）保持共享。
- **Confidence**: High

### E. 网页 agent 专用：SoM 标注 vs 完整桌面流

**E1.**
- **Claim**: Set-of-Mark（SoM）在截图上给可交互元素叠加编号 bounding box，LLM 回复元素编号而非像素坐标，消除坐标幻觉；WebVoyager、AndroidWorld M3A、Magentic-One、browser-use 均采用 SoM 或等价机制。
- **Source**: AndroidWorld 论文（arXiv 2405.14573）；WebVoyager 解读（LinkedIn/AIBrains）；Scrapeless SoM 指南
- **URL**: https://arxiv.org/html/2405.14573v3 ；https://www.linkedin.com/pulse/understanding-agents-browser-webvoyager-aibrains-lexyf ；https://www.scrapeless.com/en/wiki/what-is-set-of-mark-prompting
- **Date**: 2024-10-22 / 2025-02-28
- **Excerpt**: "a Set-of-Mark (SoM) annotated screenshot, which includes bounding boxes with numeric labels on the top-left corner for each UI element... The agent attempts to execute outputted action by referencing the specific mark"；"numbered screenshots replace vague coordinate descriptions with short references"
- **Context**: 对人的画布可视化同样适用：把 agent 的 SoM 标注层直接渲染在直播画面上，人就能看到 agent 的"注意力"。注意 marks 与帧绑定，滚动/导航后必须刷新。
- **Confidence**: High

**E2.**
- **Claim**: agent 感知层的成本对比：AxTree 比原始 DOM 省 10–15x token；混合策略（截图 + 简化 DOM/AxTree）是 browser-use、AgentQL 等生产级 browser agent 的主流；纯视觉（computer-use 式）通用性最强但每帧 1000–1600 视觉 token、只能看视口内内容。
- **Source**: dozaldevs 工程博客；kunwar.page "GUI-as-API pattern"；callmissed.com 深度分析
- **URL**: https://www.dozaldevs.com/blog/why-your-browser-automation-is-breaking-the-dom-is-too-big-for-ai ；https://www.kunwar.page/chapter/134-computer-use-and-browser-agents-vision-interaction-and-the-gui-as-api-pattern ；https://www.callmissed.com/blog/computer-use-agents-how-they-work-and-why-building-them-is-so-hard
- **Date**: 2025-12-09 / 2026-05-31
- **Excerpt**: "This single technique delivers 10x to 15x context reduction. That 150,000-token Amazon page becomes a manageable 10,000-token semantic map"；"Hybrid (DOM + screenshot)... This is the approach used by browser-use, AgentQL, and most production browser agents"
- **Context**: 结论：给模型看 SoM/AxTree，给人看完整画面流——双通道并行，而非用同一路流服务两者。
- **Confidence**: Medium（工程博客，多处交叉一致）

### F. DOM 重建 / 录制回放

**F1.**
- **Claim**: rrweb 用"全量 DOM 快照 + MutationObserver 增量事件"实现无视频文件的像素级回放，事件为 JSON（全量 50–200KB，增量数百字节），比视频小几个数量级且可搜索/可编程分析；内置隐私能力：block 选择器、文本打码、子树忽略。Sentry/PostHog/OpenReplay 均基于它。
- **Source**: rrweb 官网 glossary；Bright Coding rrweb 深度文；Temps session-replay 原理文；HN 讨论（rrweb maintainer）
- **URL**: https://rrweb.com/glossary/session-replay ；https://www.blog.brightcoding.dev/2025/09/01/record-and-replay-user-sessions-on-the-web-a-deep-dive-with-rrweb ；https://news.ycombinator.com/item?id=41030862
- **Date**: 2024-07-22（HN）/ 2026-03-12 / 2026-09-20
- **Excerpt**: "Because the recording is data, a replay can be paused, scrubbed, sped up, filtered, or analyzed programmatically, and a full session is typically orders of magnitude smaller than a video of the same length"；"Block selectors (input[type=\"password\"], .cc-number). Mask text with asterisks. Ignore entire subtrees (data-rrweb-ignore)"
- **Context**: 局限：同源 iframe 才能录制，跨域 iframe/Canvas/WebGL 还原受限；只适合 Web 页面，不适合整桌面。定位为回放层而非直播层。
- **Confidence**: High

### G. 安全与隔离

**G1.**
- **Claim**: Anthropic 对 computer use 的官方安全基线是四层：专用 VM/容器最小权限、不给凭证与敏感文件、网络域名 allowlist、consequential 动作人工确认；且默认启用截图 prompt-injection 分类器，命中时自动暂停并要求用户确认。
- **Source**: Anthropic computer-use 文档的二手引用（williamspurlock.com 全文转述）；inventivehq.com 指南；aiwiki.ai 汇总
- **URL**: https://williamspurlock.com/blog/anthropic-computer-use-claude-3-5-sonnet-new/ ；https://inventivehq.com/blog/claude-computer-use-guide ；https://aiwiki.ai/wiki/anthropic_computer_use
- **Date**: 2024-10-22 / 2026-06-06 / 2026-06-21
- **Excerpt**: "classifiers will automatically run on your prompts to flag potential instances of prompt injections. When these classifiers identify potential prompt injections in screenshots, they will automatically steer the model to ask for user confirmation"；Sonnet 4.5→4.6 浏览器注入基准成功率从 49.36%→1.29%（无外部防护），但 "sandboxing, explicit confirmation, and credential isolation are still the recommended baseline"
- **Context**: "watch mode 对敏感站点加强监督"可直接借用此分类器思路；数据说明模型层防护不能替代工程隔离。
- **Confidence**: High

**G2.**
- **Claim**: 隔离原语选型：E2B 用 Firecracker microVM（独立内核，<200ms 启动，Manus 用于 27 个工具的虚拟电脑）；Kasm 用 Docker 容器 + 会话结束即销毁；docker 容器共享内核弱于 microVM，需按威胁模型选择。
- **Source**: vantaige.io E2B 分析；dev.to agent 工具链文；Kasm Workspaces GitHub
- **URL**: https://vantaige.io/ai-tool/e2b ；https://dev.to/anmolbaranwal/open-source-toolkit-for-building-ai-agents-in-2026-55h1 ；https://github.com/kasmtech/workspaces-machine-learning
- **Date**: 2026-03-17 / 2026-05-21
- **Excerpt**: "Each sandbox is an isolated Linux environment powered by Firecracker microVMs... meaning each execution gets a dedicated lightweight kernel rather than sharing one with neighboring tenants"；"Session ends; container is destroyed; no persistent state remains"
- **Context**: agent canvas 的 sandbox 层若在自有机房，Kasm（容器）够用；若跑不可信任务或多租户，microVM 级隔离更稳。
- **Confidence**: High

**G3.**
- **Claim**: 只读/只看模式的现成实现点：noVNC RFB 对象 `viewOnly` 属性（禁止输入事件回传）；E2B `getUrl({viewOnly:true})`；docker-selenium `SE_VNC_VIEW_ONLY=1`；elgalu/selenium 默认 view_only 防误操作。
- **Source**: CSDN noVNC RFB API 详解；PPIO E2B 接入文档；Docker Hub neotys/docker-selenium
- **URL**: https://blog.csdn.net/gitblog_00218/article/details/148392886 ；https://ppio.cn/docs/sandbox/integrate-e2b-desktop ；https://hub.docker.com/r/neotys/docker-selenium
- **Date**: 2025-02-20 / 2025-06-03
- **Excerpt**: "viewOnly：只读模式，禁止输入事件（默认false）"；"获取只读模式的 VNC 访问地址（禁用用户交互）：desktop.stream.getUrl({ viewOnly: true })"；"now is read-only by default so you don't mess with the tests accidentally"
- **Context**: watch mode 的实现就是一行参数；takeover = 切换该参数 + 应用层控制权令牌转移。
- **Confidence**: High

**G4.**
- **Claim**: KasmVNC/Kasm Workspaces 提供企业级 DLP 与审计：键盘输入限速与日志、剪贴板方向/大小限制、屏幕可见区域遮蔽（concealed_region）、会话录屏——可用于"凭证输入时的隐私遮罩"与合规审计。
- **Source**: GitHub kasmtech/KasmVNC README + 配置示例（gitea 镜像）
- **URL**: https://github.com/kasmtech/KasmVNC
- **Date**: 2020-09-13 起持续更新（检索 2026-07）
- **Excerpt**: "Data Loss Prevention features: Key stroke logging, Clipboard logging, Max clipboard transfer size..., Keyboard input rate limit, Screen region selection"；配置含 `data_loss_prevention.visible_region.concealed_region: allow_click_down: false`
- **Context**: concealed_region 是"画面局部遮罩"的服务端实现，比前端 CSS 遮挡更可靠（遮罩发生在编码前）。
- **Confidence**: High

---

## 四、未决问题与备注

1. **Steel/Browserbase Live View 的底层传输细节未获官方确认**（CDP screencast vs WebRTC vs 私有协议）；多份二手资料指向 CDP 系实现，置信度 Medium。
2. **WebRTC 输入回传通道**（DataChannel 键鼠注入到 Xvfb/CDP）缺少成熟开源参考实现，Overlord 项目是最接近的案例，需进一步验证。
3. **VNC 多人同时观看的带宽放大**（每客户端独立编码）在 KasmVNC 多线程下缓解，但 50+ 围观者场景更适合 WebRTC SFU 扇出，未找到针对 agent 场景的现成压测数据。
4. 部分来源日期为页面抓取标注（2026 年），个别博客内容为厂商营销性质（BrowserAct、Kernel 对比文），已在 Context 中注明，仅取其机制描述不取其排名结论。
