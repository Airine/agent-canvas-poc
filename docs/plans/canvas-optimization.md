# Canvas 操作优化列表

> 基于真实 herdr 驱动的一次完整 run（ws-demo：审批门、错误路由、弱边速率全链路）整理。
> 后端能力以 herdr 0.8.0 实测为准（`herdr api schema`，90 个方法）。

## P0 · 现在就影响日常使用

### 1. 节点重跑
- **现状**：run 只能整体"运行/重置"，单个节点 failed 后没有单独重跑入口。
- **方案**：节点卡右键/更多菜单 → "重跑此节点"：保留 pane，重新 `pane.send_input` 同一命令，状态回 running。
- **依赖**：`POST /api/workspaces/:wid/nodes/:nid/retry`（新增），复用现有 exit-marker 协议。

### 2. 失败节点直接交互修复
- **现状**：failed 节点的终端还能看，但要 takeover 输入必须先进专注。
- **方案**：failed 节点默认开放 L1 交互权（现在只有 L1s/专注开放）。
- **依赖**：纯前端改动（`LiveNode.tsx` 的 `interactiveTier` 判定）。

### 3. failed 后下游不会自动重试
- **上游 bug 已修**：`schedule()` 曾把 failed 节点重新入队（见 coordinator.ts 头注释），现已被 `TERMINAL` 状态拦截。
- **遗留**：n-report 失败 → n-chat（依赖 n-data）正常跑，但若失败的是 n-data，n-chat 会被 skip 级联。可考虑"重跑失败节点并恢复下游"选项。

### 4. 删除/重命名 workspace
- **现状**：`registry.create` 有，删除/重命名没有 API 也没有 UI。
- **方案**：主页卡片菜单 → 删除（二次确认）；`DELETE /api/workspaces/:id` + herdr workspace.close 清理。

### 5. 0.8.0 兼容性适配（已修 ping/HERDR_BIN 探测，仍需覆盖）
- ✅ `session.ping` → `ping` 双方法探测（已完成）
- ✅ `HERDR_BIN` 自动探测 `~/.local/bin/herdr`（已完成）
- ⬜ `pane.read` 的 `source: 'history'` 在 0.8.0 不存在（枚举：visible/recent/recent_unwrapped/detection）——`pump.ts` 用 visible 不受影响，但 spike 脚本 `spike/events_subscribe.py` 等用到 history 的要改。
- ⬜ herdr 0.8.0 对未知方法直接关闭连接（不返回 error 对象）——`call()` 通用层建议加防护，避免其他方法遇到同样问题。

## P1 · 提升效率

### 6. 多节点并行操作
- **现状**：一次只能选一个节点；没有框选批量操作。
- **方案**：Shift+点击 / 框选 → 批量"重跑/跳过/关闭 pane"；`selectionOnDrag` + RF multiselect。

### 7. 键盘导航
- **现状**：快捷键只有缩放/F/Esc/Enter。
- **方案**：方向键在节点间移动选中（沿边方向），Tab 循环 running 节点，`R` 重跑选中节点。

### 8. RunBar 增强
- **现状**：只有 运行/重置 + runState 徽标。
- **方案**：dropdown "重置选项"（重置并重跑 / 只重置 / 清 herdr workspace）；运行中显示 elapsed+活跃节点计数；X 秒无 pane 输出提示可能卡死。

### 8.5 排队依赖可视化
- **现状**：queued 节点只显示状态，不知道在等谁。
- **方案**：queued 节点 hover 显示"等待: n-data (running)"；入边虚线变亮标注阻塞边。

### 9. 审批体验
- **现状**：ApprovalCard 默认 disabled，必须双击进专注才能批。
- **方案**：L1 直接可批（一次点击不需要专注）；toast 带批准/拒绝按钮，不进画布也能处理；集中审批面板（多节点 waiting 时）。

### 10. 事件流过滤
- **现状**：EventReplay 只读列表，3s 轮询。
- **方案**：kind 过滤 chip（status/message/approval/edge/lifecycle/input）；文本搜索；WS 推送替代轮询。

### 11. 终端体验
- **现状**：全量快照 reset+write，2Hz；scrollback 2000 行。
- **方案**：滚动条位置记忆（reset/write 后跳回底部或保留位置）；搜索（Ctrl+F）；ANSI 内容预取更早历史（source: 'recent', lines: 5000+）。

### 12. 输入安全性
- **现状**：takeover 输入直接 `text\r` 发送。
- **方案**：危险命令确认（`rm -rf`、`git push --force` 等模式匹配二次确认）；输入历史 ↑↓（保存最近 20 条）。

## P2 · 打磨

### 13. 节点卡片信息密度
- "0% ctx / $0.00" 恒为 0（后端没回真实 token/cost 数据）——接 agent.get 拿真实用量或直接隐藏。
- identity 第四元显示 paneId（`wR:p2`）意义不大——换成 model 名（需要后端补 model 字段或 agent.get）。

### 14. toast 风格统一
- waiting toast 位置 top-right 与 RunBar 重叠区，移动到 bottom-right 或加 action 按钮跳转节点。

### 15. mock 回退透明度
- **现状**：herdr 掉线静默 mock，只有事件流一条 lifecycle 提示。
- **方案**：RunBar 连接徽标旁加"MOCK"红标 + 前端 ConnState=mock 时顶栏横幅；掉线原因（socket 缺失 vs 进程死）明示。

### 15.5 弱边速率标签刷新
- 5s 定时器刷新 `N msg/min`，但窗口内没有消息时显示 0 msg/min 后消失——改为保留上次非零值 + 灰显，避免闪烁。

### 16. 窄屏/可访问性
- Tab 键序无视觉指示；toast 关闭按钮无 aria-label；小屏图例遮挡画布。

### 17. 主页 GraphPreview 缩略图
- 拓扑从后端 graph 渲染（真实），但状态色不实时——WS 推送状态或 5s 轮询刷新。

## P3 · 大功能（新方向）

### 18. 图编辑
- 加节点/边、改 command、调拓扑，直接写回 registry；编辑器形态：节点卡内联编辑或抽屉表单。

### 编辑 Workspace 元数据
- title/path/description 主页可编辑（PUT /api/workspaces/:id）。

### 19. 快照/回放
- 基于事件流做时间轴 scrub 回放（PlaybackBar 在 PoC 有雏形，产品版砍了）；保存 run 快照对比。

### 20. 多 workspace 并行视图
- 主页已支持多 workspace，但一次只能开一个画布——多标签页或分屏对比。

### 21. herdr 原生 agent 集成
- herdr 有 agent.start/prompt/wait/read API（0.8.0 schema）——节点 type=operation 可以直接驱动真 agent（codex/claude CLI 等），不再是 demo shell 脚本。
- 这是"真数据"的下一站：现在节点跑的是 shell 命令，agent 集成后跑的是真 agent 会话。

## 已修复（本次）
- ✅ herdr 0.8.0 `ping` 方法名 + 连接关闭语义 → mock 静默降级根因（herdr-adapter.ts）
- ✅ `HERDR_BIN` 探测 `~/.local/bin/herdr`
- ✅ `statusDetailFor` 时间戳 ISO 字符串当 number 减 → "NaNmNaNs"（canvas/utils.ts）
- ✅ **一键最优布局**（原 P1 提案）：后端 `POST /api/workspaces/:id/layout`（`api/layout.ts`，依赖最长路径分层 + rank 内交叉最小化排序；**节点 rank 决定列、Zone 只按成员包围盒自适应，允许横跨多列**），前端工具栏「布局」按钮 + 快捷键 `L` + 布局后自动 fitView，坐标经 WS node 补丁广播并持久化（多标签页同步）
