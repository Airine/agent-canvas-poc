import { useContext, useState, type RefObject } from 'react';
import { Activity, Archive, MoreHorizontal } from 'lucide-react';
import type { ViewModeManager } from '../../shared/ViewModeManager';
import type { CanvasNode, LiveStore } from './live-store';
import { useLiveStore } from './live-store';
import { useSession } from './session-store';
import { CardViewControl } from './CardViewControl';
import { SessionControls } from './SessionControls';
import { ChatConfirm, ChatOverlayScope, ChatPopover } from './chat/ChatPopover';
import { ChatOverlayContext } from './chat/chat-overlay-context';
import { needsSessionRecovery,sessionModelPresentation } from './chat/presentation-state';
import { redact } from './chat/error-presentation';
import './chat/chat.css';

function HeaderActions({store,node,manager,onDiagnostics,actionsRef}:{store:LiveStore;node:CanvasNode;manager:ViewModeManager;onDiagnostics:()=>void;actionsRef:RefObject<HTMLDivElement|null>}) {
 useLiveStore(store);const view=useSession(store.sessions,node.id),overlay=useContext(ChatOverlayContext);
 const recover=(needsSessionRecovery(view)||view?.lifecycle==='stopped')&&store.connState==='online'&&!store.readOnly;
 const [archiveConfirm,setArchiveConfirm]=useState(false),[archiveBusy,setArchiveBusy]=useState(false),[archiveError,setArchiveError]=useState('');
 async function archiveSession(){
  if(!store.workspaceId||!view)return;setArchiveBusy(true);setArchiveError('');
  try{
   const response=await fetch(`/api/workspaces/${encodeURIComponent(store.workspaceId)}/nodes/${encodeURIComponent(node.id)}/archive`,{method:'POST'});
   const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
   if(data.session)store.applySessionView(data.session);overlay?.setOpen('');
  }catch(e){setArchiveError(redact(e instanceof Error?e.message:String(e)));}finally{setArchiveBusy(false);setArchiveConfirm(false);}
 }
 return <div ref={actionsRef} className="session-header-actions chat-session-header nodrag nowheel" onDoubleClick={e=>e.stopPropagation()}>
  {recover&&<SessionControls store={store} nodeId={node.id}/>}
  <ChatPopover id="session" label="会话操作" title="会话操作与卡片视图" side="bottom" align="end" trigger={<MoreHorizontal size={18}/>}>
   <div className="chat-session-menu">
    <CardViewControl manager={manager} nodeId={node.id} showLabel/>
    <button type="button" onClick={()=>{overlay?.setOpen('');onDiagnostics();}}><Activity size={16}/>会话诊断</button>
    {(view?.lifecycle==='ready'||view?.lifecycle==='starting')&&<SessionControls store={store} nodeId={node.id}/>}
    {view?.sessionLifecycleVersion===2&&!view.archivedAt&&<button type="button" disabled={archiveBusy||store.connState!=='online'||store.readOnly} onClick={()=>setArchiveConfirm(true)}><Archive size={16}/>归档会话</button>}
    {archiveError&&<p role="alert" className="chat-error">{archiveError}</p>}
    {recover&&<p className="chat-muted">恢复保留历史，不会自动发送草稿；待发须单独恢复。</p>}
    <p className="chat-muted">{node.harness} · {sessionModelPresentation(view,store.connState==='online',node.sessionRef).label}</p>
    {(view?.lifecycle==='ready'||view?.lifecycle==='starting')&&<p className="chat-muted">停止会话会关闭受管进程；中断当前轮仅取消这一次运行。</p>}
   </div>
  </ChatPopover>
  <ChatConfirm open={archiveConfirm} busy={archiveBusy} title="归档会话？" confirmLabel="确认归档" onCancel={()=>setArchiveConfirm(false)} onConfirm={()=>void archiveSession()} description="停止当前运行器并从画布隐藏；消息历史、队列和本地记录保留，可从顶部“已归档”恢复。归档不会删除内容。"/>
 </div>;
}
export function SessionHeaderActions(props:Parameters<typeof HeaderActions>[0]) {
 return <ChatOverlayScope surface={props.node.id}><HeaderActions {...props}/></ChatOverlayScope>;
}
