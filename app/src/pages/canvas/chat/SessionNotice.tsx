import type { SessionView } from '../../../../api/e/contracts';
import type { LiveStore } from '../live-store';
import { SessionControls } from '../SessionControls';
import { sessionNotices } from './presentation-state';
export function SessionNotice({view,store,nodeId,now,onDiagnostics}:{view?:SessionView;store:LiveStore;nodeId:string;now:number;onDiagnostics:()=>void}) {
 const notices=sessionNotices(view,store.connState==='online',store.readOnly,now).filter(notice=>notice.id!=='recovery'&&notice.id!=='stopped');
 if(!notices.length)return null;
 return <div className="chat-notices">{notices.map(notice=><section key={notice.id} className={`chat-session-notice tone-${notice.tone}${notice.id==='recovery'||notice.id==='stopped'?' is-recovery':''}`} data-notice={notice.id} role={notice.tone==='danger'?'alert':'status'}>
  <div className="chat-notice-content"><strong>{notice.title}</strong><p>{notice.description}</p></div><div className="chat-notice-actions">
   {notice.recover&&<SessionControls store={store} nodeId={nodeId}/>}
   {notice.approval?<button type="button" onClick={e=>{const target=e.currentTarget.closest('.live-chat')?.querySelector<HTMLElement>('[data-approval-id]');target?.scrollIntoView({block:'nearest'});target?.focus();}}>查看请求</button>:notice.id!=='starting'&&notice.id!=='archive'&&notice.id!=='recovery'&&notice.id!=='stopped'&&<button type="button" onClick={onDiagnostics}>查看诊断</button>}
  </div>
 </section>)}</div>;
}
