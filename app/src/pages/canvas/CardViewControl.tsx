import { useSyncExternalStore } from 'react';
import type { ViewModeManager, CardViewSetting } from '../../shared/ViewModeManager';
import {CARD_VIEW_LABELS} from '../../shared/card-view-preferences';
export function CardViewControl({manager,nodeId,showLabel=false}:{manager:ViewModeManager;nodeId:string;showLabel?:boolean}) {
 useSyncExternalStore(manager.subscribe,manager.getVersion);
 return <label className="nodrag nowheel inline-flex items-center gap-1 text-node-meta text-text-secondary" onDoubleClick={e=>e.stopPropagation()}>
 <span className={showLabel?undefined:"sr-only"}>卡片视图</span><select aria-label="卡片视图" value={manager.getCardView(nodeId)} onChange={e=>manager.setCardView(nodeId,e.target.value as CardViewSetting)} className="rounded-inner bg-surface-2 px-1.5 py-1 text-text-primary">
 {manager.supportsGlobalCardView&&<option value="inherit">跟随全局（{CARD_VIEW_LABELS[manager.getGlobalCardView()]}）</option>}
 <option value="auto">自动（随缩放）</option><option value="compact">缩略</option><option value="detail">详细</option></select></label>;
}
