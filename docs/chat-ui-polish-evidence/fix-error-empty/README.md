# 空 system 消息误报修复

会话中最后一条空的 system 文本曾让展示层生成 `本次回复失败`，看起来像 `fetch failed`。根因是 `project-transcript.ts` 对空错误载荷也创建了错误 part。

## 修复

`project-transcript.ts` 只在存在真实错误文本或 `stopReason === 'error'` 时才生成错误提示；空 system 消息不再进入错误横幅。

## 验证

- 单元测试新增“空 system / 空错误载荷不显示失败”回归。
- 浏览器回归确认页面上不再出现误导性失败框。
- 全量单元 187 通过、构建、lint、文档测试/类型检查/构建、架构校验通过。
- 只改前端展示，不改后端、协作、审批或队列语义。
## 当前页面同步诊断

对 `http://127.0.0.1:5199/canvas/ws-43b9d166` 做了只读核验：Vite 页面可加载，REST `/api/workspaces`、graph、session、runtime status 均返回 200，`/ws` 握手成功并收到 graph，浏览器 console 无网络错误，画布状态为 online。

页面中可见的 `fetch failed` 字样被定位到一条已经消费的队列/消息正文，不是浏览器网络请求失败。该内容只作为历史消息显示；本次没有重新发送、删除或修改它。

另外发现并修复一个真实展示问题：空 system 文本或空错误载荷会生成误导性的“本次回复失败”。修复不影响真实错误、审批、协作或队列语义。
