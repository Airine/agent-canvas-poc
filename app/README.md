# Agent Canvas 产品应用

React / Vite 画布 + Hono 控制面，通过私有 worker 接入外部 ADE 的 e-core 与 Pi。默认使用真实工作区；两套原型和 Herdr 兼容路径仍是明确分开的入口。

## 本地启动

前提：Node ≥22.13、已安装依赖的 ADE checkout、可执行 Pi 及已有合法模型配置。

```bash
npm ci
cp .env.e.example .env.e  # 仅首次；不要覆盖已有配置
# 编辑 ADE_ROOT，以及可选的 API_PORT / CANVAS_UI_PORT
npm run dev:e
```

默认 UI 5173 / API 3300，以启动器输出为准。`npm run start:e` 使用已构建 UI/API 提供单服务；不安装或修改全局 Pi、模型或认证。旧 Node 20 Docker 模板已移除，当前不宣称已支持容器部署。

## 检查

```bash
npm test
npm run lint          # ESLint + 架构事实、链接和归属校验
npm run build:api
npm run build
npm run test:e2e      # 默认夹具；真实模型需显式 opt-in
npm run collaboration:inspect -- --manifest  # 只读资源检查，不是会话加载证明
```

运行目录 `api/data/`、生成目录 `dist-api/` 不参加源码编译/lint；API 编译错误不发射文件。不要删除会话历史来解决构建问题。更新 API 后需安全恢复所需会话才能加载新协作版本；恢复会话与恢复待发队列是两个动作。

- [e 后端指南](../docs/guides/E_BACKEND.md)
- [跨 Agent 协作与独立 Skill](../docs/canvas-collaboration.md)
- [架构 Wiki](../docs/architecture/wiki/index.md)
- [当前验收](../docs/chat-ui-polish-evidence/collaboration-package/README.md)

锁文件使用 `package-lock.json`。删除依赖前核对动态入口、外部 Pi 载入与测试，不把所有零入度文件视为死代码。
