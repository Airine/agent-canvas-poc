import { Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LiveStore } from './live-store';
import { useLiveStore } from './live-store';
import { capabilityAvailable, useSession } from './session-store';
import { redact } from './chat/error-presentation';
export function SessionControls({store,nodeId,placement='header'}:{store:LiveStore;nodeId:string;placement?:'header'|'dock'}) {
 useLiveStore(store);const view=useSession(store.sessions,nodeId);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [now,setNow]=useState(Date.now);useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const online=store.connState==='online';
 const intents=useRef(new Map<string,string>());
 async function act(op:'abort'|'stop'|'resume') {setBusy(true);setError('');try{await store.sessionAction(nodeId,op,op==='abort'?{intentId:(()=>{const key=view?.snapshot?.runs.find(r=>r.state==='running')?.id??'no-run';if(!intents.current.has(key))intents.current.set(key,crypto.randomUUID());return intents.current.get(key)!;})(),targetRunId:view?.snapshot?.runs.find(r=>r.state==='running')?.id}:undefined);}catch(e){setError(redact(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}}
 return <div className="chat-session-controls">
  {placement==='dock'&&view?.lifecycle==='ready'&&view.snapshot?.runs.some(r=>r.state==='running')&&<button className="chat-control chat-abort" aria-label="中断当前轮" title="中断当前轮，保留会话" type="button" disabled={!online||busy||store.readOnly||!capabilityAvailable(view,'abort',now)} onClick={()=>void act('abort')}><Square size={13} fill="currentColor"/><span>中断</span></button>}
  {placement==='header'&&(view?.lifecycle==='ready'||view?.lifecycle==='starting'?<button disabled={!online||busy} onClick={()=>void act('stop')}>停止会话</button>:<button disabled={!online||busy||!view||store.readOnly} onClick={()=>void act('resume')}>恢复会话</button>)}
  {error&&<span role="alert" className="text-red-400">{error}</span>}
 </div>;
}
