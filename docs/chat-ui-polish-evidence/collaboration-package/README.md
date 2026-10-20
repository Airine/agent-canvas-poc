# 协作版本包验收 · 2026-10-20

- 全量单元：154/154。
- 浏览器：74 通过，1 个 opt-in 真实模型用例默认跳过；本次 UI 回归是 HTTP/WS 夹具，不写日常 API。
- API/UI 构建、ESLint：通过；现有大 chunk / Browserslist 提示不当失败。
- 真实模型：另行显式运行 `CANVAS_COLLAB_ACCEPTANCE=1 node --import tsx test/manual/real-collaboration.mjs`，完整闭环通过，退出时已停止两个自有会话。

[真实证据](real-evidence.json) 来自唯一临时项目中的合成任务；路径已替换为占位符，不含用户历史、认证或账户凭据。两会话均报告 Skill 已发现、4 工具已注册、system-prompt 指令绑定及期望/加载 manifest 完全一致。消息已消费、读/发边与模型回复分别记录，不以“发送成功”替代它们。

[门禁摘要](verification.json) 会在文档对账和清理后补记最终结果。历史的 HTTP/WS、来源恢复与目视证据保留在 [前一阶段目录](../collaboration/README.md)，不冒充本轮新检查。

日常 API/Pi 没有重启或热注入；部署后需要安全重载 API，并明确恢复所需会话。Skill 指令只是指导，真正权限仍来自 e 与服务端的当前精确审批证据。
