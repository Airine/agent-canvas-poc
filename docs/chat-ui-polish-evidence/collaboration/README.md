# 跨 Agent 协作验收证据

全部来自夹具或独立合成任务，不含日常用户消息或凭据。

- `verification.json`：137 单测、70 浏览器通过/1 原有 opt-in 跳过、11 文档测试；两轮真实双 Agent 发布/读取/发送/消费及回复；HTTP/WS 审批拒绝、停止目标暂停、明确队列恢复、来源历史重放和按时间读取结果。
- `real-canvas.jpg`、`real-read-trace.jpg`、`real-mention.jpg`：实际打开隔离 e/Pi 页面并目视检查。
- `mentions-light-floating.png`、`mentions-dark-mobile.png`、`communication-trace-light.png`：Playwright 夹具截图；有命中、键盘、IME 和不隐式发送断言。

初次 HTTP 脚本的固定回答/非空回答断言失败已保留在 JSON 的历史说明中。实际投递已获 e applied；对方可以拒绝执行或正常结束而不回答。最终不把“已消费”写成“任务成功”。

可复验完整真实闭环：在 `app/` 显式运行 `CANVAS_COLLAB_ACCEPTANCE=1 node --import tsx test/manual/real-collaboration.mjs`。脚本使用唯一临时目录，只批准隔离会话的 Canvas 测试工具，结束停止自己的会话。需先有合法 ADE/Pi/model 配置；不会修改全局配置或重启日常服务。
