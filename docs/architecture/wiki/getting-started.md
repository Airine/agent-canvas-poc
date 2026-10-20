---
title: 本地启动
description: 分别启动文档站和真实会话应用，不覆盖已有本机配置。
sources:
  - docs-site/package.json 74b39960b4a2
  - app/scripts/dev-e.mjs 82c22e9d56a3
  - app/package.json 141da0328124
  - app/scripts/e-runtime-worker.mts 597fd806824d
---

# 本地启动

## 只阅读文档

在仓库根目录执行：

```bash
npm --prefix docs-site ci
npm --prefix docs-site run dev
```

打开 `http://127.0.0.1:4310`。首页是 Landing Page，正文在 `/docs`，架构地图在 `/architecture.html`。文档站与产品进程独立，不需要启动 ADE、Pi 或 herdr。

开发启动会先校验架构 wiki，再生成 Fumadocs 内容。修改 wiki 后重新执行启动命令；不要编辑被忽略的 `docs-site/content/docs/`，下次生成会覆盖它。

## 运行真实会话应用

使用 Node 22.13 或更高版本；本机需要已安装的 ADE checkout、Pi CLI 及可用模型配置。ADE 路径是本机前置条件，本仓库不会替你安装或下载模型凭据。

```bash
cd app
npm ci
test -e .env.e || cp .env.e.example .env.e
# 编辑 .env.e 中的 ADE_ROOT；已有文件不要覆盖
npm run dev:e
```

按启动器输出的 URL 打开应用。默认 UI 端口为 5173，API 为 3300；本机配置可能不同。启动器检测端口占用后会退出，不会悄悄换端口或接管其他进程。`CANVAS_PROJECT_ROOT` 可指定会话项目；默认由仓库位置推导，不依赖运行命令时所在目录。

进入首页后创建 e 工作区，再创建 Pi 会话。运行时未就绪时先看状态原因，不要把原型页面里的模拟反馈当作真实模型响应。

## 构建与检查

```bash
# 文档
npm --prefix docs-site test
npm --prefix docs-site run typecheck
npm --prefix docs-site run build
npm --prefix docs-site start

# 产品代码，不启动真实会话
npm --prefix app test
npm --prefix app run lint
npm --prefix app run build
npm --prefix app run build:api
```

产品生产启动为 `cd app && npm run start:e`，先完成 UI 与 API 构建。它仍使用本机配置，只运行单个 API 服务并托管构建后的 UI。不要把 API 直接暴露到公网。

浏览器 E2E 可能依赖既有服务与真实 Pi，运行前读 `app/playwright.config.ts` 和 `docs/guides/E_INTEGRATION_VERIFICATION.md`。历史 `tools/legacy/render-preview/` 脚本存在自动运行、重置与批准行为，不属于只读检查。

## 加载协作工具

复制与 `@` 是浏览器功能；实际读取/发消息需要当前 API 与新启动的受管 Pi 扩展。后端不是热重载模式：确认任务可以停止后再重启服务，并明确恢复所需会话。恢复不会自动恢复暂停队列。不要为更新工具中断别人正在执行的任务。工具范围和审批见 [Canvas 协作](modules/collaboration.md)。

## 常见阻塞

- 文档启动提示哈希漂移：先按[维护流程](maintenance.md)读差异，不能直接刷新哈希掩盖变化。
- 真实应用提示 ADE 不可用：检查 `.env.e` 的绝对路径与 ADE 模块接口是否匹配。
- 模型列表为空或 Pi 不可用：先确认本机合法模型配置与 CLI 路径；不把凭据写进文档或提交。
- 想体验旧终端：阅读[herdr 兼容模块](modules/herdr.md)，它与 e 会话控制不是同一条运行路径。
