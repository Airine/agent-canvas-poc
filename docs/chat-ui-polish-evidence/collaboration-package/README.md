# 协作版本包验收 · 2026-10-20

- 全量单元：154/154。
- 浏览器：74 通过，1 个 opt-in 真实模型用例默认跳过；本次 UI 回归是 HTTP/WS 夹具，不写日常 API。
- API/UI 构建、ESLint：通过；现有大 chunk / Browserslist 提示不当失败。
- 真实模型：另行显式运行 `CANVAS_COLLAB_ACCEPTANCE=1 node --import tsx test/manual/real-collaboration.mjs`，完整闭环通过，退出时已停止两个自有会话。

[真实证据](real-evidence.json) 来自唯一临时项目中的合成任务；路径已替换为占位符，不含用户历史、认证或账户凭据。两会话均报告 Skill 已发现、4 工具已注册、system-prompt 指令绑定及期望/加载 manifest 完全一致。消息已消费、读/发边与模型回复分别记录，不以“发送成功”替代它们。

[门禁摘要](verification.json) 已补记最终结果：11 个文档工具测试、文档站类型检查/构建、完整 lint（含架构）、diff 检查通过。清理后在独立副本执行 `npm ci --ignore-scripts --no-audit --no-fund`，重新通过 154 单测、API/UI 构建及 ESLint；浏览器再跑 74 通过 / 1 opt-in 跳过。历史的 HTTP/WS、来源恢复与目视证据保留在 [前一阶段目录](../collaboration/README.md)，不冒充本轮新检查。

日常 API/Pi 没有重启或热注入；部署后需要安全重载 API，并明确恢复所需会话。Skill 指令只是指导，真正权限仍来自 e 与服务端的当前精确审批证据。

## 清理范围

先提交完整实现与此前未提交内容（`a1858ae`），再单独清理 25 个无入口源码文件和 3 份失效模板，移除 34 项无使用者的直接依赖、46 个锁文件条目；保留包版本不变。Knip 文件/依赖/未声明包/可执行入口检查无发现；216 个源码文件的静态图无循环或解析断点。逐项依据见 `docs/architecture/unused-file-review.json`。

在用的原型、Herdr 兼容和离线量化示例保留，未清理会话数据、历史、全局配置或日常 node_modules。仍在用的 xterm 及相关弃用提示、大 bundle 提示是已知非阻断项，本次未做无关大版本迁移。
