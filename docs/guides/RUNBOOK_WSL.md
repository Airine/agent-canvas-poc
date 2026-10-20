# RUNBOOK_WSL — 在 WSL2 里跑通 Agent 画布全栈 + 真实 herdr

日期：2026-09-23 ｜ 验证环境：Windows 11 + WSL2（Ubuntu 26.04.1 LTS, x86_64）+ Node v22.22.1

## 结论

全栈已跑通：herdr server（NDJSON socket）、Hono API（:3000）、Vite（:5173）均在 WSL 内运行，
Windows 浏览器经 WSL2 localhostForwarding 直接访问 `http://localhost:5173/`（页面）与
`http://localhost:3000/api/*`（API），`POST /api/graph/run` 能在 herdr 里真实创建工作区/pane。

## 架构与路径

- Windows 编辑主副本：`C:\Users\Arron\Desktop\Kimi_Agent_Agent画布PoC\app`（改代码只改这里）
- WSL 运行副本：`/root/agent-canvas`（WSL 默认用户是 root；普通用户则为 `~/agent-canvas`）
- herdr socket：`~/.config/herdr/herdr.sock`（即 `/root/.config/herdr/herdr.sock`）
- 日志：`/tmp/herdr.log`、`/tmp/api.log`、`/tmp/vite.log`

> 为什么不在 WSL 里直接用 Windows 的 node_modules：node_modules 含平台相关二进制
> （esbuild、rollup 原生模块），Windows 版在 Linux 下无法加载。实测 WSL 副本独立
> `npm install` 后得到 `@esbuild/linux-x64`、`@rollup/rollup-linux-x64-gnu`，可用。

## 一次性安装步骤

```bash
# 1) 进 WSL（默认 root）
wsl.exe -d Ubuntu

# 2) 装 Node（Ubuntu 26.04 apt 自带 Node 22，满足 >= 20）
apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm
node -v   # v22.22.1

# 3) 同步项目副本（排除 node_modules / 构建产物）
rsync -a --exclude node_modules --exclude dist --exclude dist-api \
  "/mnt/c/Users/Arron/Desktop/Kimi_Agent_Agent画布PoC/app/" ~/agent-canvas/

# 4) herdr 加执行权限
chmod +x ~/agent-canvas/bin/herdr && ~/agent-canvas/bin/herdr -V   # herdr 0.9.1

# 5) 修 lock 文件里的 registry（见"坑 1"），再装依赖
cd ~/agent-canvas
sed -i "s|https://npm.mirrors.msh.team/|https://registry.npmmirror.com/|g" package-lock.json
npm install --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5
```

## 日常启动 / 停止

```bash
# 启动（三个进程，顺序无关；api 启动时会自动 ensureServer 拉起 herdr）
wsl.exe -d Ubuntu -e bash -lc 'setsid nohup ~/agent-canvas/bin/herdr server > /tmp/herdr.log 2>&1 < /dev/null &'
wsl.exe -d Ubuntu -e bash -lc 'cd ~/agent-canvas && setsid nohup npm run dev:api > /tmp/api.log 2>&1 < /dev/null &'
wsl.exe -d Ubuntu -e bash -lc 'cd ~/agent-canvas && setsid nohup npm run dev > /tmp/vite.log 2>&1 < /dev/null &'

# Windows 浏览器打开 http://localhost:5173/

# 停止（见"坑 4"：pkill 模式别写成会匹配到自己命令行的样子）
wsl.exe -d Ubuntu -e bash -lc 'pkill -f "node_modules/.bin/tsx"; pkill -f "node_modules/.bin/vite"; pkill -x herdr'
# 或按 PID 精确杀：pgrep -a node / pgrep -a herdr 后 kill <pid>
```

## 验证命令（本次实测输出摘要）

```bash
# a) herdr 协议（一请求一连接）
python3 - <<'EOF'
import socket,json
s=socket.socket(socket.AF_UNIX); s.settimeout(5)
s.connect("/root/.config/herdr/herdr.sock")
s.sendall(json.dumps({"id":"t1","method":"workspace.list","params":{}}).encode()+b"\n")
print(s.recv(65536).decode())
EOF
# → {"id":"t1","result":{"type":"workspace_list","workspaces":[]}}
# 完整走查（create/split/send_input/read/report_agent/close）全部通过，
# pane.read 实测读到执行结果 HERDR_POC_42。

# b) API
curl -s http://localhost:3000/api/graph
# → {"nodes":[{"id":"n-coord","type":"coordinator",...}], ...}（demo 图 JSON）
# api 日志：[api] Agent Canvas control plane on http://localhost:3000 / [api] herdr server ready

# c) Vite
curl -s http://localhost:5173/          # → <!doctype html><html lang="zh-CN">...
curl -s http://localhost:5173/api/graph # → 200（vite 代理到 :3000）

# d) Windows 侧（localhostForwarding）
curl.exe -s http://localhost:3000/api/graph   # → demo 图 JSON
curl.exe -s http://localhost:5173/            # → 首页 HTML

# e) 端到端
curl -s -X POST http://localhost:3000/api/graph/run    # → {"ok":true}
# herdr 侧随即出现 workspace：{"workspace_id":"w2","label":"agent-canvas",...,"agent_status":"working"}
curl -s -X POST http://localhost:3000/api/graph/reset  # → {"ok":true}
```

## 代码改动清单（唯一一处）

| 文件 | 改动 | 原因 |
|---|---|---|
| `app/vite.config.ts` | `server.port` 3000 → 5173，并新增 `proxy`：`/api` → `http://localhost:3000`、`/ws` → `ws://localhost:3000`（`ws:true`） | 原配置 vite 与 Hono API 都抢 :3000（vite 实测被挤到 :3001）；前端用相对路径 `/api`、`/ws` 请求，dev 模式下没有代理会 404。改动已写入 Windows 主副本并同步到 WSL 副本。 |

`app/api/**` 未做任何改动。

## 坑与解决办法

1. **lock 文件指向内网 mirror**：`app/package-lock.json` 里 228 个 `resolved` URL 是
   `https://npm.mirrors.msh.team/...`，WSL 里 DNS 解析失败（ENOTFOUND）导致 npm install 中断。
   办法：只在 WSL 副本里 sed 替换 registry 域名。另实测 `registry.npmjs.org` 在 WSL 里慢且会
   socket timeout（~2.7s/请求），`registry.npmmirror.com` ~0.75s/请求，故最终替换为 npmmirror。
   **注意**：下次从 Windows 重新 rsync 后需重跑这条 sed。
2. **`session.ping` 不是合法 method**：herdr 0.9.1 里 ping 方法名就是 `ping`。
   `herdr-adapter.ts` 的 `ping()` 先试 `session.ping` 失败再走 `workspace.list` 兜底，
   功能正常（多一次无效往返），未改代码。
3. **WSL 后台进程**：`wsl.exe -e bash -lc '... setsid nohup CMD &'` 启动的进程在 wsl.exe
   退出后能存活（herdr/api/vite 均实测存活）；但**同步**跑的长命令被宿主超时杀掉后，进程可能
   随之终止。npm install 这类长任务失败重跑即可（缓存累积，断点续传式推进）。
4. **`pkill -f` 自杀**：`bash -lc` 的整段命令文本会出现在自身 cmdline 里，
   `pkill -f vite` / `pkill -f "node_modules/.bin/vite"` 会把执行 pkill 的 shell 一起杀掉
   （exit code 15）。要么用更精确的模式（如 `pkill -x herdr`），要么 pgrep 拿 PID 再 kill。
5. **vite 端口冲突**（已修，见改动清单）：不修的话 vite 被挤到 :3001，且 `/api` 无代理 404。
6. **api 静态托管警告**：`serveStatic: root path '/root/agent-canvas/dist' is not found`
   属正常——dev 模式前端由 vite 提供；`npm run build` 后 api 可直接托管 dist（生产模式）。

## 复现 checklist

- [ ] `rsync` 主副本 → `~/agent-canvas`（排除 node_modules）
- [ ] 重跑坑 1 的 sed（package-lock.json registry）
- [ ] `npm install`（WSL 副本内）
- [ ] `chmod +x bin/herdr`（rsync 会带权限，一般不用重做）
- [ ] 三个启动命令 → 浏览器开 `http://localhost:5173/`

---

## 复验记录 #2 — 多 workspace 改造 + Zone→tab 映射（2026-09-23）

对象：registry.ts / graphs/*.json（ws-demo、ws-etl、ws-research 三个种子）/ Zone=herdr tab 的新链路。
结论：**全链路通过**，但真实 herdr 复验抓出 3 个 bug，均已修复并回落 Windows 主副本（两侧 diff 一致）。

### tab.create 真实协议（schema + 实测双重确认）

- 参数：`{workspace_id, label, focus, cwd?, env?}`——**是 `label` 不是 `title`**（TabCreateParams，
  tools/legacy/spike/herdr-api.schema.json）。herdr 0.9.1 对未知字段**静默忽略不报错**：adapter 原来发 `title`，
  调用"成功"但 tab 标签退化为自动编号 `'2' '3' '4'`。
- 响应：`{type:"tab_created", tab:{tab_id,...}, root_pane:{pane_id,...}}`——adapter 推断的
  `tab.tab_id` / `root_pane.pane_id` 取值路径**正确**，未动。
- `tab.list {workspace_id}` → `{type:"tab_list", tabs:[TabInfo]}`，TabInfo 含
  `tab_id/workspace_id/number/label/focused/pane_count/agent_status`。

### 修复清单（3 处，均在 Windows 主副本并同步 WSL）

| 文件 | 改动 | 症状 → 根因 |
|---|---|---|
| `app/api/herdr-adapter.ts` | tabCreate 线协议 `title` → `label` | 每 zone 一个 tab 成功但标签是数字 → herdr 静默忽略未知字段 |
| `app/api/registry.ts` | load() 新增 `sanitizeLoadedGraph()`：载入的图强制 runState=idle、节点回 queued、清 paneId/progress/approval 等运行态 | tsx watch 重启后 reset 返回 ok 但 runState 永远卡在 running、run 幂等守卫永久空转 → GraphStore 的 `initial` 快照取自脏的持久化图，reset() 深拷贝 initial 等于没重置 |
| `app/api/coordinator.ts` | startNode 命令加 `CANVAS_RUN_DIR=${ctx.runDir}` 前缀 | n-data 永不进 waiting（审批门超时自杀 exit 1）、outbox/progress 全丢 → 脚本标记写 `${CANVAS_RUN_DIR:-/tmp/canvas-run}` 顶层，coordinator 轮询 `<RUN_ROOT>/<wsId>` 子目录，只有 .exit（coordinator 自己 printf 的）落在正确位置 |

### 复验证据链（修复后，ws-demo 全程）

1. `POST /api/workspaces/ws-demo/run` → herdr 侧 `w2 agent-canvas:ws-demo`，**4 tab**：
   `w2:t1 '1'`（workspace.create 自带默认 tab，root pane 闲置）+ `w2:t2 '准备'` / `w2:t3 '执行'` / `w2:t4 '交付'`
   （每 zone 一个 tab，中文标签正确）。
2. pane 归属实测：`n-env` 用 zone 首 pane；`n-data`/`n-report` 同在 '执行' tab（第二个节点 split 到同 tab
   `w2:p5`）——"首 pane 复用 + 后续 tab 内 split"策略与实现一致。
3. 状态流转（poll 实测）：
   `n-env running→completed`；`n-data queued→waiting（"将写入 128 条记录"）→ 审批放行 →completed`；
   `n-report failed`（report-gen.sh **故意 exit 1**）→ error route 激活 → `n-fail completed`；
   `n-chat` 由 n-data 完成触发 → `completed`；终态 `runState=done`、coord completed。
4. 数据面：弱边速率实时更新（`6 msg/min`、`14 msg/min`）；事件流含
   `approval granted → write committed: 128/128 → dataset published -> artifact://canvas/dataset/v1`。
5. `POST .../reset` → runState=idle、全员 queued、herdr `workspace.list` 为空（工作区+tab+pane 全清）。

### 操作备注

- 审批端点是 `POST /api/nodes/:id/approval`，作用于 **active workspace**（`GET /api/workspaces/:id`
  会 touch 置为 active），多 workspace 下先 GET 再审批。
- 自动轮询+审批脚本留存于 `tools/legacy/render-preview/poll-run.py`（WSL 里 cp 到 /tmp 跑，避免 bash 引号嵌套）。
- 种子工作区只有两个带脚本的拓扑会真跑（NODE_SCRIPTS 只映射 demo 图的 4 个节点）；
  ws-etl / ws-research run 只会建 herdr 结构、节点保持 queued（非 bug，设计如此）。

---

## 复验记录 #3 — PoC 最终全链路验收（2026-09-23）

对象：通用节点执行模型（node.command > NODE_SCRIPTS > 交互 shell 兜底）、scoped 端点、
三个种子全部可真实运行。**验收通过，服务保持运行。**

### A. 三个种子运行终态（全部 runState=done，~14–22s/个）

| workspace | 终态 | 设计内异常 | 审批门 | 弱边速率实测 |
|---|---|---|---|---|
| ws-demo | env/data/chat/fail/coord completed | n-report **failed**（report-gen.sh 故意 exit 1）→ error route → n-fail completed | n-data「将写入 128 条记录」放行 | 6 / 14 msg/min |
| ws-research | 全部 completed | 无 | n-compare「确认功能对比矩阵结论」放行 | 7 / 3 msg/min |
| ws-etl | 全部 completed | 无 | n-load「确认写入生产数仓」放行 | 7 msg/min |

每个种子的 herdr 侧均实测：`agent-canvas:<wsId>` 工作区 = 1 默认 tab + 3 个 zone tab
（中文 label 正确），节点 pane 归属对应 zone tab（同 zone 第二节点 tab 内 split）；
reset 后图回全 queued / runState=idle / herdr `workspace.list` 为空。

### B. 交互 shell parity（临时 ws-aace6191，测完已清理）

- 无 command 节点 → 兜底 `bash --norc -i` 在 pane `w6:p2` 真实运行。
- scoped input `echo PARITY_$((40+2))` → pane.read 快照出现 `PARITY_42` ✓
  （画布打字 → 真实 PTY → 回显链路通）。
- input `exit` → 节点 completed (exit 0)、runState=done ✓（wrapper `.exit` 推导，非 pane.exited）。
- 清理：reset → 删 `api/data/workspaces.json` → `touch api/index.ts` 触发 tsx 重播种 →
  注册表恢复 3 种子全 idle，无脏数据。

### C. Herdr 能力对照表（✓=有实测证据）

| # | 能力 | 结果 | 证据 |
|---|---|---|---|
| 1 | 每节点一个真实 PTY pane | ✓ | pane.list 可见逐节点 pane 与 agentId（如 w4:p3=ag-compare-01） |
| 2 | 终端内容流式可见 | ✓ | WS term 推送 6 次/4.3s（2Hz 轮询、变化才推），快照逐行增长 |
| 3 | 可注入输入 | ✓ | B 项 PARITY_42 回显；审批 'go' 经 input 到达 stdin |
| 4 | agent/pane 状态映射 | ✓ | working→完成后报 idle 归一化为 done；blocked→waiting 正确 |
| 5 | zone→tab 结构 | ✓ | tab.list：准备/执行/交付、调研/分析/产出、抽取/转换/加载 |
| 6 | 多 workspace 并存 | ✓ | GET /api/workspaces 三种子同列，各自独立 run/reset |
| 7 | run/reset 生命周期 | ✓ | run 幂等；reset 清 pane/workspace/marker/定时器，herdr 侧全空 |
| 8 | 审批门 | ✓ | blocked→waiting→scoped approval(approved)→completed，三个种子各一次 |
| 9 | 弱边消息速率 | ✓ | outbox→事件流→'N msg/min' 标签实时更新 |
| 10 | 错误路由 | ✓ | n-report failed → e-report-fail 'error routed' → n-fail 归档 completed |

### 本轮修复（均已回落 Windows 主副本并 diff 一致）

| 文件 | 改动 | 症状 → 根因 |
|---|---|---|
| `app/api/coordinator.ts` | RunContext 新增 `starting` 集合；schedule()/activateErrorRoutes() 在 fire-and-forget startNode 前**同步占位**，finally 释放；run/reset 清空 | ws-research 中 n-search/n-scrape/n-brief 同一 poll 周期完成 → 3 次 finishNode → 3 次重入 schedule → n-compare 被 spawn 3 次（p3/p6/p7 三个 pane 跑同脚本，审批后两个泄漏为 working）→ startNode 的 await 窗口内节点仍是 queued，重入 schedule 会重复拾取 |
| 环境（非代码） | 删除 WSL 旧 `api/data/workspaces.json` 重播种 | 上轮持久化文件（无 command 字段的旧种子）遮罩新种子 → 新脚本全部落到交互 shell 兜底且永不结束。**教训：种子 JSON 变更后必须删 workspaces.json 重播种（或后续给 registry 加种子版本号）** |

### 复验辅助脚本（Windows 主副本 tools/legacy/render-preview/）

- `accept-run.py <wsId>` — run + 轮询 + scoped 审批（新词汇 approved）+ 打印全状态迁移
- `herdr-structure.py` — workspace/tab/pane 结构转储
- `parity-test.py` — B 项交互 shell 全链路
- `ws-term-test.mjs` — WS term 2Hz 快照流（需在 agent-canvas 目录下 node 运行）

### 遗留问题

- 审批竞态（轻微）：WS 广播节点补丁与 approval 端点之间存在窗口，过早 approve 会收到
  `node is not waiting (status=running)`——属正确拒绝，前端应重试或等 waiting 态再亮按钮。
- 交互 shell 节点长期 running 是设计语义，但意味着含此类节点的 run 永远不会自然 done
  （checkDone 等所有 worker 终态）；需要用户 exit 或 reset 收尾。
- 注册表无 delete 端点：删临时 workspace 只能靠 reset + 删 data 文件 + 重启 api。
- 前端（xterm 输入、RunBar 二次确认）未在 WSL 验证，待 Windows 浏览器体验确认。
