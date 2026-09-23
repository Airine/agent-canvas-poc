# 4. 操作可视化节点

操作可视化节点是第 2 章活窗的第二类典型实例，与第 3 章产物节点并列。它承载 agent 的「手」：computer use 桌面、浏览器操作、CLI/bash 任务三类执行现场，需要同时回答三个问题——实时画面用什么流送出来、观察（watch）与接管（takeover）如何切换、历史操作如何回放。本章的调研结论可以概括为一条决策主线：画面流按场景路由而非单选，控制权用「共享会话 + 应用层令牌」两段实现，回放走事件流重建而非录屏——其中「回放基于事件流重建」是 Manus `?replay=1`、Devin Timelapse、OpenHands event-stream 与 asciinema/rrweb/Playwright trace 三条独立证据线收敛出的高置信行业共识。

## 4.1 实时画面流方案选型

### 4.1.1 MVP 标准答案：noVNC + websockify + x11vnc/Xvfb

画面流选型不应从零权衡，因为 MVP 路线已被四方独立验证为事实标准：Anthropic 官方 computer-use 参考实现的容器就是 Xvfb + Mutter + tint2 + x11vnc + noVNC 的组合，暴露 5900（VNC）与 6080（noVNC）端口，并在 UI 上提供「Toggle Screen Control」按钮供人工接管调试[^111^]；E2B Desktop SDK 的 `stream.start()` 内部同样是 x11vnc + noVNC over WebSocket，并额外提供 `getUrl({viewOnly:true})` 只读链接与 `require_auth` 鉴权[^112^]；docker-selenium 官方镜像内置 noVNC（7900 端口）并支持 `SE_VNC_VIEW_ONLY=1` 只读模式[^113^]；Browser Use WebUI 的社区直播方案亦收敛于同一栈[^114^]。整条链路只需三个组件、几十行启动脚本：浏览器经 WebSocket 连 websockify，websockify 透明转发字节到 VNC server，不做任何渲染。

当 MVP 遇到带宽与多用户瓶颈时，升级路径是替换 server 端为 KasmVNC 而非换协议：webp 编码省约 30% 带宽、WebCodecs 支持 H.264/H.265/AV1 硬解、WebRTC UDP 传输、多用户权限 API，以及打破 RFB 8 字符密码上限的完整用户名/密码 + HTTPS 认证[^115^]。由于 KasmVNC 自带 Web 客户端，前端迁移成本接近于零。

### 4.1.2 场景路由：WebRTC、CDP screencast 与 DOM 重建的分工

VNC 不是万能答案。四种流方案在延迟、带宽、接管能力上各有明确边界，正确做法是按场景路由：

| 维度 | VNC + noVNC + websockify | WebRTC（mediamtx/KasmVNC UDP） | CDP screencast | DOM 重建（rrweb 等） |
|---|---|---|---|---|
| 端到端延迟 | 受控网络实测 noVNC 约 54 ms [^116^]；公网受拉取式协议约束，帧率上限 ≈1/RTT，150 ms RTT 下更新率降约 10 倍，体验落入数百毫秒–秒级 [^117^] | 典型 200–500 ms，优化管线实测约 267 ms [^118^][^119^] | 200 ms–1 s，实测约 5 fps、headless 仅 1 fps [^70^] | 非实时，live 模式秒级 [^120^] |
| 带宽 | 中高且随画质档可调：TurboVNC 官方数据为 5 Mbps 宽带可传 10–12 百万像素/秒（降质可用），感知无损档需 50–100 Mbps 级网络 [^121^] | 中，H.264 自适应码率 [^118^] | 高，1080p 原始 RGBA 约 8.29 MB/帧，必须压缩 [^122^] | 极低，全量快照 50–200 KB，增量数百字节 [^120^] |
| 画质 | 有损 JPEG 可调，KasmVNC 有 QOI 无损 [^115^] | 视频编码有损，文字边缘略糊 | 逐帧截图，静态画质最高 [^70^] | 重渲染而非像素，Canvas/WebGL 还原受限 [^120^] |
| 实现成本 | 极低，3 组件几十行脚本 [^111^] | 高，信令/ICE/TURN/UDP 端口；借道 mediamtx 降至中 [^118^] | 低–中，几行 CDP 调用 [^70^] | 中，需注入 recorder 与自建 player [^120^] |
| 接管能力 | 原生双向，view_only 一键切只读 [^112^][^113^] | 视频单向，输入需另建 DataChannel/控制通道 [^118^] | CDP Input domain 可注入输入 [^70^] | 基本只读 [^120^] |
| 适用场景 | computer-use 桌面可视化 + 人工接管（默认首选） | 公网多人围观、移动端低延迟演示 | 浏览器 agent 的轻量内嵌预览 | 事后回放、审计 |

从表中可以读出三个路由规则。其一，延迟谱系呈明显的对数分布（见图 `agent_canvas_sec04_stream_replay.png` 右）：终端字符流（xterm.js + WebSocket，10–50 ms）比一切画面流低一个数量级，WebRTC 与局域网 VNC 同处十至百毫秒档，CDP screencast 与公网 VNC 则落入秒级上限——这解释了为何 CDP screencast 只能承担第 2 章降级阶梯中的「心跳帧（近实时预览）」角色，而不能作为专注模式的主画面。其二，接管能力与延迟几乎负相关：延迟最低的 DOM 重建完全只读，而原生双向的 VNC 恰是延迟可接受区间内的唯一双向方案，这从技术上锁定了「takeover 必须发生在 VNC 会话上」的结论。其三，WebRTC 的代价是工程复杂度而非性能：UDP 端口无法走普通 HTTP 反代、严格 NAT 环境需要 TURN、输入回传要另建通道，即媒体面/控制面分离架构——因此它应作为「公网多人围观」的增量能力（借道 mediamtx 单二进制，WHIP 推流/WHEP 拉流），而非默认路径[^118^]。

![回放格式体积量级（左）与实时画面/终端延迟量级（右）对比](agent_canvas_sec04_stream_replay.png)

## 4.2 Watch ↔ Takeover 控制权切换

### 4.2.1 三段式：同一会话 + view_only 开关 + 控制权令牌

第 2 章已确立「专注模式 = 视觉全屏化 + 交互权限申请」的双维模型，takeover 是交互权限申请的最典型实例。工程上它不需要自研输入锁，而是三段式拼装：第一，VNC/RFB 天然共享同一 framebuffer，agent（xdotool/pyautogui）与人（noVNC 输入）看到同一光标，不存在双光标冲突，真正的冲突只是「双方同时操作」；第二，watch 模式就是一行参数——noVNC RFB 的 `viewOnly` 属性、E2B 的 `getUrl({viewOnly:true})`、docker-selenium 的 `SE_VNC_VIEW_ONLY=1` 均为此设计[^112^][^113^]；第三，takeover 时应用层控制权令牌转给人，且 **agent 侧操作必须硬性失败**。ego-browser 的控制权协议是最清晰的范本：「user is controlling」是一个 hard stop 错误，agent 不得重试、不得路由绕过、不得自动调 `takeOverTaskSpace` 夺回，只能等用户显式确认归还[^123^]。这条「硬性失败不夺回」语义应实现在 harness 层（让 agent 的工具调用直接返回失败），而非写在提示词里——后者无法对抗模型在长任务中的重试倾向。

### 4.2.2 凭证隐私：接管期间停止截图与录屏

第二条安全语义是「凭证不可见」。行业基准做法来自 OpenAI Operator/ChatGPT agent：takeover 期间不采集、不截图——官方文档原文为「While you control the browser, screenshots are not captured, which helps protect passwords and other sensitive data you enter」[^61^]。注意其实现要点是**前置断流而非事后打码**：进入 takeover 即暂停 computer-use 循环的 screenshot 调用、暂停录制管道，并在视觉上给出明确的「隐私模式」指示；DOM 录制路线则可借鉴 rrweb 的 block/mask 选择器（`input[type="password"]` 默认屏蔽），KasmVNC 更进一步提供服务端 `concealed_region` 画面区域遮蔽——遮罩发生在编码之前，比前端 CSS 遮挡可靠[^115^][^120^]。会话连续性方面，商业 HITL 的工程共识是 handoff 不重启浏览器：保持同一会话、agent 暂停等待、人完成后续跑[^124^]；OpenAI 文档承认 takeover 后「may need to re-establish the run」恰是待优化的反模式[^61^]。

### 4.2.3 辅助认证/登录：凭证不进 agent 环境

辅助认证场景的安全边界应前移到凭证生命周期：凭证从不进入 agent 环境，而非进入后再遮罩。browser-use 的 `sensitive_data` 机制提供了可直接复用的范式——敏感值以 placeholder 形式出现在提示词与日志中，真实值仅在执行输入动作时由 harness 本地注入[^125^]；Steel 的 `?interactive=true` Live View 与 Browserbase 的「delegate credentials」则把「登录、CAPTCHA、凭证输入」明确列为人工接管的标准场景[^126^][^127^]。登录完成后 cookie/会话状态保留在原浏览器会话中归还 agent 继续使用——这正是 4.2.2 节「同一会话 handoff」的自然推论，也意味着 cookie 无需也不应被导出到 agent 的文件系统。

## 4.3 终端任务与历史回放

### 4.3.1 实时终端：xterm.js + WebSocket 事实标准

CLI/bash 节点的实时画面不需要任何视频技术：ttyd（C 单二进制）、wetty、tmate Web 端全部收敛到 xterm.js + WebSocket 同一架构[^128^]。延迟构成 = WebSocket RTT + xterm.js 渲染（VS Code 官方优化后可达 60 fps，单帧 <16 ms），同机房下用户侧延迟低于 10 ms，比任何画面流低一至两个数量级（见图右）；多个独立来源的定性结论一致为「接近本地」，虽无权威 benchmark 数字[^129^]。实现上可直接内嵌 xterm.js、后端复用 ttyd 做 PTY→WS 桥；tmux 语义（会话在服务端存活、客户端随时 attach/detach）则天然匹配「agent 长时间 CLI 任务 + 人类随时围观」的拓扑[^128^]。

### 4.3.2 回放格式：字符流、事件流与 DOM 快照的分工

回放路线的核心权衡是体积、可检索性与可跳转性，四条路线的量化对比如下：

| 回放路线 | 体积（5 分钟会话） | 可检索 | 可跳转 | 实现成本 | 适用面 |
|---|---|---|---|---|---|
| 录屏视频（MP4/WebM） | 大，数十 MB [^130^] | 无（像素） | 仅时间轴拖拽，帧级粗 | 低（ffmpeg） | 通用画面，含 GUI |
| asciinema 字符流 | 极小，数十 KB（约为视频 1/100~1/1000）[^130^] | 强，纯文本可 grep/索引 | marker 章节 + 事件级 seek [^8^] | 低，现成 CLI + player，格式可自生成 | 仅终端 |
| 事件流重建（keystroke/action JSON） | 极小 | 强，结构化 JSON | 强，精确到 action | 中，需确定性模拟器重放 [^131^] | 终端 + 结构化 agent 步骤 |
| DOM 快照 + 增量（rrweb） | 中，快照 50–200 KB + 单次交互增量 200–500 B [^120^] | 强，JSON | 强，事件级 + skip-inactivity | 中，引入 rrweb 三件套 | 网页/DOM 界面 |

图 `agent_canvas_sec04_stream_replay.png` 左的对数坐标直观呈现了这一差距：字符流与事件流比视频小约三个数量级，rrweb 居中，Playwright trace.zip（含每步 DOM 快照与截图，实测 10–50 MB[^132^]）因自包含而接近视频量级。三个设计含义随之成立。第一，asciicast v2 的 NDJSON 结构（header + `[time, type, data]` 事件行）简单到几十行代码即可自生成，且 marker 事件天然支持章节跳转[^8^]；「跳转到 t 时刻」的工程实现就是把 [0, t] 事件喂进一个 headless 终端模拟器（asciinema player 内建的 Paul Williams ANSI parser 即此原理）重建屏幕缓冲[^131^]。第二，字符流的可检索性对 agent 场景有独特价值——可以直接 grep 某条命令出现在哪些历史会话，这是像素视频永远无法提供的能力。第三，asciinema 3.0 已验证「录制 = 实时管道旁路 tap」：`asciinema session -o demo.cast -r -l` 一条命令同时本地直播、远程直播、落盘录制，服务端可把直播流转为常规 recording[^133^]——这意味着实时围观与历史回放共用同一数据格式与播放器组件，不需要两套系统。

### 4.3.3 Playwright trace viewer 范式与 agent 轨迹回放

回放 UI 的最佳范本是 Playwright trace viewer：单个自包含 trace.zip 内含动作时间轴、每个动作的 before/after DOM 快照、截图 filmstrip、网络瀑布、console 与源码定位，可拖进浏览器纯前端打开（数据不出浏览器，对敏感操作审计友好）[^132^][^134^]。它被好评的根本原因是「确定性 post-mortem 工件」——无需复现失败现场即可完成诊断[^134^]。agent 侧已有同构产品：OpenHands trajectory visualizer 以 action（蓝）/observation（灰/红）时间轴呈现轨迹并支持键盘导航[^135^]，SWE-agent inspector 提供 CLI + Web 双形态逐步浏览 .traj 文件[^136^]。落到操作可视化节点，回放界面的具体形态应为：主时间轴 scrubber 承载结构化 thought→action→observation 序列，每个 step 节点挂 before/after 状态对——终端屏幕缓冲区间（cast 事件段）、文件 diff、浏览器 DOM 快照、网络日志作为「富媒体附件」点击展开；时间轴 bar 长度编码耗时，一眼暴露慢步骤。结构化工单是主索引，字符流与 DOM 快照是从属证据，三者体积都足够小，可以全量常驻。

### 4.3.4 Time travel 三档实现：快照还原查看→checkpoint 重放→全量环境 checkpoint，按实施价值密度递进

「跳到某一步看当时环境状态」有三档实现，实施成本依次递增，落地顺序应按价值密度递进——即先做成本最低、已能覆盖绝大多数诉求的一档。第一档快照还原查看（成本最低，先做）：Playwright trace 的 before/after DOM、asciinema 屏幕缓冲重建均属此类——确定性查看、不能继续执行，但已覆盖「看当时产物」的绝大多数诉求[^132^]。第二档 checkpoint 重放（LangGraph 模式）：每步持久化 checkpoint，checkpoint 前不重跑、之后真实重跑，支持 fork 改状态探索分支；代价是 LLM 与外部环境的非确定性，社区解法是把模型/工具响应一并录制做确定性回放[^9^]。第三档全量环境 checkpoint（最后做）：Crab 论文给出学术范本——turn 边界按副作用分级（无需/仅文件系统/仅进程/全量），ZFS CoW 快照 + CRIU 进程 dump，checkpoint 成本与 LLM 等待窗口重叠隐藏[^137^]。三档的共性地基是 append-only 事件日志：实时管道旁路落盘（4.3.2）、每步产物快照（4.3.3）与环境 checkpoint 只是同一事件溯源架构上逐步加重的三个投影档位。
