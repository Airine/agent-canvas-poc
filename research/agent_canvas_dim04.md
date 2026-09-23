# Agent Canvas 调研 · 维度04：产物实时预览 / 流式增量渲染的产品与技术方案

> 调研子 agent 报告。覆盖 Claude Artifacts、OpenAI Canvas、v0、Bolt.new、Lovable、WebContainers、Sandpack、流式 Markdown/代码高亮、Gamma/飞书等文档类产物的增量渲染，以及版本切换 UI。
> 独立搜索轮次：20 组（中英文混合）。格式：Claim / Source / URL / Date / Excerpt / Context / Confidence。

---

## 一、设计启示（8 条）

1. **编辑粒度按产物大小自适应，不要一条路走到黑。** 业界实证分界约在 400 行（Aider #625、Cursor 内部测试）：小产物全量重写成功率更高，大产物用 SEARCH/REPLACE 或 unified diff 省 token、且变更范围可控。Aider/Claude Code 均按文件大小切换编辑格式——canvas 节点的编辑策略也应是混合路由，而非单一格式。
2. **"全量重写 + 快速应用"正在成为主流工程解。** Cursor 放弃让前沿模型直接产 diff，转而用专门的 fast-apply 小模型以 ~1000 tok/s（speculative edits）重写全文——规划（大模型出意图）与应用（小模型落地）两段式分离。对 canvas 的含义：即使底层是全量重写，配合快速应用层也能做出"局部在变"的体验。
3. **沙盒渲染用 iframe（跨源 + sandbox 属性 + CSP）是行业默认答案，按复杂度分层。** Anthropic 官方：iframe sandbox + full-site process isolation + 严格 CSP；v0 官方文档给出 `sandbox="allow-scripts allow-same-origin"` 的最小权限模板。单文件组件用 iframe srcdoc/跨源子域即可；多文件全栈项目才需要 WebContainer（WASM 微操作系统）或云端 Sandbox（v0 API 用的 Vercel Sandbox、Lovable 用的云容器）。Shadow DOM 只解决 CSS 隔离、不解决 JS 安全边界，不可作为唯一防线。
4. **"每一步可见"的最优解是结构化增量 + 容错解析，而非朴素打字机。** 朴素逐字渲染在长 Markdown/代码场景会卡死浏览器（每字符触发整篇 AST 重解析）并因未闭合代码块剧烈闪烁。成熟做法：双指针追赶 + 自适应加速打字（掘金实战方案）、Vercel Streamdown 的未闭合块补全（remend）、@shikijs/stream 的增量高亮（不重扫全文）。飞书 CardKit 的解法最优雅：客户端永远传全量文本，平台检测前缀关系自动以打字机续写。
5. **"实时流式预览"应提供可关闭开关（Live preview toggle）。** Lovable 官方文档明确支持关闭 live preview：预览只在一次变更完成后更新，避免构建过程半成品画面干扰用户；版本历史切换也不重启实时环境。给产物节点加"稳定视图/实时视图"双模式是低成本高感知的设计。
6. **非代码产物（PPT/文档/表格）的成熟路线是"结构化数据流 → 声明式渲染"，而非直接渲染流式文本。** Gamma 先生成可编辑大纲、再并行生成全部卡片（2026 年并行 narrative graph，30–60s 出整 deck）；Vercel AI SDK streamObject/partial JSON 让结构化对象逐字段流出并渐进渲染。PPT 类产物的"增量"天然以 slide/card 为最小可见单元。
7. **版本 UI 的最佳实践组合 = 版本选择器（selector）+ 时间线分支 + 对比视图 + 自动快照。** Claude Artifacts：底部版本选择器 + 从旧版本修改自动 fork 分支（不覆盖后续版本）；ChatGPT Canvas：undo/redo + 恢复上一版按钮；Figma Dev Mode：版本时间线 + side-by-side/overlay 对比 + 逐层 added/edited/deleted 标注。关键语义：回到旧版本再编辑应产生分支而非覆盖——这是 Artifacts 用户明确认可的交互。
8. **diff 应用失败必须显式暴露，不允许静默半应用。** "applied 0 of N edits" 是 AI 编辑最常见的静默故障（工具报成功但代码没改）。节点 UI 应把编辑应用结果（成功 hunk 数、失败 hunk、fallback 到全量重写）作为可见状态展示给用户。

---

## 二、技术路线：全量重写 vs Diff 局部应用 vs AST/结构化编辑

### C01
- **Claim**: Cursor 采用两段式 fast-apply：前沿模型输出修改意图（sketch），专门微调的 70B apply 模型用 speculative edits 以 ~1000 tok/s 重写整个文件；比 GPT-4 spec-edits 快 9 倍，比 Llama-3-70b 朴素推理快 13 倍。
- **Source**: Cursor 官方博客 "Editing Files at 1000 Tokens per Second"（原文已下线，多处转载）
- **URL**: https://cursor.com/blog/instant-apply ；转载 https://blog.getbind.co/how-cursor-ai-implemented-instant-apply-file-editing-at-1000-tokens-per-second/
- **Date**: 2024-05-14（原发）；2024-10-02（转载）
- **Excerpt**: "We've trained a specialized model on an important version of the full-file code edit task called fast apply… We achieve speeds of ~1000 tokens/s on our 70b model using a speculative-decoding variant tailored for code-edits, called speculative edits. This means a ~13x speedup over vanilla inference using Llama-3-70b."
- **Context**: 规划/应用分离架构。佐证"全量重写 + 快速应用层"可以兼得可靠性（避免 diff 失败）与速度/局部感。
- **Confidence**: 高（官方博客原文多处独立转载，数字一致）。

### C02
- **Claim**: 实证分界：400 行以下全量重写成功率高于 diff；400 行以上 diff 在 token 经济性上胜出。Aider issue #625（2024-06）、Cursor instant-apply（2024-10）、Morph fast-apply（2025）三方结论收敛。
- **Source**: Aider GitHub issue #625；深度分析文 "Why AI coding tools rewrite full files instead of using diffs"
- **URL**: https://github.com/Aider-AI/aider/issues/625 ；https://anishgandhi.com/why-ai-tools-dont-use-diffs/
- **Date**: 2024-05-29（issue）；2026-01-16（分析文）
- **Excerpt**: "We find that fully rewriting the full file outperforms aider-like diffs for files under 400 lines." / "Around 400 lines is the empirically observed boundary… Below that, full-file rewrites have a higher success rate… Above 400 lines, rewrite cost grows linearly while diff success rate stays roughly constant."
- **Context**: Cursor 工程师 Aman Sanger 的推文被 Aider 作者引用并实测。分析文还指出 Morph 的 fast-apply API 可将重写 token 消耗降 50–60%、延迟降 90%+（1000 行文件 1.3s vs Sonnet 全量重写 10–12s）。
- **Confidence**: 高。

### C03
- **Claim**: Aider 的 SEARCH/REPLACE 块格式：LLM 输出精确的查找文本与替换文本，应用端用级联匹配策略（exact → whitespace-insensitive → indentation-preserving → difflib fuzzy）；比全量重写更不易幻觉未改动代码，比行号 diff 更抗文件漂移。
- **Source**: starlog.is 技术解析；fabianhertwig.com "How AI Assistants Make Precise Edits"
- **URL**: https://starlog.is/articles/developer-tools/aider-ai-aider/ ；https://fabianhertwig.com/blog/coding-assistants-file-edits/
- **Date**: 2026-05-09；2025-04-26
- **Excerpt**: "Aider applies these blocks using fuzzy matching—finding the SEARCH content even if whitespace or nearby lines have shifted." / "When applying Search/Replace blocks, Aider attempts multiple matching strategies sequentially: 1. Exact match. 2. Whitespace-insensitive match. 3. Indentation-preserving match. 4. Fuzzy match using difflib."
- **Context**: 适合 canvas 节点做"局部编辑可见"：每个 hunk 的应用可做成一次可见的操作步骤。
- **Confidence**: 高。

### C04
- **Claim**: 多轮 agent 场景下 diff 格式可靠性下降（如 Gemini 2.5 Flash diff 模式频繁三次反射失败），whole-code 全量格式反而整体最稳；2026 年严肃 coding agent 的共同选择是 unified diff（行号锚定、失败时响亮报错）。
- **Source**: OpenReview 论文（MT-SECCODEPLT 基准）；modern-ai-guide 文档
- **URL**: https://openreview.net/pdf/0a3bc2ca1a28fe7de0cdc2b00b66116b8f68d99e.pdf ；https://github.com/tonyx1998/modern-ai-guide/blob/main/docs/10-patterns/coding-agents.md
- **Date**: 论文未标注（2025/2026）；2026-05-24
- **Excerpt**: "When considering both single-turn and multi-turn tasks, the whole code format-which rewrites the full updated code in every turn-tends to be more stable overall." / "Unified diffs anchor edits precisely and fail loudly rather than silently corrupting code… Whole-file rewrite… wastes tokens, invites unrequested 'improvements,' and is hard to review."
- **Context**: 两来源观点有张力（diff 可审计 vs whole 更稳），说明没有银弹；支持"按场景路由"。
- **Confidence**: 中高（论文结论限定于特定基准）。

### C05
- **Claim**: OpenAI Canvas 训练模型自主决定"targeted edit vs 全量重写"：用户在界面中显式选中文字时倾向 targeted edit，否则倾向 rewrite；canvas 的 targeted edits 比 prompted GPT-4o 基线高 18%。
- **Source**: OpenAI 官方 "Introducing canvas"
- **URL**: https://openai.com/index/introducing-canvas/
- **Date**: 2024-10-03
- **Excerpt**: "We trained the model to perform targeted edits when users explicitly select text through the interface, otherwise favoring rewrites… For writing and coding tasks, we prioritized improving canvas targeted edits. GPT‑4o with canvas performs better than a baseline prompted GPT‑4o by 18%."
- **Context**: 用户选择（selection）本身成为编辑粒度的信号——canvas 节点可借鉴：用户圈选 = 局部编辑意图。
- **Confidence**: 高（官方）。

### C06
- **Claim**: Claude Artifacts 倾向全量重写而非 targeted edit，"只改按钮颜色"的提示可能悄悄改动其他逻辑；社区建议 republish 前先 diff 新旧版本。Markdown 文档类型支持选中片段 "Edit with Claude" 局部编辑。
- **Source**: hostsmith.net 实操指南；dev.to Artifacts 解析
- **URL**: https://hostsmith.net/blog/publish-claude-artifact/ ；https://dev.to/gabipdeutner/claude-artifacts-code-isolation-version-iteration-and-diagrams-with-mermaid-3i4i
- **Date**: 2026（无具体日期）；2026-07-12
- **Excerpt**: "Claude tends to do full rewrites rather than targeted edits, so a 'just change the button colour' prompt can quietly alter logic elsewhere. Diff the new version against the previous one before you republish." / "Select the piece of text you want to change, click 'Edit with Claude,' and describe your modification. Claude will edit only that specific snippet."
- **Context**: 观察性事实（非官方文档）；与 Anthropic 官方"版本选择器"机制互为印证。
- **Confidence**: 中（多来源一致的实践观察）。

### C07
- **Claim**: 结构化/AST 级编辑路线：Vercel AI SDK streamObject（partialOutputStream / useObject）按 Zod schema 流出部分 JSON 对象，客户端渐进渲染字段；LangChain 社区确认其 withStructuredOutput 只在完成后给出结构化值，不流式——结构化流式需 SDK 原生支持或行级 JSON 协议。
- **Source**: Vercel AI SDK 官方文档；LangChain forum；digitalapplied 分析
- **URL**: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data ；https://forum.langchain.com/t/how-to-stream-a-json-by-using-a-chat-provider/1638 ；https://www.digitalapplied.com/blog/llm-structured-output-json-reliability-production
- **Date**: 文档无日期；2025-09-25；2026-08-14
- **Excerpt**: "With streamText and output, you can stream the model's structured response as it is generated… you can consume the structured output on the client with the useObject hook." / "withStructuredOutput() uses a parser that validates the full message; it does not yield partial objects."
- **Context**: Gemini 官方确认 "The streamed chunks are valid partial JSON strings that can be concatenated"。注意坑：单一大字符串字段的 schema 实际不会渐进流（Vercel 社区 2025-10 报告）。
- **Confidence**: 高。

### C08
- **Claim**: AST 编辑（如 tree-sitter 驱动的结构化 patch）是"没人用的第 7 种格式"：主要工具仍是 whole file / search-replace / udiff 三主流；Cursor 用 70B apply 模型 + speculative decoding 把 whole-file 变快，而非转向 AST。
- **Source**: Geometric AGI 博客 "AST Edits: The Code Editing Format Nobody Uses"
- **URL**: https://geometricagi.github.io/2026/04/02/ast-edits.html
- **Date**: 2026-04-02
- **Excerpt**: "The first three are formats used by major coding tools today: 1. Whole file… 2. Search/replace… It always works, but on a 4,200-line file the model has to regenerate the entire thing to change 5 lines."
- **Context**: AST/结构化编辑理论优美但训练数据稀缺、模型不擅长；当前工程重心在"应用层提速"而非"格式升级"。对 canvas：结构化编辑的价值在 UI 层（块级产物）而非 LLM 输出格式层。
- **Confidence**: 中高（单一来源但有 benchmark 支撑）。

---

## 三、渲染沙盒：iframe / WebContainer / Shadow DOM

### C09
- **Claim**: Claude Artifacts 官方架构：iframe sandbox + full-site process isolation + 严格 CSP 限制网络访问；初期原型用 Streamlit，小团队 3 个月建成；最难的部分是健壮的代码执行沙盒。
- **Source**: The Pragmatic Engineer, "How Anthropic built Artifacts"（Gergely Orosz 采访 Anthropic 5 名成员）
- **URL**: https://newsletter.pragmaticengineer.com/p/how-anthropic-built-artifacts （摘录经 Simon Willison 博客）
- **Date**: 2024-08-27
- **Excerpt**: "We use iFrame sandboxes with full-site process isolation. This approach has gotten robust over the years. This protects users' main Claude.ai browsing session from malicious artifacts. We also use strict Content Security Policies (CSPs) to enforce limited and controlled network access."
- **Context**: Artifacts 托管在独立域 claudeusercontent.com，单文件 payload，冻结库集（React/Tailwind/Recharts/shadcn/Lucide/D3/Three.js r128/lodash/mathjs/Papaparse），禁 localStorage/外部 fetch（后续版本逐步放开）。
- **Confidence**: 高。

### C10
- **Claim**: v0 API 官方沙盒方案：每个 chat 是隔离 workspace，在 Vercel Sandbox（云端）起 dev server，preview URL 经服务端代理 + 短期 token 供 iframe 嵌入；官方 iframe 模板要求 `sandbox="allow-scripts allow-same-origin"`（HMR/cookie/storage 需要 same-origin），并说明 `allow-same-origin` 保持的是代理隔离源、不与父页同源。
- **Source**: Vercel 官方博客 "Introducing the new v0 API"；v0 官方文档 "Accessing Previews"
- **URL**: https://vercel.com/blog/introducing-the-new-v0-api ；https://v0.app/docs/api/v2/guides/accessing-previews
- **Date**: 2026-08-05；文档无日期
- **Excerpt**: "Send a prompt and v0 generates an app, starts a dev server in a Vercel Sandbox, and gives you a preview URL you can embed in your own UI." / "allow-same-origin lets the document keep the isolated proxy's origin instead of receiving an opaque origin. This is required for origin-sensitive runtime behavior such as HMR, cookies, and browser storage."
- **Context**: 官方最小权限模板 + 代理隔离源是可复用设计：canvas 节点若需 HMR/存储，必须用独立源 + allow-same-origin，否则拿到 opaque origin 后 storage 全废。
- **Confidence**: 高（官方）。

### C11
- **Claim**: WebContainers = WebAssembly 微操作系统，在浏览器 tab 内跑完整 Node.js（npm/pnpm/bash/dev server），毫秒级启动、npm install 比本地快 10×；构成 Bolt.new 的护城河（7 年研发），单位经济学反转——预览零服务器成本，而 Lovable 用云容器（Fly.io/Modal）每次预览烧后端算力。
- **Source**: StackBlitz 官方博客；Bolt.new teardown（Sacra/Lenny's Newsletter 综合）；知乎技术文
- **URL**: https://blog.stackblitz.com/tags/webcontainers/ ；https://www.openaitoolshub.org/ai-product-research/bolt-new ；https://zhuanlan.zhihu.com/p/1932389348478816723
- **Date**: 2021-05（首篇）；2026-05-15；2025-07-26
- **Excerpt**: "Introducing WebContainers, a new type of WebAssembly-based operating system that boots instantly and enables Node.js environments to run natively in-browser." / teardown: "基于 WebAssembly + Service Worker + 自研 Rust 文件系统 + 虚拟化 TCP 网络栈… 启动时间：毫秒级… npm install 10× faster than local… This inverts AI app builder unit economics."
- **Context**: 限制：只能跑 JS/WASM，无原生 addon（sharp/bcrypt 等不可用），Python 仅实验性纯 Python 无 pip；Chrome/Edge 完整支持，Firefox 部分支持。分层建议：单文件产物用 iframe 即可，全栈多文件才上 WebContainer。
- **Confidence**: 高。

### C12
- **Claim**: Sandpack（CodeSandbox）客户端架构：SandpackRuntime 在指定 iframe 内挂载 codesandbox.io 同款 bundler 浏览器内打包运行；SandpackNode 挂载 Nodebox 实例执行 Node 框架；React 组件层管理 UI 状态。
- **Source**: Sandpack 官方文档（Architecture / Client）
- **URL**: https://sandpack.codesandbox.io/docs/architecture/overview ；https://sandpack.codesandbox.io/docs/advanced-usage/client
- **Date**: 无日期（持续更新）
- **Excerpt**: "SandpackRuntime mounts the bundler used on codesandbox.io and runs runtime JavaScript frameworks in-browser, while SandpackNode mounts a Nodebox instance, which is designed to execute Node.js frameworks and applications."
- **Context**: iframe 内嵌 bundler 的开源成熟方案，适合 canvas 节点直接集成；比 WebContainer 轻、但无后端能力（Nodebox 层补齐部分）。
- **Confidence**: 高（官方文档）。

### C13
- **Claim**: Shadow DOM 只做 CSS/DOM 样式隔离，共享 window 全局（JS 命名空间冲突、无安全边界）；iframe 提供浏览器级完全隔离（样式、JS、认证），代价是 postMessage 通信与无法直接 DOM 访问。官方平台（Unqork）同时提供两种模式并列出权衡表。
- **Source**: Unqork 官方文档 Embedded UI Iframe Mode Reference；HackerNoon 对比文
- **URL**: https://docs.unqork.io/docs/embedded-ui-iframe-mode-reference ；https://hackernoon.com/shadow-dom-vs-iframes-which-one-actually-works
- **Date**: 2026-07-10；2025-07-15
- **Excerpt**: "CSS isolation: Shadow DOM (good, not perfect): inherited properties like font, color, and cursor can leak in… Iframe: Browser-level: complete isolation; no style leakage in either direction." / "JS global isolation: Shared window… Iframe: Separate browsing context with complete JavaScript isolation."
- **Context**: 结论：不可信 AI 生成代码的安全隔离必须 iframe（或更强）；Shadow DOM 仅适合可信内容的样式防串扰。
- **Confidence**: 高。

### C14
- **Claim**: iframe 安全最佳实践共识：默认空 sandbox 后逐项加权限；不可信内容绝不同时给 allow-scripts + allow-same-origin（同源自毁 sandbox）；配合 CSP frame-ancestors / Permissions-Policy / COOP/COEP 纵深防御；校验 postMessage origin。
- **Source**: CoddyKit HTML Academy；WorkOS；Invicti
- **URL**: https://www.coddykit.com/courses/html/iframe-sandboxing-and-permissions-policy-4785701 ；https://workos.com/blog/security-risks-of-iframes ；https://www.invicti.com/blog/web-security/iframe-security-best-practices
- **Date**: 2026-08-29；2025-04-10；2026-07-27
- **Excerpt**: "Sandbox iframes by default and add only the tokens the content needs. Avoid allow-scripts+allow-same-origin for untrusted content… Combine with CSP and COOP/COEP for defense in depth."
- **Context**: 与 C10 的张力值得注意：v0 官方给 allow-scripts+allow-same-origin，但前提是预览跑在"隔离代理源"上（隔离由独立源保证，sandbox 令牌限制能力）。canvas 设计应复制这个"独立源 + 能力最小化"组合。
- **Confidence**: 高。

---

## 四、"每一步可见"的交互：打字机 vs 结构化增量 vs 步骤切换

### C15
- **Claim**: 朴素逐字打字机在长 Markdown 流式场景有 4 大致命缺陷：数组拷贝 GC 抖动、与 SSE 累加流不兼容、每字符 setState 导致每帧整篇 Markdown AST 重解析卡死渲染线程、未闭合代码块处解析崩溃闪烁。工程解：双指针追赶 + 自适应加速（积压>50 字符按比例加速）+ 结构感知补全（奇数 ``` 自动补闭合）+ 定时批量渲染。
- **Source**: 掘金实战文 "AI 对话流式输出：实现'逐字丝滑、不闪烁、不卡顿'的打字机效果"
- **URL**: https://juejin.cn/post/7628156673577926694
- **Date**: 2026-04-14
- **Excerpt**: "逐字触发 React 渲染卡死页面：每消费一个字符就触发一次 setState。由于 AI 回复的是 Markdown，每一次重绘都要经历完整的 Markdown AST 解析… 缺失结构感知导致闪烁：一旦在代码块中间停顿，Markdown 解析引擎会崩溃，下一帧闭合时页面会剧烈闪烁跳跃。"
- **Context**: 含完整 React hook 实现代码；是中文社区对该问题最系统的踩坑总结。
- **Confidence**: 中高（单篇实战文，但问题与解法与 Vercel Streamdown 设计相互印证）。

### C16
- **Claim**: Vercel Streamdown（开源，2025-08 发布）是流式 Markdown 渲染的事实标准组件：react-markdown 的 drop-in 替代，用 remend 补全未闭合块（bold/italic/code/link/heading），内置 GFM/KaTeX/Mermaid/Shiki，memoized 渲染，rehype-harden 安全加固；v2.5 加入 staggered streaming animations（词/字符级联动画，默认 40ms）。
- **Source**: Vercel 官方 changelog + GitHub
- **URL**: https://vercel.com/changelog/introducing-streamdown ；https://github.com/vercel/streamdown ；https://vercel.com/changelog/streamdown-2-5
- **Date**: 2025-08-21；2026-03-16（v2.5）
- **Excerpt**: "Streamdown is built specifically to handle the unique requirements of streaming Markdown content from AI models, providing seamless formatting even with incomplete or unterminated Markdown blocks." / v2.5: "Streaming word and character animations now cascade sequentially rather than animating all at once."
- **Context**: 驱动 Vercel AI Elements 的 Response 组件；已有 Svelte 社区移植。canvas 的 Markdown 产物节点可直接复用。
- **Confidence**: 高（官方开源）。

### C17
- **Claim**: @shikijs/stream（原 antfu/shiki-stream）做代码流式增量高亮：代码按 chunk 到达时逐块着色，不重扫整个文档；提供 CodeToTokenTransformStream 与 React/Vue/Solid 渲染器。
- **Source**: Shiki 官方文档 + GitHub
- **URL**: https://shiki.style/packages/stream ；https://github.com/antfu/shiki-stream
- **Date**: 文档无日期；2026-06-03（迁移说明）
- **Excerpt**: "Streaming colorization for Shiki. Useful for highlighting text streams like LLM outputs, where code arrives incrementally and you want each chunk highlighted as it lands without re-tokenizing the whole document."
- **Context**: 与 Streamdown 组合覆盖"流式代码块"两端：结构容错 + 增量高亮。
- **Confidence**: 高（官方）。

### C18
- **Claim**: 飞书 CardKit 流式卡片更新采用"全量文本 + 平台侧前缀增量打字机"协议：客户端每次 update 传全量文本，若新文本以旧文本为前缀则平台以打字机效果续写尾部，否则直接全量上屏；客户端自己算增量反而触发 bug（文字闪现消失）。
- **Source**: 飞书 CardKit 官方 API 文档（经 GitHub issue 根因分析引用）
- **URL**: https://github.com/m1heng/clawdbot-feishu/issues/446 （引用 https://open.feishu.cn/document/cardkit-v1/card-element/content）
- **Date**: 2026-06-04
- **Excerpt**: "Pass the full text content — If the old text is a prefix substring of the incoming new text, the new text will continue to be output in typewriter effect at the end of the old text; if the old and new text have different prefixes, the full amount of text will be output directly onto the screen, without typewriter effects."
- **Context**: 极为优雅的协议设计：客户端简单（永远全量）、平台兜底体验（前缀检测自动动画化）。canvas 节点渲染层可采用同款"全量快照 + 前缀增量动画"语义。
- **Confidence**: 高（官方 API 文档原文）。

### C19
- **Claim**: 主流 UX 共识：流式渲染应"平滑连续增长、无逐字机械动画、有明确进行中指示"；流式把感知延迟降到亚秒级（首块 ~200ms–1s 到达），总时长不变但体验评价完全不同；对话产品把"首字时间"而非总时长作为核心指标。
- **Source**: GitHub issue（THEO 项目 streaming UX 规范）；百度智能云 DeepSeek 流式实战；yun88 Kimi 接入指南
- **URL**: https://github.com/dannxevans/theo/issues/268 ；https://cloud.baidu.com/article/4781589 ；https://www.yun88.com/news/10364.html
- **Date**: 2026-01-03；2025-11-06；2026-07-30
- **Excerpt**: "Text flows smoothly and naturally, not with a character-by-character 'typewriter' effect… The message visually grows as a coherent block rather than flashing or jumping." / "流式输出是对话产品的体验底线配置，不是锦上添花… 对话类产品把首字时间当核心指标而非总时长。"
- **Context**: 工程注意点：Nginx 等中间层要禁缓存防攒批、长回答要心跳保活、中断要向上游取消省 token。自动滚动"用户上翻后暂停跟随"是常见细节。
- **Confidence**: 高（多来源一致）。

### C20
- **Claim**: Lovable 官方提供 Live preview 开关：开启时预览实时运行、随 agent 工作逐变；关闭时预览只显示最近完成版本，变更完成后才更新，版本历史切换不重启实时环境。
- **Source**: Lovable 官方文档 "Preview and test your app"
- **URL**: https://docs.lovable.dev/features/projects/preview
- **Date**: 2026-09-10（文档抓取时间）
- **Excerpt**: "By default, the preview runs your app live so you can watch changes appear as Lovable works. If you'd rather have a steadier preview, open Project settings → General → Preview and turn Live preview off… The preview shows the most recent completed version of your app, and updates when Lovable finishes a change rather than while it works."
- **Context**: "构建过程半成品画面"对部分用户是干扰；步骤切换（step-gated）与实时流是互补模式而非互斥。
- **Confidence**: 高（官方文档）。

---

## 五、非代码产物（Markdown / PPT / 表格）的实时渲染

### C21
- **Claim**: Gamma 的生成流程是"大纲优先 + 卡片并行生成"：先产出可编辑中间大纲（结构在此阶段修改成本最低），用户确认后 30–60s 生成完整 deck；2026 架构改为并行 narrative graph（所有 slide 同时生成而非顺序）+ 生成式布局引擎（替代模板匹配）。产物单元是 card（web-native 卡片布局），与 PPT 固定画幅不兼容导致导出错位。
- **Source**: Flowith 架构分析；betterap/Alai 实操测评
- **URL**: https://flowith.io/blog/gamma-app-2026-one-sentence-prompt-polished-deck-60-seconds/ ；https://betterap.com/how-to-use-gamma-app/ ；https://getalai.com/blog/gamma-alternatives
- **Date**: 无日期（2026）；2026-07-30；2026-04-20
- **Excerpt**: "Gamma generates an intermediate outline first, before it builds any slides… the structure decided at this stage is far cheaper to fix here than after full slides exist." / "The most significant leap came from the parallel narrative graph, which generates all slides simultaneously rather than sequentially."
- **Context**: 对 canvas PPT 节点启示：①大纲/结构预览先于完整渲染；②slide/card 是天然增量可见单元；③web-native 布局引擎 vs 固定画幅是导出兼容性根源。
- **Confidence**: 中（Gamma 官方未公开架构细节，来源为第三方分析，多个来源一致）。

### C22
- **Claim**: Thesys Agent Builder 展示 PPT agent 的理想增量渲染：agent 生成 deck 时逐 slide 实时渲染（live streaming rendering），完成后可 prompt 单页修改或手工编辑，导出 PDF/PPTX。
- **Source**: Thesys 官方博客
- **URL**: https://www.thesys.dev/blogs/claude-in-powerpoint
- **Date**: 2026-02-09
- **Excerpt**: "Live, streaming rendering: As the agent generates the deck, you can see slides rendered in real time instead of waiting for a full presentation to finish. Prompt-based editing: You can refine individual slides using natural language prompts… without starting over."
- **Context**: 厂商自述，但指明了 PPT 类产物的增量粒度共识：slide 级流式出现 + slide 级局部编辑。
- **Confidence**: 中（厂商营销文，能力声明性质）。

### C23
- **Claim**: 结构化文档的增量更新成熟方案是 CRDT（Yjs/YATA）：文档建模为共享类型树，只传增量二进制 update（非全量状态），Transaction 批量变更并发出细粒度 observer 事件（细到可替代 virtual DOM），天然支持协作/历史回放；BlockSuite（AFFiNE）等文档编辑器以此构建 CRDT-native 编辑器。
- **Source**: Yjs 生态文档；BlockSuite 官方博客；Eg-walker 论文
- **URL**: https://clawbot.ai/wiki/applications/yjs-collaborative-editing-crdt.html ；https://blocksuite.io/blog/document-centric ；https://arxiv.org/html/2409.14252v1
- **Date**: 2026-02-01；2024-01-10；2024-09-21
- **Excerpt**: "Highly granular event notifications are sent when document tree nodes are updated, potentially replacing the need for a virtual DOM! … incremental encoding of partial updates to the document is also possible." / "Incremental Updates: Transmits only changes, not the full document state."
- **Context**: 对 canvas 的双向价值：①agent 编辑文档产物时可复用 Y.Doc 作为单一事实源，渲染 = 订阅增量事件；②版本历史/回放 = 事件图 replay（Eg-walker 形式化论证）。
- **Confidence**: 高。

### C24
- **Claim**: Claude Artifacts 对非代码产物的处理：Markdown 渲染为排版文档、Mermaid/SVG 直接渲染；2025 年底起可产出 .docx/.pptx/.xlsx/.pdf 下载文件（skills 系统）并在面板渲染 PDF；发布版 artifact 有 20MB 持久存储与 MCP 连接（Live Artifacts 从静态快照变为打开即刷新数据）。
- **Source**: getmasset 2026 指南；eigent.ai Live Artifacts 指南
- **URL**: https://www.getmasset.com/resources/claude-artifacts-for-marketers ；https://www.eigent.ai/blog/claude-live-artifacts-guide
- **Date**: 2026-05-28；2026-04-21
- **Excerpt**: "Claude can additionally render PDFs in the panel and produce downloadable .docx, .pptx, .xlsx, and .pdf files via its skills system as of late 2025." / "Earlier Artifacts showed you what something looked like at the moment it was generated. Live Artifacts show you what something looks like right now."
- **Context**: 表格类产物（xlsx/CSV→图表）在 Artifacts 里靠冻结库（Papaparse/Recharts）单文件渲染；PPT 尚非原生渲染类型（导出文件为主）。
- **Confidence**: 中高（第三方指南，与 Anthropic 帮助中心功能描述一致）。

---

## 六、版本切换 / 时间线 UI 最佳实践

### C25
- **Claim**: Claude Artifacts 版本机制：每次修改自动保存新版本；底部左侧版本选择器可回溯；从旧版本发起修改会 fork 时间线（不覆盖后续版本）形成分支；编辑早期对话轮次会产生带独立 artifacts 集合的对话分支。
- **Source**: Anthropic 帮助中心（官方）；hostsmith.net 实操；Plannotator 指南
- **URL**: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them_ ；https://hostsmith.net/blog/publish-claude-artifact/ ；https://docs.plannotator.ai/learn/ai-development/claude-artifacts
- **Date**: 官方文档无日期；2026；2026-08-09
- **Excerpt**: "These edits won't change Claude's memory of the original Artifact content, and you can switch between each version using the version selector at the bottom left of the Artifact." / "If you go back to Version 3 and ask for a change there, Claude doesn't overwrite the versions that came after; it forks the timeline from that point, so you end up with a branch."
- **Context**: "旧版本 + 新编辑 = 分支而非覆盖"是最值得借鉴的版本语义。
- **Confidence**: 高（官方 + 多方实操印证）。

### C26
- **Claim**: ChatGPT Canvas 版本 UI：右上角"恢复此版本"/undo-redo 按钮回退到上一版（2024 发布时为 restore previous version 按钮）；版本历史以 icon 操作呈现，支持撤销/重做语义。
- **Source**: OpenAI 发布报道（TechCrunch/Tom's Guide）；Stanford IT 帮助文档
- **URL**: https://www.tomsguide.com/ai/chatgpt/openai-launches-chatgpt-canvas-an-ai-powered-writing-and-code-editor ；https://stanford.service-now.com/it_services?id=kb_article&sys_id=1ba97f693331c71471a18d055d5c7bca
- **Date**: 2024-10-03；无日期
- **Excerpt**: "You can use version history icons to revert to previous version. Click Undo to go back to previous version… Or we can re-apply the changes by clicking on Redo."
- **Context**: Canvas 的版本模型比 Artifacts 更简单（线性 undo/redo），无分支概念。长度/阅读水平 slider 是"参数化整体变换"的 UI，与版本无关但适合 canvas 节点借鉴。
- **Confidence**: 中高（版本 UI 细节以二手文档为主）。

### C27
- **Claim**: Figma Dev Mode 的版本对比是"时间线 + 结构化差异"范式：版本历史时间线（手动保存 + 自动保存）、side-by-side / overlay 双视图、逐 layer 标注 Edited/Added/Deleted 并可点击缩放定位、focus view 中可对任意旧版本 "Compare to latest version"。
- **Source**: Figma 官方帮助文档
- **URL**: https://help.figma.com/hc/en-us/articles/15023193382935-Compare-changes-in-Dev-Mode
- **Date**: 无日期（现行文档）
- **Excerpt**: "View a timeline of the file's history, including saved and autosaved versions… Layer changes are labeled as one of the following: Edited / Added / Deleted… Clicking on a layer in the list zooms in to the selected layer in the side by side or overlay view."
- **Context**: 视觉产物版本对比的黄金标准：差异不是文本 diff 而是结构化（层级/元素级）标注 + 双视图。
- **Confidence**: 高（官方）。

### C28
- **Claim**: Bolt.new v2 增加"智能 diff 检视与版本回滚 + GitHub 仓库即时同步"；业界共识是版本历史应自动快照 + 关键节点手动命名（Figma "Save to Version History"实践）。
- **Source**: aicoder.com 新闻；kaarwan Figma 版本管理实践
- **URL**: https://aicoder.com/news/news-20260826-stackblitz-bolt-v2 ；https://www.kaarwan.com/blog/ui-ux-design/design-workflow-tips-for-managing-figma-files-and-versions?id=901
- **Date**: 2026-08-25；2024-09-21
- **Excerpt**: "Intelligent diff inspection and version rollback with instant GitHub repo synchronization" / "Label Important Versions: Use Figma's 'Save to Version History' option to create manual saves at critical stages."
- **Context**: 自动快照（每次 agent 操作）+ 手动里程碑命名 + 同步外部版本库（Git）三层组合是完整答案。
- **Confidence**: 中（Bolt v2 为新闻稿性质）。

---

## 七、补充证据与负结果

### C29（负结果/空白）
- **Claim**: Notion AI、Gamma、Lovable 均未公开其流式增量渲染的前端技术实现细节（无官 方工程博客）；飞书智能伙伴官方仅宣传能力（自动续写/生成文档/表格/思维导图），未披露渲染协议细节——CardKit 流式更新协议（C18）是飞书体系唯一可考的技术事实。
- **Source**: 多轮定向搜索（Notion AI streaming implementation / Gamma engineering blog / 飞书 AI 流式渲染）均返回 0 条或仅营销内容
- **URL**: https://www.news.cn/tech/20231123/b0d79a43182d4c09b322eb71d3e97ca6/c.html （飞书智能伙伴发布稿）
- **Date**: 2023-11-23
- **Excerpt**: "在创作中，飞书智能伙伴也能自动续写或生成文档、表格、邮件、思维导图、问卷等等。"
- **Context**: 这些产品的内部实现只能从其公开 API/第三方复现逆向推断；报告相应结论置信度受限。
- **Confidence**: 高（对"无公开资料"这一事实本身）。

### C30（交互范式补充）
- **Claim**: "产物面板（Artifact Pane）+ 聊天分栏"已被 UX 分析界认定为 AI 内容创作界面的顶级模式："文本流是短暂的，顶级应用用分栏：左聊天、右产物，用户迭代输出而不丢失会话线索"；配合 skeleton screen 与思维链状态文案（"正在检索…正在起草…"）管理等待感知。
- **Source**: Wildnet Edge UX 分析
- **URL**: https://www.wildnetedge.com/blogs/how-to-design-the-user-experience-ux-for-a-conversational-app
- **Date**: 2026-01-05
- **Excerpt**: "The 'Artifact' Pane: When designing prompt flows for content creation (like coding or writing), text streams are ephemeral. Top-tier apps use a split-screen approach: chat on the left, 'Artifact' (the code or draft) on the right. This allows the user to iterate on the output without losing the conversation thread."
- **Context**: 佐证 agent canvas 把产物可视化为独立节点的设计方向本身符合主流范式演进。
- **Confidence**: 中（行业评论，非一手研究）。

---

## 附：关键产品-技术对照速查

| 产品 | 编辑格式 | 渲染沙盒 | 增量体验 | 版本 UI |
|---|---|---|---|---|
| Claude Artifacts | 偏全量重写；MD 支持选区局部编辑 | 跨源 iframe + 全站进程隔离 + CSP（claudeusercontent.com） | Preview/Code 双 Tab，更新即刷新 | 底部版本选择器 + fork 分支 |
| ChatGPT Canvas | 模型自主 targeted edit vs rewrite（选区触发局部） | 文档/代码编辑器内嵌（非 iframe） | 局部编辑原地更新 + inline 建议 | undo/redo + restore 按钮（线性） |
| v0 | 对话迭代（内部 sandbox agent） | Vercel Sandbox dev server + 代理 iframe（allow-scripts allow-same-origin） | 实时预览 + 可视进度指示 | 版本历史（chat 状态） |
| Bolt.new | 全栈文件编辑（agent 直写文件树） | WebContainer（WASM 浏览器内 Node.js） | 文件落盘 → dev server HMR 即时刷新 | v2: diff 检视 + 版本回滚 + GitHub 同步 |
| Lovable | agent 编辑 + 云容器构建 | 云容器（Fly.io/Modal）+ 预览 iframe | Live preview 可开关：实时 / 完成步进 | 版本历史切换不重启环境 |
| Gamma | 大纲→并行卡片生成；卡片级 AI 编辑 | web-native 卡片布局引擎 | 卡片单元渐次出现（30–60s 全 deck） | （未见公开版本时间线） |
| 飞书 CardKit | 全量文本协议 | 平台卡片渲染器 | 前缀检测自动打字机续写 | — |

## 遗留问题
1. v0 官方预览的具体增量更新粒度（HMR 级还是整页级）未见官方技术文披露。
2. OpenAI Canvas 的版本存储模型（线性栈 vs 快照链）无官方说明，仅有 UI 层观察。
3. Morph fast-apply API 的独立第三方评测较少，数字主要来自厂商与二手分析。
