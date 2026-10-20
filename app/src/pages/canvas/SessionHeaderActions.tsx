import { useContext, type RefObject } from 'react';
import { Activity, MoreHorizontal } from 'lucide-react';
import type { ViewModeManager } from '../../shared/ViewModeManager';
import type { CanvasNode, LiveStore } from './live-store';
import { useLiveStore } from './live-store';
import { useSession } from './session-store';
import { CardViewControl } from './CardViewControl';
import { SessionControls } from './SessionControls';
import { ChatOverlayScope, ChatPopover } from './chat/ChatPopover';
import { ChatOverlayContext } from './chat/chat-overlay-context';
import { needsSessionRecovery,sessionModelPresentation } from './chat/presentation-state';
import './chat/chat.css';

function HeaderActions({store,node,manager,onDiagnostics,actionsRef}:{store:LiveStore;node:CanvasNode;manager:ViewModeManager;onDiagnostics:()=>void;actionsRef:RefObject<HTMLDivElement|null>}) {
 useLiveStore(store);const view=useSession(store.sessions,node.id),overlay=useContext(ChatOverlayContext);
 const recover=(needsSessionRecovery(view)||view?.lifecycle==='stopped')&&store.connState==='online'&&!store.readOnly;
 return <div ref={actionsRef} className="session-header-actions chat-session-header nodrag nowheel" onDoubleClick={e=>e.stopPropagation()}>
  {recover&&<SessionControls store={store} nodeId={node.id}/>}
  <ChatPopover id="session" label="会话操作" title="会话操作与卡片视图" side="bottom" align="end" trigger={<MoreHorizontal size={18}/>}>
   <div className="chat-session-menu">
    <CardViewControl manager={manager} nodeId={node.id} showLabel/>
    <button type="button" onClick={()=>{overlay?.setOpen('');onDiagnostics();}}><Activity size={16}/>会话诊断</button>
    {(view?.lifecycle==='ready'||view?.lifecycle==='starting')&&<SessionControls store={store} nodeId={node.id}/>}
    {recover&&<p className="chat-muted">恢复保留历史，不会自动发送草稿；待发须单独恢复。</p>}
    <p className="chat-muted">{node.harness} · {sessionModelPresentation(view,store.connState==='online',node.sessionRef).label}</p>
    {(view?.lifecycle==='ready'||view?.lifecycle==='starting')&&<p className="chat-muted">停止会话会关闭受管进程；中断当前轮仅取消这一次运行。</p>}
   </div>
  </ChatPopover>
 </div>;
}
export function SessionHeaderActions(props:Parameters<typeof HeaderActions>[0]) {
 return <ChatOverlayScope surface={props.node.id}><HeaderActions {...props}/></ChatOverlayScope>;
}
