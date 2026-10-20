# ws-43b9d166 会话问题排查

## 结论

- 画布页面、Vite、API、REST session/graph 与 `/ws` 都正常；浏览器 console 没有页面网络错误。
- 会话中的 `fetch failed` 是真实模型调用错误，不是前端 fetch 或队列归档。
- 这些 `fetch failed` 都发生在 `openai-codex/gpt-6-astra` 的历史消息上；该 provider 的端点是 `https://chatgpt.com/backend-api`。排查时直连超时，经项目代理可到达认证层。
- 主会话当前模型已是 `deepseek/deepseek-flash`，最新配置回读成功；DeepSeek 端点直连/代理均可到达认证层。
- 另有一条 `kimi-coding` OAuth refresh unauthorized，是独立认证过期/授权失效，不归类为网络失败。

## 其他会话状态

| 节点 | 当前状态 | 问题类型 |
| --- | --- | --- |
| 主 Pi Agent | ready / idle | 历史 gpt-6-astra 网络失败；当前 DeepSeek 回读正常 |
| 风控合规 | ready / idle，队列暂停 | 历史 gpt-6-astra 网络失败；暂停是恢复后待授权状态 |
| 另一个 DeepSeek 节点 | ready / idle | 一个 `adapter control timeout; outcome unknown` 已冻结，后续 pending 未授权继续 |
| 另一个 gpt-6-astra 节点 | ready / idle | 当前无错误，队列已有消费记录 |
| 新 Pi Agent | failed | `live session limit reached`；当前已有 4 个 live session |

## 已做修复

`fetch failed` / 超时类错误现在显示为“模型网络请求失败”，状态栏显示“上次模型网络请求失败 · 可继续对话”。原始错误仍在“查看脱敏详情”中。修复不改变消息、审批、队列或运行器状态。

## 未执行操作

没有重启服务、停止会话、恢复队列、重发消息、修改模型或处理审批。恢复建议：

1. 对仍需使用 `gpt-6-astra` 的会话，先确认 ChatGPT/Codex 登录与代理规则；或直接切到当前可用的 DeepSeek。
2. 对有 `outcome-unknown` 的队列，先查看该条是否已实际消费，再明确删除/恢复；不会自动重发。
3. 对 `live session limit reached` 的节点，先停止一个不再使用的 ready 会话，或明确提高会话上限后再启动。

最终检查见 `verification.json`。

## 检查记录

- 187 项单测通过；19 项相关浏览器测试通过。
- UI 构建、完整 lint/架构、12 项文档测试、文档类型检查与构建通过。
- 修复后仍保留原始 `fetch failed` 诊断；状态球保持 danger，不伪装成可忽略的提示。
- 没有重启服务、发送消息、恢复队列、切换模型或处理审批。
