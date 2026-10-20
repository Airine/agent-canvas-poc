import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SessionView } from '../../../api/e/contracts';
import type { LiveStore } from './live-store';
import { ChatConfirm, ChatPopover } from './chat/ChatPopover';
import { redact } from './chat/error-presentation';

/** Archived sessions are recoverable records, not active canvas cards. */
export function ArchivedSessionsControl({store}:{store:LiveStore}) {
 const [supported,setSupported]=useState(false),[items,setItems]=useState<SessionView[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[remove,setRemove]=useState<SessionView|null>(null);
 const workspaceId=store.workspaceId;
 useEffect(()=>{let active=true;fetch('/api/runtime/status').then(async response=>{const data=await response.json();if(active)setSupported(response.ok&&data.sessionLifecycleVersion===2);}).catch(()=>{if(active)setSupported(false);});return()=>{active=false};},[store.workspaceId]);
 async function load(){
  if(!workspaceId)return;setBusy(true);setError('');
  try{
   const response=await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions?view=archived`,{headers:{Accept:'application/json'}});
   const data=await response.json() as {sessions?:SessionView[];error?:string};
   if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
   setItems(data.sessions??[]);
  }catch(e){setError(redact(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}
 }
 async function restore(view:SessionView){
  if(!workspaceId)return;setBusy(true);setError('');
  try{
   const response=await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/nodes/${encodeURIComponent(view.nodeId)}/resume`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   const data=await response.json() as {session?:SessionView;error?:string};
   if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
   if(data.session)store.applySessionView(data.session);
   await load();
  }catch(e){await load();setError(redact(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}
 }
 async function deleteArchived(view:SessionView){
  if(!workspaceId)return;setBusy(true);setError('');
  try{
   const response=await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/nodes/${encodeURIComponent(view.nodeId)}/session`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmDelete:true})});
   const data=await response.json().catch(()=>({})) as {error?:string};
   if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
   setRemove(null);await load();
  }catch(e){setError(redact(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}
 }
 if(!supported)return null;
 return <>
  <ChatPopover id="archived-sessions" label="已归档会话" title="已归档会话" side="bottom" align="end" className="chat-archived-trigger" onOpenChange={value=>{if(value)void load();}} trigger={<><Archive size={15}/><span>已归档</span></>}>
   <div className="chat-archived-list">
    {busy&&<p className="chat-muted">读取归档会话…</p>}
    {!busy&&!items.length&&!error&&<p className="chat-muted">没有已归档会话。</p>}
    {items.map(view=><article key={view.nodeId} className="chat-archived-item" data-archived-session={view.nodeId}>
     <div className="chat-archived-summary"><strong>{view.title}</strong><span>{view.lifecycle}{view.error?' · 有错误':''}</span></div>
     <p className="chat-muted">归档于 {view.archivedAt}{view.ref.model?` · ${[view.ref.provider,view.ref.model].filter(Boolean).join('/')}`:''}</p>
     {view.error&&<p className="chat-muted">原因：{redact(view.error)}</p>}
     <div className="chat-actions"><button type="button" disabled={busy||store.connState!=='online'||store.readOnly} onClick={()=>void restore(view)}><RotateCcw size={13}/>恢复</button><button type="button" disabled={busy||store.connState!=='online'||store.readOnly} onClick={()=>setRemove(view)}><Trash2 size={13}/>删除</button></div>
    </article>)}
    {error&&<p role="alert" className="chat-error">{error}</p>}
   </div>
  </ChatPopover>
  <ChatConfirm open={!!remove} danger busy={busy} title="删除已归档会话？" confirmLabel="确认删除" onCancel={()=>setRemove(null)} onConfirm={()=>{if(remove)void deleteArchived(remove);}} description={`将删除「${remove?.title??''}」的本地 Canvas 记录、队列和原生会话文件，且不可恢复。协作账本不会被用来重建会话。`}/>
 </>;
}
