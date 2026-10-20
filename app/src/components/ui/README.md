# 在用的 UI 基础组件

- `button.tsx` / `button-variants.ts`：主页、原型入口、聊天与旧版审批按钮。
- `switch.tsx`：共享连线图例的切换控件。
- `sonner.tsx`：产品画布和两套原型的通知容器。

未接入的通用组件和仅供它们使用的依赖已在用户授权后移除；此前未提交内容先保存在提交 `a1858ae`，不靠测试 import 或扫描豁免伪装在用。逐项证据见仓库根 `docs/architecture/unused-file-review.json`。

新需求按实际用途添加组件，检查主题、无障碍与消费入口；不要预先整套生成控件。
