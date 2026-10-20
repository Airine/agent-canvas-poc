---
title: 文档维护
description: 代码先行，审阅差异后更新 wiki，再重建站点与架构地图。
sources:
  - docs-site/scripts/unused-review.mjs 1d72f1c3bafd reconcileUnusedReview
  - app/package.json 76486a23e156
  - docs/architecture/verify.mjs f2b8209fece8
  - docs-site/scripts/analyze.mjs 202ce7549c4a
  - docs-site/scripts/prepare-content.mjs b3f5e68f66dc
---

# 文档维护

## 一份事实源，两种阅读方式

`docs/architecture/wiki/` 保存正文和证据。Fumadocs 页面由 `docs-site/scripts/prepare-content.mjs` 生成；它用 Markdown AST 转换站内链接，不修改代码块中的示例。`architecture.html` 使用 skill 的自包含模板，嵌入同一份 wiki 和静态图，不需要外部 CDN。

两种输出都可以删除重建，不要在生成目录补写独立知识。正文要改在 wiki；架构图布局要改在 renderer，图上的模块标题、结构依赖和运行流说明仍从 wiki 或分析结果读取。

## 修改代码后

```bash
node docs/architecture/verify.mjs
```

先读来源差异。论断改变就改正文；只是注释或格式变化才保留正文。新文件归入对应模块的 covers，历史证据类文件可以说明理由后放进 index 的 exclude。

本仓的校验器从 skill 模板复制，并扩展了认领对账：同时检查已跟踪和未跟踪、未忽略文件。这样能覆盖现有工作区的 e / Pi 新增文件，不需要为了校验执行 git add。校验脚本仍只依赖 Node 与 git。

确认差异后执行：

```bash
node docs/architecture/verify.mjs --sync
npm --prefix docs-site run architecture:analyze
npm --prefix docs-site run architecture:render
node docs/architecture/verify.mjs
npm --prefix docs-site test
npm --prefix docs-site run typecheck
npm --prefix docs-site run build
```

`--sync` 只刷新哈希和 baseline，不替你修正文。因为正文变动后旧地图 digest 会不匹配，第一次 sync 可能以非零退出；继续渲染，再跑 verify。若还有 symbol 消失、断链或认领错误，必须修复后才能构建。

## 重新做体检

`architecture:analyze` 使用 oxc，输入包含当前工作区源码。报告保存到 `docs/architecture/reports/`，每个零入度文件都有分类。当前 Knip 5 不支持 skill 要求的 `cycles` issue type，脚本保留原命令失败证据，再使用支持的 files/exports，循环另由静态图的强连通分量计算。

未使用文件先按文件名和基础名搜索引用；动态 worker、类型声明和组件库可能是误报，不能一键删除。历史热点只按 Git 已提交记录计算，不反映尚未提交代码经历的修改次数。分析命令可能经 npx 获取 Knip 5，需要网络；文档的普通构建和 verify 不会运行 Knip。

Knip 的动态入口、声明文件豁免和别名集中在 `app/knip.jsonc`，配置依据见 [Knip 配置文档](https://knip.dev/reference/configuration)。不要用全目录入口隐藏未使用组件。文件搬迁后，扫描与认领检查以实际存在的工作区文件为准，不要求先暂存 Git 改动。

人工文件裁决保存在 `docs/architecture/unused-file-review.json`，不是 Knip 豁免名单。分析脚本复核保留项的 SHA-256 和当前候选集合；文件改动、删除或恢复后会提示重新复核。按职责阅读[逐项结论](unused-files.md)，不要把保护未提交工作误写成已有产品入口。

## 检查入口

API 编译启用 `noEmitOnError`，并和 ESLint 一起排除 `api/data/**`、`dist-api/**`。generation 内适配器属于运行数据，不是源码；检查不能让它引入外部 ADE 并向外部源码目录发射文件，也不能以清空用户数据解决编译问题。新增目录边界需同步 `tsconfig.api.json`、`eslint.config.js` 和回归测试。

产品的 `npm --prefix app run lint` 在 ESLint 后调用 architecture:verify。文档站的 dev、typecheck、build 也先执行 verify；不会在构建时自动刷新来源哈希。

构建产生 `.next/`、`.source/`、`content/docs/` 与 `public/architecture.html`，均已忽略。仓库中的 `docs/architecture/architecture.html` 与 `data.json` 则作为可检查的派生产物保留。

## 保护已有工作

不要为了整理文档重排业务目录、重写现有 README 的全部内容，或提交用户尚未确认的代码。原研究与验收文档保持原位置；这里用职责页索引它们。运行浏览器测试也不需要触发真实模型或重启日常使用的产品服务。
