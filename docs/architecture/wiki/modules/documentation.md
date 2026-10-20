---
title: Fumadocs 文档站
description: 独立的 Landing Page、模块文档、全文搜索和可重建架构地图。
sources:
  - docs-site/package.json 74b39960b4a2
  - docs-site/app/page.tsx 36679c3b44c5
  - docs-site/source.config.ts 3a15674e4ae4
  - docs-site/scripts/prepare-content.mjs b3f5e68f66dc
  - docs-site/scripts/render-architecture.mjs b08e9cda3907
covers:
  - docs-site/
---

# Fumadocs 文档站

## 职责

为读代码的人提供入口：首次运行、理解模块、追踪调用、查找问题。文档站独立于产品，不连接真实会话，不读取本机凭据，不把产品的工作区首页改成宣传页。

## 对外接口

- `docs-site/app/page.tsx` 提供 Landing Page，画布示意明确标注为非实时状态。
- `docs-site/app/docs/[[...slug]]/page.tsx` 使用 Fumadocs 的正文、目录与页间导航。页面底部可展开来源文件和 blob 哈希。
- `docs-site/app/api/search/route.ts` 从同一内容源建立全文索引；`RootProvider` 提供搜索对话框和主题切换。
- `docs-site/source.config.ts` 定义 frontmatter，`lib/source.ts` 提供页面树。
- `docs-site/scripts/prepare-content.mjs` 校验后转换 wiki，`render-architecture.mjs` 从模板重建独立 HTML，`analyze.mjs` 生成静态图与体检报告。

## 数据怎么流

启动或构建时，先检查正文来源与地图是否过期。检查通过后，把 Markdown 转为站内文档内容，重写相对链接并生成导航。文档框架编译正文，同时提取标题、目录和搜索索引。浏览器请求正文或搜索时，只访问这份静态知识，不访问应用会话。

架构地图从同一份 wiki 读取模块名和运行流，按代码静态导入聚合模块依赖。它将正文与数据一起嵌入单文件，断网也能查看。

## 改动指南

改内容编辑 `docs/architecture/wiki/`；改首页编辑 `docs-site/app/page.tsx` 与 `global.css`。链接转换使用 AST，新增规则需要在 `scripts/content-links.test.mjs` 补测试。不要直接改 `content/docs/`。

站点使用独立 package 和锁文件，避免将 Next、Tailwind 4 或 Fumadocs 混入产品的 Vite/Tailwind 3 依赖树。默认端口 4310，仅监听回环地址。执行 `npm --prefix docs-site run build` 和 `typecheck`；页面体验还需在桌面、移动端检查导航、搜索与溢出。
