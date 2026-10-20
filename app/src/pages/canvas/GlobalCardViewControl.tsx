import {useLayoutEffect,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {SlidersHorizontal} from 'lucide-react';
import type {ViewModeManager} from '../../shared/ViewModeManager';
import {CARD_VIEW_LABELS,type CardViewPreference} from '../../shared/card-view-preferences';
import {ChatPopover} from './chat/ChatPopover';
import './global-card-view.css';

export function GlobalCardViewControl({manager}:{manager:ViewModeManager}){
 useSyncExternalStore(manager.subscribe,manager.getVersion);
 const [carrier]=useState(()=>{const el=document.createElement('div');el.className='global-card-view-carrier';return el;});
 useLayoutEffect(()=>{document.querySelector('[data-global-card-view-slot]')?.appendChild(carrier);return()=>carrier.remove();},[carrier]);
 const value=manager.getGlobalCardView(),count=manager.getCardViewOverrideCount();
 if(!manager.supportsGlobalCardView)return null;
 return createPortal(<div className="global-card-view-control nodrag nowheel" onKeyDown={e=>{if(e.key!=='Escape')e.stopPropagation();}}>
  <label className="theme-switcher"><span>卡片</span><select aria-label="全局卡片视图" value={value} onChange={e=>manager.setGlobalCardView(e.target.value as CardViewPreference)}>{(['auto','compact','detail'] as const).map(mode=><option key={mode} value={mode}>{CARD_VIEW_LABELS[mode]}</option>)}</select></label>
  <ChatPopover id="global-card-view" label="卡片视图设置" title="管理全局默认与单卡覆盖" className="global-card-view-settings" contentClassName="global-card-view-popover" align="end" trigger={<><SlidersHorizontal size={15}/>{count>0&&<span className="global-card-view-count" aria-label={`${count} 项单卡设置`}>{count}</span>}</>}>
   <p className="chat-muted">全局默认：{CARD_VIEW_LABELS[value]}。作用于本浏览器同源的所有主画布；新卡片默认跟随。</p>
   <p className="chat-muted">单独设置的卡片保留自己的视图。单卡菜单中选择“跟随全局”即可恢复继承。</p>
   <p className="chat-muted">本画布已保存 {count} 项单卡设置。</p>
   <button type="button" className="chat-secondary" disabled={!count} onClick={()=>manager.followGlobalForAllCards()}>本画布全部跟随全局</button>
   <p className="chat-muted">只改变显示，不启停 Agent、不发送消息。专注窗口保持当前会话，返回画布后采用所选视图。</p>
  </ChatPopover>
 </div>,carrier);
}
