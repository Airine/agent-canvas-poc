# 通用 UI：已使用与未完成代码分开看

## 产品正在使用

- `button.tsx` / `button-variants.ts`：主页、原型入口、聊天与旧版审批按钮。
- `switch.tsx`：共享连线图例的切换控件。
- `sonner.tsx`：产品画布和两套原型的通知容器。

## 尚未接入，保护未提交工作

| 职责 | 组件／上下文 | 保留依赖 |
| --- | --- | --- |
| 表单与日期 | form、form-context、calendar | label，已使用的 Button |
| 导航与确认 | navigation-menu、navigation-menu-variants、pagination、alert-dialog | 已使用的 Button / button-variants |
| 控件变体 | badge、badge-variants、button-group、button-group-variants、toggle、toggle-group、toggle-variants | separator |
| 响应式侧栏 | sidebar、sidebar-context | input、separator、sheet、skeleton、tooltip、`../../hooks/use-mobile.ts` |

这些不是自动注册的控件库，也没有通过新增测试引用伪装成产品正在使用。
保留它们是为了不丢失未提交改动；来源和依赖闭包见
`docs/architecture/wiki/unused-files.md` 与 `docs/architecture/unused-file-review.json`（均相对仓库根）。

新业务优先复用已有使用中的控件。确需接入未完成组件时，检查 Tailwind 兼容性、
无障碍行为和主题；完成后重跑体检。没有需求的通用控件不再预先整套生成。
