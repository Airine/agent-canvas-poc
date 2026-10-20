import { useMemo, useState, useSyncExternalStore } from 'react';
import type { SessionView } from '../../../../api/e/contracts';
import type { LiveStore } from '../live-store';
import { TranscriptProjector } from './project-transcript';
import type { ChatUIStore } from './chat-ui-store';
import { TurnView } from './TurnView';
import { ApprovalRequest } from './ApprovalRequest';
import { useConversationScroll } from './useConversationScroll';
export function ConversationView({view,store,nodeId,ui,focused}:{view?:SessionView;store:LiveStore;nodeId:string;ui:ChatUIStore;focused:boolean;now:number}) {
 const local=useSyncExternalStore(ui.subscribe,ui.getSnapshot);const [projector]=useState(()=>new TranscriptProjector());
 const turns=useMemo(()=>projector.project(view?.snapshot),[projector,view?.snapshot]);
 const {setScrollRef,setContentRef,capture,userScroll,stopScroll,isAtBottom,toLatest}=useConversationScroll(ui,focused,local.visible);const shown=turns.slice(-local.visible);
 const pending=view?.snapshot?.approvals?.filter(a=>a.state==='pending')??[];

 return <div className="chat-transcript-shell">
 <div ref={setScrollRef} onScroll={capture} onWheel={userScroll} onTouchStart={userScroll} onPointerDown={userScroll} onPointerUp={()=>{if(globalThis.getSelection()?.toString())stopScroll();}} className="chat-scroll" role="log" aria-label="对话记录" aria-live="off">
  <div ref={setContentRef} className="chat-transcript">
   {turns.length>local.visible&&<button className="chat-history" onClick={()=>{capture();ui.update({visible:local.visible+30});}}>加载更早记录（还有 {turns.length-local.visible} 条）</button>}
   {!turns.length&&<div className="chat-empty"><span className="chat-eyebrow">AGENT SESSION</span><h3>从一个任务开始</h3><p>对话、工具执行与审批会显示在这里。</p></div>}
   {shown.map(turn=><TurnView key={turn.id} turn={turn} ui={ui}/>)}
   {pending.map(approval=>{const tool=view?.snapshot?.tools.find(t=>t.id===approval.toolCallId);const block=view?.snapshot?.messages.flatMap(m=>m.blocks).find(b=>b.type==='tool-call'&&b.toolCallId===approval.toolCallId);return <ApprovalRequest key={approval.id} approval={approval} tool={tool??(block?{id:approval.toolCallId!,name:approval.toolName??'工具',state:'pending',arguments:block.arguments}:undefined)} store={store} nodeId={nodeId}/>;})}

  </div>
 </div>
 {!isAtBottom&&<button className="chat-latest" onClick={toLatest}>↓ 回到最新{pending.length?` · ${pending.length} 项待审批`:''}</button>}
 </div>;
}
