import { useEffect, useState } from 'react';
import type { LiveStore, CanvasNode } from './live-store';
import { useLiveStore } from './live-store';
import { useSession } from './session-store';
import { getChatUI } from './chat/chat-ui-store';
import { ConversationView } from './chat/ConversationView';
import { Composer } from './chat/Composer';
import { Diagnostics } from './chat/Diagnostics';
import { ChatOverlayScope } from './chat/ChatPopover';
import { SessionNotice } from './chat/SessionNotice';
import './chat/chat.css';
export function LiveChat({store,node,focused=false,diagnosticOpen,onDiagnosticChange,onReturnFocus}:{store:LiveStore;node:CanvasNode;focused?:boolean;diagnosticOpen:boolean;onDiagnosticChange:(open:boolean)=>void;onReturnFocus:()=>void}) {
 useLiveStore(store);const view=useSession(store.sessions,node.id);const [now,setNow]=useState(Date.now);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const ui=getChatUI(store.workspaceId??'',node.id,view?.ref.nativeSessionId??node.sessionRef?.nativeSessionId??'');
 return <ChatOverlayScope surface={`${node.id}:${focused}`}><section className={`live-chat nodrag nowheel ${focused?'live-chat-focus':'live-chat-inline'}`} data-testid={`chat-${node.id}`}>
  <SessionNotice view={view} store={store} nodeId={node.id} now={now} onDiagnostics={()=>onDiagnosticChange(true)}/>
  <ConversationView view={view} store={store} nodeId={node.id} ui={ui} focused={focused} now={now}/>
  <Composer ui={ui} view={view} store={store} nodeId={node.id} now={now}/>
  <Diagnostics view={view} open={diagnosticOpen} onOpenChange={onDiagnosticChange} onReturnFocus={onReturnFocus}/>
 </section></ChatOverlayScope>;
}
