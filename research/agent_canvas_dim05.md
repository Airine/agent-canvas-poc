# Agent Canvas 维度 05：产物版本管理 UI 与 Annotation/评论交互最佳实践

调研范围：OpenAI Canvas、Claude Artifacts、Figma、Google Docs、Notion( AI)、Git/GitHub diff、Cursor/Windsurf、v0、Lovable、视觉回归工具（Percy/Chromatic/Sentry/Applitools）、协同编辑（WPS/OT/CRDT）及开源实现。
方法：30 次独立中英文搜索（web_search），优先官方文档、设计博客、开源实现。调研日期：2026-XX（以各来源标注日期为准）。

---

## 设计启示（Top 8）

1. **默认线性版本链，按产物复杂度升级形态**：轻量产物用「底部版本选择器/箭头」（Claude Artifacts）或「后退按钮」（ChatGPT Canvas）；里程碑式协作用「自动 checkpoint + 命名版本」的时间线列表（Figma：每 30 分钟自动快照 + 手动命名版本）；只有当用户需要"从 v3 岔出去试另一方向"时才引入分支树（Claude 的 message-edit 分支、开源创作工具的 branching timeline）。不要一上来就做 git 式分支树。

2. **旧版本=只读预览 + 显式恢复，恢复前自动保存当前态**：Figma/Notion/Canva 均为"点击版本→预览→Restore"；Allo 的模式更安全——恢复确认对话框默认勾选「Save current version to version history」，给团队留回头路。恢复应是"生成新版本"而非"销毁当前态"。

3. **diff 呈现按产物类型分层，且要识别"diff 失效"的边界**：文本/代码小改动用 inline tracked-changes（Google Docs Suggesting：彩色插入+删除线+边距卡片）；代码用 unified/split 可切换（GitHub 2014 起双模式）；可视化产物（网页/PPT/图片）用四模式——side-by-side、wipe slider、onion-skin 透明度叠加、pixel diff 高亮（Sentry/SnapDiff/vrdiff 均为此组合）。大改动不要强迫用户看 diff，应给"当前态全览 + 边距变更标记"（matklad）。

4. **Accept/Reject 粒度必须分层**：单条建议（Google Docs 单条 ✓/✗）→ hunk/段落（Cursor per-hunk）→ 文件/节点（Cursor Accept File）→ 全部（Accept All）。同时提供批量操作与键盘导航（↑↓ 跳转 diff）。GitHub 的 "Add to batch"（多条 suggestion 合成一个 commit）是介于逐条与全部之间的中间档，值得借鉴。

5. **AI 产物在被接受前必须有"临时态"视觉区分，且永不静默覆盖**：ghost text（Gmail/Cursor Tab）、pending 色块（Cursor 绿增红删）明示"这还不是你的内容"；"The diff, not the overwrite"——AI 输出不得静默替换用户内容；必须有一键 undo 的安全网。开源实现（Skycode）用 per-message 快照 + pending 标记实现不落盘的接受/拒绝；pi-diff 的 edit-guard 在 agent 的 oldText 过期时阻止写入，防止覆盖并发修改。

6. **Annotation 即上下文：选元素/选区/圈选三类标注都要结构化回传 agent**。v0 Design Mode（Cmd+I inspect，选中元素→视觉面板或自然语言）、Lovable Preview Toolbar（Select elements 多选后作为引用附加到 chat 输入、Draw annotation 手绘自动规整为形状）证明了"point first, then describe"范式：先指后说，提示词可以极短。标注数据结构应包含：元素路径/DOM selector、bbox、选中文本、computed style/截图、intent、severity、status(pending/resolved)（参考 Agentation annotation envelope）。

7. **标注/评论要有状态机并区分"临时讨论"与"永久规格"**：Figma 明确区分 Comments（临时讨论、可 resolve）与 Annotations（永久设计说明、随交付存在）。对 agent canvas：用户标注默认 `status: pending`，agent 处理后流转 resolved；评论线程支持 @ agent 直接把标注转为指令（Lovable：tag Lovable itself 即发送指令）。

8. **人机并发编辑用"快照 + 区域锁 + 合并建议"三层防护**：事前——agent 生成期间锁定产物区域或进入"待审 pending edits"态（不落盘）；事中——显示 agent 正在写的区域（类比协作者光标避让）；事后——冲突时高亮差异并给"选用/手动调整"建议（WPS 365：段落级锁定 + OT/CRDT 自动合并 + 冲突高亮一键选用）。Cursor 官方明确「Checkpoints 不是版本控制」：checkpoint 管短期回滚、Review 管接受/拒绝、Git 管长期历史——三层职责不要混。

---

## Q1. 版本浏览 UI 范式：slider / 时间线 / 版本列表 / 分支树

### Claim 1.1：OpenAI Canvas 采用「后退按钮」式线性版本回退，而非完整版本历史面板
- **Source**: OpenAI 官方公告《Introducing canvas》
- **URL**: https://openai.com/index/introducing-canvas/ （中文版 https://openai.com/zh-Hans-CN/index/introducing-canvas/）
- **Date**: 2024-10-03
- **Excerpt**: "You control the project in canvas. You can directly edit text or code… You can also restore previous versions of your work by using the back button in canvas."（中文："您还可以使用 Canvas 中的'后退'按钮恢复以前的版本。"）
- **Context**: Canvas 在 chat 旁开独立编辑窗；用户可高亮选区让 ChatGPT 定向修改；版本能力刻意轻量——只有一个 back button，面向"改坏了立刻回退一步"的场景，不面向历史审计。注意：OpenAI 于 2026-05-28 在 GPT-5.5 中移除 canvas，改用 chat 内 writing blocks/code blocks，版本能力退化为"undo/redo recent AI-assisted edits"（https://www.ai-toolbox.co/chatgpt-management-and-productivity/how-to-use-chatgpt-canvas-guide-2026 ，2026-05-30）。另有技术分析指出 canvas 历史版本仅存于服务端、不随对话消息保存（知乎《ChatGPT Canvas 的逆向及技术分析》2024-10-04，https://zhuanlan.zhihu.com/p/818894644）——意味着版本恢复完全依赖产品 UI，用户无法自行导出历史。
- **Confidence**: 高（官方原文）

### Claim 1.2：Claude Artifacts 用「版本选择器（version selector）」做线性版本切换；分支通过"编辑历史消息"实现
- **Source**: Anthropic 官方帮助中心《What are Artifacts and how do I use them?》
- **URL**: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them_
- **Date**: 未标注（检索时有效）
- **Excerpt**: "These edits won't change Claude's memory of the original Artifact content, and you can switch between each version using the version selector at the bottom left of the Artifact."
- **Context**: 每次迭代生成新版本，版本链是**线性**且绑定单一对话。第三方解读确认："it isn't branching or a commit history – it's a linear trail tied to that one conversation"，分支靠编辑早前 chat 消息产生独立 artifact 集（coursiv.io/blog/claude-artifacts，2026-09-10）。已知痛点：URL 不随版本变化、API 无版本历史端点，旧版本只能客户端查看（github.com/anthropics/claude-code/issues/79901，2026-07-21）。对 agent canvas 的启示：版本链若只对 UI 可见、不暴露给 agent/链接，会造成"用户看得到旧版、agent 摸不到"的能力断层。
- **Confidence**: 高（官方+多源交叉）

### Claim 1.3：Figma 版本历史=「自动 checkpoint 时间线 + 命名里程碑版本」，预览式恢复
- **Source**: Figma 官方帮助《View a file's version history》；Figma 官方博客
- **URL**: https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history ；https://www.figma.com/blog/now-you-can-name-and-annotate-your-figma-version-history/
- **Date**: 帮助页未标注；博客 2018-03-19
- **Excerpt**: "Figma records a new checkpoint every 30 minutes… Add a Title and Description to summarize your changes… View a version to pan around and see a snapshot in time. Restore previous versions… Duplicate versions… Share a link to a specific version."
- **Context**: 右侧栏时间线列表，自动快照分组折叠，命名版本带标题/描述/头像/时间戳；点击版本在画布内只读漫游预览，再决定 Restore 或 Duplicate 成新文件。Starter 计划仅 30 天历史，Professional 起全量（升级后历史仍在，只是 Starter 不可见）。业界评价："它叫 version history 而非 version control 是有原因的——没有冲突管理与合并能力"（moonlearning.io，2020-11-15）。启示：自动快照（时间驱动）+手动命名（语义驱动）双层结构，是"不打扰用户的版本管理"的黄金标准。
- **Confidence**: 高（官方原文）

### Claim 1.4：Notion Page History=「10 分钟自动快照 + 整版恢复/部分复制」双通道
- **Source**: Notion 中文文档/帮助（notionchina.co、sparxno.com 转述官方 Help）
- **URL**: https://notionchina.co/guide/editing-pages/version-history ；https://www.sparxno.com/blog/notion-page-version-history
- **Date**: 2026-07-24（sparxno）
- **Excerpt**: "在你进行修改时，每隔十分钟就会保存一个新的版本，在你停止修改后，每隔两分钟会保存一个新的版本。"；"恢复部分内容：在历史版本中选中区块，按 Cmd/Ctrl+C 复制，再粘贴到当前页。恢复整个版本：点击蓝色按钮'恢复版本'。"
- **Context**: 保留期按套餐分级（Free 7 天/Plus 30 天/Business 90 天/Enterprise 无限）。独特设计：**部分恢复**（从旧版本复制个别 block 回当前页）避免全量回滚的破坏性——对 agent canvas 产物节点尤其适用（用户常只想捞回某一段）。
- **Confidence**: 中高（非一手官网页面，但与多来源一致）

### Claim 1.5：恢复操作的"安全带"模式：恢复前自动保存当前版本
- **Source**: Allo.io 帮助文档《Use Version History》（canvas 类白板产品）
- **URL**: https://allo.io/help/en/canvas/version-history
- **Date**: 2026-07-08
- **Excerpt**: "Keep **Save current version to version history** selected if you may need to return to the current state after the restore… Restoring reverts the shared canvas to the selected version and can replace work collaborators currently see."
- **Context**: 多人共享画布场景下，恢复会影响所有协作者，因此恢复要确认+默认保留当前态+权限收紧（仅 owner/admin 可恢复）。对多人/人机共享产物的版本回退有直接参考价值。
- **Confidence**: 高（官方帮助原文）

### Claim 1.6：Cursor 用「Checkpoint」做请求级回滚，并官方声明"Checkpoint 不是版本控制"
- **Source**: Cursor 官方文档（经 note.com 日文学习指南转述原文）+ 中文入门教程
- **URL**: https://note.com/light_quoll2409/n/nd56cef1ac84c3 （2026-07-29）；https://zhuanlan.zhihu.com/p/1930324407856894708 （2025-07-23）
- **Excerpt**: "the official docs clearly state that Checkpoints are not version control… Review: Understand changes and decide whether to accept or reject / Checkpoint: Revert Agent changes in the short term / Git: Humans and teams manage long-term history. Checkpoints are saved locally, track only Agent changes, and do not cover manual edits."
- **Context**: 每个请求/每次 AI 改动自动建 checkpoint，点输入框上的 `Restore Checkpoint` 回滚到该次对话之前。关键边界：**checkpoint 只跟踪 agent 的改动，不覆盖用户手动编辑**——人机双写场景下用户编辑不在回滚保护内，这是 agent canvas 设计必须补的洞。
- **Confidence**: 中高（官方文档的可靠转述，两源一致）

### Claim 1.7：分支树适用于"探索式创作"，业界以 Figma 版本历史为心智模型
- **Source**: livepeer/storyboard 开源项目改进清单（GitHub）
- **URL**: https://github.com/livepeer/storyboard/blob/main/remaining-improvements.md
- **Date**: 2026-05-25
- **Excerpt**: "Real creative work branches: 'let me try a darker version' → 'no, go back to v3 but with the new ending.' Add a visual tree where each card has parent links, and the user can branch from any historical state. Figma version history is the model. Why: snapshots are saved but invisible. Without a UI, the time-machine is structurally there but operationally dead."
- **Context**: 创作类 agent（视频/图像）天然需要"从任意历史状态岔出"。Claude 用 message-edit 实现分支（Claim 1.2），chat 式产品用分支对话替代分支产物。对 agent canvas：若产物节点支持"从 v3 派生 v3'"，需要父子链接的可视化树；否则线性链足够。
- **Confidence**: 高（开源项目一手文档）

### 范式对比小结（推断性综合）
| 范式 | 代表 | 适用场景 | 局限 |
|---|---|---|---|
| 后退/前进按钮（undo 栈） | ChatGPT Canvas | 快速试错、单人短会话 | 无法跳转任意版本、无语义 |
| 版本选择器/箭头（线性链） | Claude Artifacts | 单对话内迭代产物 | 无命名、无分支、不随分享链接 |
| 时间线列表（自动快照+命名版本） | Figma/Notion/Google Docs/Allo | 长周期协作、里程碑管理 | 占用侧边栏，需要预览配合 |
| Slider（底部时间滑块） | 视频编辑器/部分 canvas 产品 | 连续态快速 scrub 对比 | 版本稀疏时定位不精确 |
| 分支树 | storyboard（规划）、Claude message 分支 | 探索式创作、多方向比较 | 认知成本高，需合并策略 |
- **Confidence**: 中（综合推断）

---

## Q2. 版本间 diff 的可视化

### Claim 2.1：代码 diff 的双模式标准——unified 与 split 可切换，记住用户偏好
- **Source**: GitHub 官方博客《Introducing split diffs》（经 StackOverflow 引用）+ matklad 博客
- **URL**: https://stackoverflow.com/questions/15048958/ ；https://matklad.github.io/2023/10/23/unified-vs-split-diff.html
- **Date**: GitHub 功能 2014-09-03；matklad 2023-10-23
- **Excerpt**: "Diffs now come in two flavors, unified and split… The mode you last used will become your preferred default."（GitHub）；matklad: "If the changes are simple and small, both views are good. But for larger, more complex changes neither works for me… the ideal diff view: on the left, the current state of the code… with changes subtly highlighted in the margins. On the right, the unified diff for the portion of the codebase currently visible."
- **Context**: 业界共识——split 适合结构性对比（左右对照），unified 适合行级快速扫读；**大变更场景 diff 整体失效**，应转向"当前态+边际高亮"。评审工具 crit.md 补充：split 看结构变化、unified 扫行级编辑，且"round diff"（两轮评审之间的 diff）对 agent 迭代场景关键——用户需要知道 agent 针对上轮评论实际改了什么（https://crit.md/features/split-unified-diff）。
- **Confidence**: 高

### Claim 2.2：行内 word-level 高亮与 hunk 折叠是 diff 可读性的必要细节
- **Source**: git-diff-view（开源组件）、pi-diff（开源终端 diff 渲染器）
- **URL**: https://github.com/MrWangJustToDo/git-diff-view ；https://github.com/buddingnewinsights/pi-diff/
- **Date**: pi-diff 2026-03-30
- **Excerpt**: "Word-level emphasis — changed characters get brighter backgrounds so you see exactly what changed"；"Hunk separators (`··· N unmodified lines ···`)"；"Split… auto-falls back to unified when terminal < 150 cols"。
- **Context**: GitHub 自 2014 即支持 word diff highlight。开源实现证明：word 级高亮、未变行折叠（hunk）、按容器宽度在 split/unified 间自适应降级，是 diff 组件的事实标准能力。React/Vue 生态有现成组件（git-diff-view 支持 split/unified、语法高亮、行内 widget——widget 位正好可放评论/annotation 入口）。
- **Confidence**: 高（开源实现）

### Claim 2.3：文档 diff 的主流范式不是"两个文件对比"而是"建议模式"的 inline tracked-changes
- **Source**: Google Docs Suggesting mode（多源，含官方行为描述）；CSA 对 Docs API 的实测
- **URL**: https://github.com/CloudSecurityAlliance/csa-google-workspace/blob/main/experiments/docs-suggestions/RESULTS.md ；https://www.deckoholic.ai/tutorials/google-docs/track-changes
- **Date**: CSA 2025-05-27（实验 2026-07-20）；Deckoholic 2026-01-12
- **Excerpt**: "Added text appears in a colored font… Deleted text appears with strikethrough… A comment box appears in the margin showing who made the suggestion"；API 层："suggested text arrives as text runs carrying suggestedInsertionIds… `SUGGESTIONS_INLINE` → text including the suggestion; `PREVIEW_SUGGESTIONS_ACCEPTED` → as if accepted; `PREVIEW_WITHOUT_SUGGESTIONS` → as if rejected."
- **Context**: 富文档里，diff 被设计成"可逐条裁决的建议"而非静态对照视图。Docs 的三种只读预览模式（inline/全接受/全拒绝）证明：**同一份建议数据可渲染三种视图**——agent canvas 的 pending edits 也应如此（用户可一键预览"全部接受后长什么样"再决定）。已知局限：表格、图片、移动文本的跟踪很差（clausul.com，2026-02-27），移动被渲染为"删除+插入"。
- **Confidence**: 高

### Claim 2.4：可视化产物（网页/PPT/图片）的 visual diff 四模式：side-by-side / wipe slider / onion-skin / pixel-diff
- **Source**: Sentry 官方文档《Reviewing Snapshots》；SnapDiff（VS Code 扩展）；vrdiff 文档
- **URL**: https://docs.sentry.io/product/snapshots/reviewing-snapshots/ ；https://marketplace.visualstudio.com/items?itemName=jcrengifoa.snapdiff ；https://bridge.bajratechnologies.com/docs
- **Date**: SnapDiff 2026-08-11；其余未标注
- **Excerpt**: Sentry: "**Split:** Side-by-side view… with a diff overlay highlighting changed pixels. **Wipe:** Drag a slider across the image to compare base and current branch. **Onion:** Overlay both images with an adjustable opacity slider."；vrdiff: "Compare any two versions side-by-side or as an opacity overlay; see every property that changed grouped by layer."
- **Context**: 四种模式互补：slider/wipe 适合 before/after 扫读；onion-skin 透明度叠加适合发现位移/对齐漂移；pixel-diff（YIQ 色距+阈值）确保一像素变化也不漏；side-by-side 适合整体对照。vrdiff 还示范了**结构层 diff**——按图层分组列出属性变化（CSS/Tailwind 级别），即"设计稿的 DOM diff"。
- **Confidence**: 高（官方文档+开源实现）

### Claim 2.5：视觉 diff 的最大工程问题是噪声，主流方案=阈值/遮罩/组件级隔离/AI 语义分类
- **Source**: getautonoma 视觉回归工具对比；dev.to《Screenshot Diffing》；BrowserStack 指南
- **URL**: https://getautonoma.com/blog/visual-regression-testing-tools ；https://dev.to/dennis-ddev/screenshot-diffing-pixel-level-comparison-techniques-18k ；https://www.browserstack.com/guide/visual-testing-tools
- **Date**: 2026-04-25 / 2026-04-07 / 2026-09-16
- **Excerpt**: "The hard part isn't the capture. It's the noise… A naive pixel diff will flag your loading spinner as a broken component every single run."；"AI-based tools… classify visual differences: layout changes / content changes / style changes / rendering noise… assign each difference a category and severity."；组件级方案："You're not screenshotting a full page with dynamic content… The diff surface is smaller. The false positive rate drops significantly."
- **Context**: 对 agent canvas 的网页类产物节点：版本 visual diff 必须提供动态区域遮罩、diff 阈值、按组件/节点聚合差异，否则 diff 视图会被动画、时间戳等噪声淹没。Applitools 式语义分类（布局/内容/样式/噪声）可作为 agent 自动摘要版本差异的依据（"本版改了 hero 区布局"）。
- **Confidence**: 高

### Claim 2.6：审批工作流与 baseline 更新是 visual diff 的闭环
- **Source**: teachmeidea（Percy/Chromatic 指南）；Sentry 文档
- **URL**: https://teachmeidea.com/visual-regression-testing-percy-chromatic/ ；https://docs.sentry.io/product/snapshots/reviewing-snapshots/
- **Date**: 2026-02-23
- **Excerpt**: "Capture → Compare → Diff → Review → Update: Approved screenshots become the new baselines"；Sentry: "If a new commit is pushed after approval, Sentry re-approves the check when the snapshot changes match the previously approved changes. If they differ, the check requires approval again."
- **Context**: "接受当前版本=设为新基线"的语义对 agent canvas 重要：用户 accept 一个版本后，后续 diff 应基于该 accepted 版本而非任意旧版计算。
- **Confidence**: 高

---

## Q3. Annotation 交互范式：选区评论 / 行间评论 / 画笔圈选 / pin 标注，及结构化回传 agent

### Claim 3.1：Figma 区分 Comments（临时讨论，可 resolve）与 Annotations（永久规格说明）——pin 到元素是共同基础
- **Source**: GeeksforGeeks《Advanced Collaboration Features in Figma》；Medium《Annotations vs Comments in Figma》
- **URL**: https://www.geeksforgeeks.org/advanced-collaboration-features-in-figma-comments-annotations-and-more/ ；https://medium.com/@designerlifestyle/annotations-vs-comments-in-figma-whats-the-difference-and-how-to-use-them-properly-afa415f12a3b
- **Date**: 2025-07-23 / 2026-02-27
- **Excerpt**: "Pinning Comments: Attach comments to specific parts of the design… Mentions… Resolved Comments"；"Annotations are permanent design notes… part of the design documentation… Comments are temporary conversation threads… can be resolved once discussion is complete."
- **Context**: Figma 评论三要素：pin 锚定元素、@ 提及通知、resolve 状态流转。对 agent canvas：用户对产物的标注（"这个按钮颜色不对"）属于 comment 类——预期被 agent 消费后 resolve；而"此区域为广告位，勿动"属于 annotation 类——应长期附着在产物上约束 agent。
- **Confidence**: 高

### Claim 3.2：选区锚定评论是文档类标注的标准范式（Google Docs / GitHub PR）
- **Source**: Google Docs 评论/建议行为（多源）；GitHub Suggested Changes（docs.github.com + 协作指南）
- **URL**: https://docs.github.com/en/get-started/learning-to-code/getting-feedback-on-your-code-from-github-copilot ；https://scs.owasp.org/contributing/3_PRs_and_Reviews/
- **Date**: docs.github.com 2026-03-10
- **Excerpt**: GitHub: 评论可锚定单行或拖拽多行；`suggestion` 代码块给出可提交修改，"Below the suggested change, click **Commit suggestion**"；"Always prefer making 'Suggested Changes' using the ± button… you get attributions (co-author) for the changes you suggested."
- **Context**: 行间评论 + suggestion 块把"评论"升级为"可一键执行的补丁"。对 agent canvas：标注若附带具体修改建议（选中文本+替换文本），agent 可以直接执行而无需猜测意图。多条 suggestion 可 "Add to batch" 合并为一个 commit——粒度介于逐条与全量之间。
- **Confidence**: 高

### Claim 3.3：「选中元素 + 自然语言指令」是 AI 建站工具收敛出的标注范式——先指后说，元素作为引用附加到输入
- **Source**: v0 官方文档《Design mode》；Lovable 官方文档《Edit from the preview》
- **URL**: https://v0.app/docs/design-mode ；https://docs.lovable.dev/features/preview-toolbar
- **Date**: Lovable 2026-09-17（文档更新）；v0 未标注
- **Excerpt**: v0: "select any element in the live preview, tweak its styles with a visual panel (and/or natural-language instructions), and then apply those edits back to your source code… press Cmd+I / Ctrl+I [to toggle Inspect], Escape to deselect"；Lovable: "Click the element you want to change… select multiple elements… Each selected element attaches to the project chat input as a reference, and your prompt applies to all of them… **Point first, then describe**… 'Make this the primary color' is enough."
- **Context**: 关键交互细节：选中元素在 chat 输入框中以 chip/引用形式呈现（可累积多选），prompt 与元素引用一同发送；选区让提示词极短化。v0 还提供"视觉面板直接调样式→回写代码"的非语言通道。这是"标注结构化回传 agent"的最成熟产品化答案。
- **Confidence**: 高（官方文档）

### Claim 3.4：画笔圈选（draw annotation）+ 手绘规整，让空间类反馈可机器理解
- **Source**: Lovable 官方文档《Edit from the preview》FAQ
- **URL**: https://docs.lovable.dev/features/preview-toolbar
- **Date**: 2026-09-17
- **Excerpt**: "Draw annotation mode recognizes simple shapes, including lines, arrows, rectangles, circles, and ovals, and cleans them up so Lovable sees a clear annotation… A sketch shows the where, and your description explains the what… Send a comment thread to Lovable… tag Lovable itself [as instruction]."
- **Context**: 官方明确建议分工："Use Draw annotation for spatial changes. Moving things around, grouping content, deleting regions… faster as a drawing than as a written description." 手绘识别为规整图形后作为图像+结构信息喂给多模态模型。评论线程可直接发给 AI（tag Lovable）作为指令执行——标注与指令的边界被打通。注意计费语义：select/draw 属 build 操作消耗额度，comment 免费。
- **Confidence**: 高（官方文档）

### Claim 3.5：选区内联编辑（"Edit with Claude"/Canvas 高亮）——标注即编辑目标
- **Source**: Anthropic 官方帮助 + 第三方解读；OpenAI Canvas 公告
- **URL**: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them_ ；https://openai.com/index/introducing-canvas/
- **Date**: 2024-10-03（OpenAI）
- **Excerpt**: Claude Markdown artifact："highlight the exact text you want changed, click 'Edit with Claude'… Claude edits right where you marked it"；OpenAI: "You can highlight specific sections to indicate exactly what you want ChatGPT to focus on. Like a copy editor or code reviewer, it can give inline feedback and suggestions."
- **Context**: 文本类产物中"选区"等价于可视化产物中的"选中元素"：都是把自然语言指令的作用域收窄到一个可寻址区间。Canvas 的 inline 建议（ChatGPT 以编辑者身份给选区批注）是"agent 反向标注给用户看"的方向，agent canvas 也应支持双向：用户标注给 agent，agent 建议标注给用户。
- **Confidence**: 高

### Claim 3.6：标注的结构化数据模型已有开源先例（Agentation envelope）：元素路径、bbox、样式快照、intent、severity、状态机
- **Source**: navikt/aksel-arcade GitHub Issue #314（接入 Agentation 标注协议的实现决议）
- **URL**: https://github.com/navikt/aksel-arcade/issues/314
- **Date**: 2026-06-28
- **Excerpt**: "Each Annotation must include the Agentation-compatible annotation envelope… element data, element path, selected text, bounding boxes, CSS/accessibility/computed style metadata, multi-select/fixed flags, React/source metadata, status, thread, intent, severity, placement… New annotations are created as `feedback` annotations with `status: pending`, secure UUID ids, timestamps, and the original human-authored text."
- **Context**: 这是目前公开可见最完整的"标注→agent"schema：标注携带页面 id、元素 selector/组件路径、包围盒、computed style（让 agent 不用截图就能定位和理解上下文）、线程、意图与严重度分类、pending→resolved 状态。强烈建议 agent canvas 的标注数据模型以此为基础裁剪。
- **Confidence**: 高（开源实现决议）

### 标注范式对比小结（推断性综合）
| 范式 | 锚定 | 适合产物 | 回传 agent 的结构 |
|---|---|---|---|
| 选区评论/建议 | 文本 range | 文档/代码 | quoted text + range + suggestion |
| 行间评论 | 行号/hunk | 代码 diff | file + line + suggestion block |
| Pin 标注 | 元素/坐标 | 设计稿/网页 | selector + bbox + computed style |
| 画笔圈选 | 图像区域/形状 | 网页/PPT/图片 | 规整形状 + 截图区域 + 文字说明 |
| 选中元素+指令 | DOM/组件 | 网页/React 产物 | 元素引用 chip + prompt |
- **Confidence**: 中高（综合 Claim 3.1–3.6）

---

## Q4. 人机协作编辑冲突：用户直接编辑 vs agent 继续写

### Claim 4.1：设计原则——"diff, not overwrite"、"provisional 视觉区分"、"一键 undo"是 AI 编辑界面的三条底线
- **Source**: Naresh Rokkam《AI Is Not Autopilot: Designing Copilot Interfaces》
- **URL**: https://www.nr7.in/AI-is-not-autopilot
- **Date**: 2026-08-24
- **Excerpt**: "Never let AI output silently replace what a person made. Show the before and after… AI-generated content should look different from human-authored content until it's accepted… obviously provisional… If a user can't back out of an AI action in a single, obvious move, they'll stop trusting the feature entirely."
- **Context**: 该文总结 Cursor/Linear/Gmail 的共性：用户主动触发、显式前后对比、未接受前的临时态视觉、单步撤销。这四条应作为 agent canvas 产物节点的验收标准。
- **Confidence**: 高

### Claim 4.2：工程实现——per-message 快照 + pending 标记，支持不落盘的 per-block 接受/拒绝与任意消息回滚
- **Source**: Ruslan Sinkevich 博客《Inline diff & snapshots》（自研 VS Code fork "Skycode"）
- **URL**: https://ruslansinkevich.ru/en/blog/inline-diff-snapshots
- **Date**: 未标注
- **Excerpt**: "Each AI message creates a rollback point holding the contents of all changed files BEFORE the change was applied… added lines are inserted as real lines in TextDocument with a 'pending' mark, removed ones are highlighted as a red overlay with line-through. On accept the pending mark is removed… On reject the pending lines are deleted and the original is restored from the snapshot… if AI went the wrong way — one click and you are where you were."
- **Context**: 对照 Cursor 闭源实现的开放替代方案（Continue/Cline 用 workspace.applyEdit 立即落盘、无回滚）。对 agent canvas：agent 的每轮修改应先入"待审层"（pending edits），用户逐块裁决后再合并进产物本体；每条 agent 消息对应一个快照点，支持整轮回滚。
- **Confidence**: 高（含架构细节的一手实现文）

### Claim 4.3：防并发覆盖——agent 写操作前置校验（edit guard），内容过期即阻止并要求重读
- **Source**: pi-diff 开源项目（edit-guard 机制）
- **URL**: https://github.com/buddingnewinsights/pi-diff/
- **Date**: 2026-03-30
- **Excerpt**: "blocks `edit` tool calls whose `oldText` is no longer in the target file, forcing the model to re-read before retrying (prevents stale-oldText retry loops)"；"a `tool_call` handler runs before the tool executes and verifies that every `oldText` in the request is still present… blocked with a clear VERIFY before EDIT error."
- **Context**: 对应人机并发场景的核心风险：用户在 agent 生成期间改了产物，agent 基于旧快照的编辑会覆盖用户内容。前置校验（乐观锁思想：写入前断言基座未变）是最低成本的防线；更完整的方案是 OT/CRDT。
- **Confidence**: 高（开源实现）

### Claim 4.4：企业级协同的完整答案——段落级锁定 + OT/CRDT 自动合并 + 冲突高亮人工裁决（事前隔离/事中提示/事后合并）
- **Source**: WPS 365 官方内容《协同编辑怎么减少冲突？企业级 OT 算法与 CRDT 技术》
- **URL**: https://365.wps.cn/content/137f715766ca425681d2ad5bda63a938.html
- **Date**: 2026-08-16
- **Excerpt**: "系统支持段落级与单元格级精细锁定，当用户编辑特定区域时自动触发编辑锁机制，其他成员可实时查看但无法修改，待保存后自动释放…当检测到同一位置存在不同修改时，通过操作转换技术将冲突内容高亮展示并提供合并建议，支持一键选用或手动调整。完整的版本树管理自动留存历史记录，支持任意时间点秒级回溯…'事前隔离+事中提示+事后合并'三层防护体系。"
- **Context**: 把"人-人协同"机制映射到"人-agent 协同"：agent 写入某段落/节点时相当于持有该区域的编辑锁（UI 上应可见"agent 正在修改此区域"）；用户同时编辑其他区域不冲突；同区域冲突时保留双方版本并高亮裁决。WPS 另述 AI 可"智能分析冲突差异，推荐最佳合并方案"——agent 自身可充当合并建议者。
- **Confidence**: 中高（厂商官方内容，营销语境但机制描述具体）

### Claim 4.5：权限与模式分层是防冲突的产品级手段：Editing/Suggesting/Viewing 三态
- **Source**: Google Docs 三模式（多源交叉）；Slickplan 文档（同款机制的产品化复制）
- **URL**: https://www.deckoholic.ai/tutorials/google-docs/track-changes ；https://help.slickplan.com/articles/using-suggestive-editing-mode
- **Date**: 2026-01-12 / 2026-02-18
- **Excerpt**: "Editing: Direct editing… Suggesting: Changes appear as suggestions that can be accepted/rejected… Viewing: Read-only"；Slickplan 增加："Accept all / Reject all 工具栏 + Hide suggestions（专注写作时隐藏全部建议）"。
- **Context**: 映射到 agent canvas：agent 对产物的写入默认应是 "Suggesting" 级（pending，用户裁决），只有用户显式授权（如 auto-accept 开关）才进入 "Editing" 级（直接落盘）。"Hide suggestions" 提示专注模式下需要一键降噪。Cursor 论坛的回归事故（AI 改动未经 diff 审批直接落盘引发用户投诉，forum.cursor.com/t/154887，2026-03-16）证明默认直接落盘会破坏信任。
- **Confidence**: 高

---

## Q5. Accept/Reject 粒度设计（整文档 / 段落 / 单条建议）

### Claim 5.1：Cursor 的分层粒度：per-hunk accept/reject + 文件级 Accept/Reject File + 全部 Accept All + diff 间键盘导航
- **Source**: Kiro GitHub Issue（对 Windsurf/Cursor/Antigravity 交互的精确描述）；williamspurlock.com（Cursor 0.43 Composer）；键盘快捷键清单
- **URL**: https://github.com/kirodotdev/Kiro/issues/8968 ；https://williamspurlock.com/blog/cursor-043-composer-matures ；https://keyboardcontrols.com/shortcuts/software/cursor-editor/
- **Date**: 2026-05-29 / 2024-11-28 / 2026-04-26
- **Excerpt**: "Added lines highlighted in green… Removed lines… ghost text… **Accept / Reject buttons per hunk or per line**… A toolbar at the top shows 'Accept File' / 'Reject File' for bulk actions… Navigation arrows (↑ ↓) to jump between changes"；Cursor 0.43: "review each file's changes line by line, accept or reject specific modifications, and apply the entire batch with a single confirmation… granular file-by-file control"；快捷键：Cmd+Enter 接受 / Cmd+Backspace 拒绝 / Alt+↓↑ 跳转 diff。
- **Context**: 三层粒度（hunk/文件/全部）+ 键盘流是 AI 代码编辑的既定范式。用户动机原文："I want to accept the validation logic but reject the error message format it chose — per hunk, not all-or-nothing." 注意 Cursor 曾出现"改动未经 diff 审批自动落盘"的回归并引发信任危机（见 Claim 4.5）。
- **Confidence**: 高

### Claim 5.2：文档侧粒度：单条建议 ✓/✗ → 审阅窗格逐条 → Accept all/Reject all + "预览全部接受"
- **Source**: Google Docs 建议模式行为（Deckoholic/Quora 等）；CSA 实测三种只读预览模式
- **URL**: https://www.deckoholic.ai/tutorials/google-docs/track-changes ；https://github.com/CloudSecurityAlliance/csa-google-workspace/blob/main/experiments/docs-suggestions/RESULTS.md
- **Date**: 2026-01-12 / 2025-05-27
- **Excerpt**: "Click on each one to accept or reject the edit… accept or reject all suggestions at once"；API: "`PREVIEW_SUGGESTIONS_ACCEPTED` → text as if accepted… we can compute 'what the doc looks like accepted vs rejected' with read-only calls."
- **Context**: "预览全接受/全拒绝的结果再决定"是批量裁决的安全阀——批量操作前必须能 dry-run。建议 agent canvas 的"全部接受"按钮旁提供"预览接受后效果"。
- **Confidence**: 高

### Claim 5.3：代码评审侧粒度：单条 suggestion 单独 commit，或 Add to batch 合并提交——中间档粒度
- **Source**: GitHub docs（Copilot review 应用建议）；tldr CONTRIBUTING.md；OWASP 评审指南
- **URL**: https://docs.github.com/en/get-started/learning-to-code/getting-feedback-on-your-code-from-github-copilot ；https://raw.githubusercontent.com/tldr-pages/tldr/main/CONTRIBUTING.md
- **Date**: 2026-03-10
- **Excerpt**: "Below the suggested change, click **Commit suggestion**"；"If you want to commit multiple suggestions, go to the 'Files changed' tab and batch all suggestions. Now, click the `Commit suggestions` button… to create a single commit."
- **Context**: 逐条（独立 commit，历史清晰）与批量（一次 commit，效率高）之间的折中：勾选若干条打包。agent canvas 可借鉴：用户从 agent 的一轮修改中勾选部分块"打包接受"。
- **Confidence**: 高

### Claim 5.4：生成时的即时粒度（block 级）：Accept / Discard / Try again / Insert below
- **Source**: NocoDB AI Assistant 文档（Notion AI 同款交互）；lilys.ai 的 Notion AI 使用记录
- **URL**: https://nocodb.com/docs/product/docs/ai-assistant ；https://lilys.ai/en/notes/notion-for-beginners-20251022/how-i-use-notion-tutorial
- **Date**: 2025-10-22（Notion 部分）
- **Excerpt**: "Accept — Apply the AI-generated content (Enter); Discard — Remove the suggestion (Escape); Try Again — Re-run…; Insert Below — Keep your original text and insert the suggestion below"；Notion AI: "Suggested text appears in blue; you must accept, discard, or insert it… Changes are shown in blue text and with a slash through removed text."
- **Context**: "Insert Below"（保留原文、把 AI 版本放下面）是被低估的第四选项——它不裁决，而是保留双版本供后续人工合并，适合用户拿不准的场景。block 级粒度（Notion 的 block 模型）让接受/拒绝天然以块为单位，比字符级 tracked-changes 更轻。Notion AI 未接受前用蓝色+删除线标示临时态（呼应 Claim 4.1）。
- **Confidence**: 高

### Claim 5.5：粒度设计准则（综合推断）
1. **粒度与改动尺寸成反比呈现**：单点改动给单条 ✓/✗；多点改动先按块/hunk 分组，提供"下一块"导航；整体重写只给 Accept/Reject/Compare（此时逐条无意义，应跳到 diff 或双版本对照）。
2. **永远提供三个出口**：接受 / 拒绝 / 搁置（Insert below、跳过、留待之后——Cursor 的 pending 态可跨会话保留）。
3. **批量操作必须有 dry-run/预览**（Claim 5.2）且可一键 undo（Claim 4.1）。
4. **粒度归属数据模型**：每条建议/suggestion 需有独立 id 与状态（pending/accepted/rejected），与产物版本绑定——agent 才能知道"用户拒绝了我上轮的哪一处"并学习（GitHub suggestion id、Google suggestedInsertionIds 均按 id 分组还原逻辑建议，CSA 实测"Reconstructing one logical suggestion means grouping runs by suggestion id"）。
- **Confidence**: 中（基于 5.1–5.4 的综合推断）

---

## 附：对「agent canvas 产物实时可视化节点」的直接映射建议

| 能力 | 推荐范式 | 参照 |
|---|---|---|
| 版本浏览 | 底部版本选择器（默认）+ 侧边时间线（自动快照+命名版本）；探索类产物加分叉 | Claude Artifacts / Figma |
| 版本恢复 | 只读预览 + Restore 生成新版本；恢复前自动保存当前态 | Figma / Allo |
| 文本 diff | inline tracked-changes + 三种视图（原始/全接受/全拒绝） | Google Docs Suggesting |
| 代码 diff | unified/split 切换 + word 高亮 + hunk 折叠 | GitHub / git-diff-view |
| 可视化 diff | side-by-side / wipe / onion / pixel-diff 四模式 + 结构层属性 diff + 噪声遮罩 | Sentry / vrdiff / Percy |
| 标注 | 选区（文本）、选元素（DOM chip）、画笔圈选（规整形状）、pin（元素锚定）四入口 | Canvas / v0 / Lovable / Figma |
| 标注回传 | Agentation 式 envelope：selector+bbox+样式+截图+intent+severity+status | aksel-arcade #314 |
| 冲突 | pending 层不落盘 + oldText 前置校验 + 区域锁 + 冲突高亮裁决 | Skycode / pi-diff / WPS |
| 粒度 | 单条→块→文件/节点→全部，含批量打包与"插入下方/搁置"第三态 | Cursor / GitHub / Notion AI |

## 证据强度说明
- 高置信条目均引自官方文档/公告（OpenAI、Anthropic、Figma、Sentry、v0、Lovable、docs.github.com）或含实现细节的一手开源工程文。
- 中置信条目：Notion Page History 细节（官方 Help 经二手转述）、Cursor 官方文档细节（经日文/中文教程转述）、综合推断部分（已明确标注）。
- 未解决的开放问题：(a) OpenAI Canvas 底部版本 slider 的具体交互仅有社区描述，官方公告只提 back button；(b) PPT 类产物的结构 diff 公开资料极少，现有证据均来自网页/图片领域（Percy/Sentry），PPT 场景为外推；(c) 人机同时编辑同一产物的真实冲突率数据未见公开研究。
