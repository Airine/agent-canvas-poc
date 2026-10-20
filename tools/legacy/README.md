# 历史工具，不属于日常测试

- `spike/`：herdr 协议探测、样本和实测报告。
- `render-preview/`：旧服务验收脚本，不是只读的报告预览器。

这些文件从根目录原样归档，保留实验时的硬编码地址与路径。
部分脚本会运行、重置工作区或自动批准工具。运行前逐项确认目标和副作用，
不要对正在使用的工作区执行，也不要加入默认 `npm test`。

日常验证使用 `app/test/unit/` 与 `app/test/browser/`；
手工 WebSocket 探针位于 `app/test/manual/ws-smoke.mjs`，需要显式连接测试实例。
