# herdr spike 报告 — socket API 能力边界实证

日期：2026-09-22 ｜ 环境：Debian 12, Linux x86_64（沙箱，无 Rust 工具链、无真实 agent CLI）
产出目录：`/mnt/agents/output/spike/`（`herdr-api.schema.json`、`events-sample.jsonl`、`herdr_client.py`、`events_subscribe.py`、本报告）

---

## 1. 安装

- 版本：**herdr 0.9.1**（stable channel，protocol 22，schema_version 1）
- 方式：GitHub Releases 预编译单二进制 `herdr-linux-x86_64`（26.2 MB，static-pie 无依赖）。
  - 直连 github.com 下载仅 ~20 KB/s 且多次超时；改用 `gh-proxy.com` 代理 ~1 MB/s 成功。
  - 最新 release：v0.9.1（2026-09-16），资产含 linux-x86_64 / linux-aarch64。
- 坑：`/mnt/agents` 是 FUSE portal 挂载，**不可执行**（chmod +x 后仍 Permission denied），二进制需放到 `/home/kimi/bin/herdr`。
- 验证：`herdr -V` → `herdr 0.9.1` ✓

## 2. 起服务

- `setsid nohup herdr server &`（headless 模式；裸 `herdr` 是 TUI，沙箱不可用）。
- socket 出现：`~/.config/herdr/herdr.sock`（API）+ `herdr-client.sock`（client 复用通道）+ `herdr-server.log`。✓
- 会话持久化到 `~/.config/herdr/session.json`（每 5s 落盘），server 重启后工作区可恢复。

## 3. 协议导出

- `herdr api schema --json` ✓（注意 `--json` 与 `--output PATH` **互斥**，同用报 usage error；用重定向保存）。
- 已存至 `herdr-api.schema.json`（277 KB，JSON Schema 2020-12）。
- **103 个 method**，覆盖 workspace/tab/pane/agent/events/plugin/layout/worktree/notification/integration 全控制面。

## 4. CLI 走查（全部实测）

| 操作 | 结果 |
|---|---|
| `workspace create --label` | ✓ 返回完整 JSON（workspace/tab/root_pane 对象，id 形如 `w1` / `w1:t1` / `w1:p1`） |
| `tab create --workspace w1` | ✓ |
| `pane split w1:p2 --direction right` | ✓（CLI 无 `--workspace` 参数，以目标 pane 定位） |
| `pane run <id> <cmd>` | ✓ 跑 60s ticker 正常；本质是向 shell 注入命令行 |
| `pane read --source visible/recent/recent-unwrapped/detection` | ✓ 四种源均可用；`--format ansi` 保留完整转义序列；`--lines 0` 返回空（不是"全部"）；不传 `--lines` 默认 80 行；`--lines 100000` 可取全量 scrollback（默认上限 10 MB/pane） |
| `pane send-text` + `pane send-keys Enter` | ✓ 向 `read -p` 提示符输入并验证回显生效 |
| `pane read --raw` | CLI 默认已是纯文本；socket 层永远是 JSON 信封 |

## 5. agent 语义

- `agent start --kind` 支持 25 种真实 CLI（pi/claude/codex/gemini/kimi/qwen/copilot/opencode…），**无纯 shell kind**；沙箱无这些二进制，`agent start` 在 pane 里执行命令后超时（`{"error":{"code":"timeout"}}`），pane 里留下 `pi: command not found`。
- 替代路径：`pane report-agent`（socket: `pane.report_agent`）可外部上报 agent 生命周期 —— 这正是 Web canvas 适配层该用的接口：
  - `report-agent --state working/blocked` → `agent list/get` 状态同步更新 ✓
  - **坑1**：report 的 state 只接受 `idle|working|blocked|unknown`，**拒绝 `done`**；但对未检测到真实进程的 agent 上报 `idle`，状态会被归一化为 **`done`**（实测 working→idle 后 `agent get` 显示 done）。
  - **坑2**：`agent wait --until idle` 永远等不到字面 idle（因为被映射成 done）；不带 `--until` 默认匹配 idle/done/blocked，可正常返回 ✓
- `agent read/wait/get/list/rename/focus/prompt/send-keys` 均存在于 API；`events.wait` **目前只支持 agent status 匹配**（其他 match 报 `unsupported_event_wait_match`）。

## 6. 事件订阅（重点结论）

连接方式：Unix socket NDJSON，请求 `{"id","method","params"}`，一行一消息。
订阅：`events.subscribe` + 27 种订阅类型（schema 实测枚举）：

```
workspace.{created,updated,metadata_updated,renamed,moved,reordered,closed,focused}
worktree.{created,opened,removed}
tab.{created,closed,focused,renamed,moved}
pane.{created,closed,updated,focused,moved,exited,agent_detected}
pane.output_matched / pane.agent_status_changed / pane.scroll_changed   ← 带 payload 的三兄弟
layout.updated
```

实测（原始样本见 `events-sample.jsonl`）：

- 信封两种风格混用：三兄弟用点分 `"event":"pane.agent_status_changed"`，其余用下划线 `"event":"workspace_created"`。payload 均含完整对象快照（如 workspace_created 带整个 workspace 对象）。
- `pane.agent_status_changed` payload：`{pane_id, workspace_id, agent, agent_status, title?, display_agent?, state_labels?}`，推送延迟实测 **~100 ms**。
- `pane.scroll_changed` payload：`{pane_id, workspace_id, scroll:{offset_from_bottom, max_offset_from_bottom, viewport_rows}}` —— 只在滚动位置变化时发，**不携带内容**，不能当输出流用。
- `pane.output_matched`：按 substring/regex 匹配，payload 带 `matched_line` + 一份 `read` 快照。**一次性触发**（实测命中后再次产生匹配行 24s 内不再触发），做连续 watch 需每次命中后重新订阅。
- 订阅连接是长连接，多个订阅复用一条连接；事件与响应按行混合下发。

## 7. 实时输出流路径（最关键决策）

### a. socket 流式输出订阅 —— ✗ 不存在

103 个 method + 27 种订阅中**没有任何持续输出流**。`pane.output_matched` 是匹配触发且一次性；`pane.scroll_changed` 无内容。结论：herdr 0.9.1 的 socket API 不提供 PTY 流转发。

### b. `pane.read` 轮询 —— ✓ 可行，推荐主路径

- 往返延迟实测 **0.8–1.1 ms**（每次新建连接的开销已计入），`session.snapshot` 0.5–0.6 ms。轮询成本极低。
- **无 cursor/offset 增量参数**：`PaneReadParams` 只有 `source/lines/format/strip_ansi`；响应里的 `revision` 字段恒为 0（pane.list 里恒为 1），0.9.1 未实现增量读，不能当游标用。
- 可行策略：每个活跃 pane 以 2–5 Hz 轮询 `visible`（`--format ansi`），全量快照推给 xterm.js 重绘；40 行 ×120 列快照只有几 KB，1ms 延迟下 5 Hz 完全无感。低成本增强：先 0.5ms 轮 `pane.list` 比较文本哈希/活动时间再决定是否 read（注意 revision 不可靠，需自己 hash）。
- 折衷：`pane.wait_for_output`（regex/substring + timeout）是服务端阻塞原语，实测输出出现即返回（<1s 内，事件驱动），适合做"有变化再读"的长轮询触发器，但 match 是必需参数，且命令行回显会自匹配（需用不出现在命令行里的 pattern 或 regex 负向构造），当通用变更检测器用比较勉强。

### c. 文件旁路 tap —— ✓ 可行，适合存档/审计，不适合实时画面

- pane 内跑 `script -f /tmp/tap.log`：实时落盘 ✓（含原始 ANSI），外部 `tail -f` 可读；延迟为 script 的 flush 粒度（实测亚秒级）。
- 缺点：侵入 pane（占用 shell）、每 pane 一个文件、ANSI 原样含控制序列需清理；对"命令 stdout 落文件"场景直接 `cmd > f 2>&1` 更干净。
- 定位：日志归档/审计的好补充，不作为 xterm.js 数据源。

### d. 延迟/体验对比

| 路径 | 延迟 | 保真度 | 实现成本 | 结论 |
|---|---|---|---|---|
| a. 流式订阅 | — | — | — | 不存在 |
| b. read 轮询 2–5 Hz | 200–500 ms 级刷新 | 屏幕快照级（含 ANSI） | 低 | **推荐主路径** |
| b'. wait_for_output 长轮询 | <1s（仅匹配行） | 行级 | 中 | 辅助：等待特定完成标志 |
| c. 文件 tap | 亚秒–秒级 | 流级（原始 ANSI） | 中 | 仅做日志归档 |

**决策：Web canvas 的 pane 画面用「`pane.read(visible, ansi)` 轮询 + xterm.js 全量重绘」；agent 状态/生命周期用「`events.subscribe` 事件驱动」；等待特定输出用「`pane.wait_for_output` / `output_matched` 订阅（每次重订）」。** 若未来需要真流式，绕过 herdr API 直接旁路 PTY（c 案或 fork herdr 加 output stream subscription —— Apache-2.0 允许）。

## 8. 多会话/远程

- `herdr --session test2 server` → 独立 socket `~/.config/herdr/sessions/test2/herdr.sock` ✓，workspace 列表与默认会话完全隔离 ✓。命名会话 = 天然的租户/项目隔离单元。
- 另有 `--remote <ssh-target>` / `--machine` 走 SSH 接远端 herdr server（未实测，沙箱无远端）。

## 9. 对 canvas 控制面架构的建议

**连接模型（关键）**：herdr socket 对普通请求是**一请求一连接**（响应后服务端立即关闭，复用连接第二个请求会 BrokenPipe）；只有 `events.subscribe` 是长连接。Adapter 必须实现为「每次调用新建 Unix 连接（~1ms，无需连接池）+ 一条独立订阅连接（断线重连 + 重订阅）」。

Adapter 需封装的最小方法集：

```
# 结构
workspace.create/list/close        tab.create/list/close
pane.split/close/list/get          layout.export（如需还原布局）
# 执行与输入
pane.send_input(text/keys)         pane.run（=send_input 的封装，沙箱 CLI 验证过）
# 输出
pane.read(pane_id, source=visible|recent, format=ansi, lines)
pane.wait_for_output(pane_id, match, timeout)   # 长轮询/完成检测
# agent 语义（无真实 agent CLI 时的主接口）
pane.report_agent(pane_id, source, agent, state)  # working/blocked/idle(→done)
agent.list/get/wait(until=[done,blocked,...])
# 事件（一条长连接）
events.subscribe([pane.agent_status_changed, pane.exited, workspace.*, tab.*, pane.created/closed, layout.updated])
```

状态同步策略：**事件驱动为主（agent 状态、生命周期、布局），轮询为辅（pane 画面 2–5 Hz）**。事件 payload 自带全量对象快照，基本不需要回查；轮询只服务 xterm.js 画面。

## 10. 坑与 0.x 不稳定点清单

1. **一请求一连接**（最易踩，文档未明示）。
2. `revision` 字段全链路是桩（read=0、list=1），无增量读、无游标。
3. `pane.output_matched` 订阅一次性；命令行回显会自匹配 pattern。
4. `events.wait` 只支持 agent status 匹配，其余报 `unsupported_event_wait_match`。
5. `report-agent` 拒绝 `done` 状态；对无真实进程的 agent 报 `idle` 会被映射成 `done` → `agent wait --until idle` 永远超时。
6. 事件命名不一致：三个 pane 推送事件用点分，其余用下划线（`workspace_created` vs `pane.agent_status_changed`）。
7. shell 退出即 pane 自动关闭（`pane.exited`），后续对该 pane 的调用报 `pane_not_found`。
8. `api schema --json --output` 互斥报错文案不友好；CLI 各子命令参数与 socket 参数不完全对齐（如 split 无 --workspace）。
9. server 启动时向外抓取 agent 检测 manifests（herdr.dev/agent-detection/*.toml），离线环境会失败但不影响核心功能。
10. `/mnt/agents` FUSE 不可执行（沙箱特有）；GitHub 直连慢需代理（环境特有）。
11. protocol 版本化（v22）+ ping 返回 capabilities，说明 API 面还在演进，升级时需重新核对 schema。

**总体结论**：herdr 0.9.1 的 socket API 作为「agent 编排控制面」能力完备（结构、输入、状态、事件俱全、亚毫秒延迟），作为「终端画面数据面」只有快照轮询一条路 —— 对 Web canvas + xterm.js 场景够用（200–500ms 刷新体验），但做不了真正的流式终端。
