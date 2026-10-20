import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { RuntimeStatus } from '../../../api/e/contracts';
export function CreateSessionForm() {
 const navigate=useNavigate();const [failedWorkspace,setFailedWorkspace]=useState('');const [runtime,setRuntime]=useState<RuntimeStatus|null>(null),[title,setTitle]=useState('我的 e 画布'),[model,setModel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;fetch('/api/runtime/status').then(async r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(v=>{if(alive)setRuntime(v);}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[]);
 async function create(){setBusy(true);setError('');let wid='';try{
  const post=async(url:string,body:unknown)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error(value.error||`HTTP ${r.status}`);return value;};
  const w=await post('/api/workspaces',{backend:'e',title});wid=w.id;
  const selected=model?JSON.parse(model):{};
  await post(`/api/workspaces/${encodeURIComponent(wid)}/sessions`,{title:'Pi Agent',...selected});
  navigate(`/canvas/${wid}`);
 }catch(e){setFailedWorkspace(wid);setError(`${String(e)}${wid?` · 工作区已创建，可在首页打开 ${wid} 查看错误/重试。`:''}`);}finally{setBusy(false);}}
 return <section className="my-6 space-y-3 rounded border border-border-subtle bg-surface-1 p-5">
 <h2 className="text-focus-title">新建真实 e 会话</h2><p className="font-mono text-small">{runtime?.projectRoot??'探测本机运行环境…'}</p>
 <div className="flex flex-wrap gap-3"><input aria-label="画布名称" className="rounded bg-surface-2 p-2" value={title} onChange={e=>setTitle(e.target.value)} disabled={busy}/>
 <select aria-label="模型" className="max-w-md rounded bg-surface-2 p-2" value={model} onChange={e=>setModel(e.target.value)} disabled={busy}><option value="">Pi 当前默认模型</option>{runtime?.models.map(m=><option key={`${m.provider}/${m.id}`} value={JSON.stringify({provider:m.provider,model:m.id})}>{m.provider}/{m.id}</option>)}</select>
 <button className="rounded bg-accent-soft px-4 py-2 text-accent disabled:opacity-40" disabled={!runtime?.available||busy||!title.trim()} onClick={()=>void create()}>{busy?'正在启动真实 Pi…':'创建并打开画布'}</button></div>
 <p className="text-small text-text-tertiary">{runtime?.available?'环境可用；创建后需等待真实会话 ready，发送消息才调用模型。':runtime?.reason}</p>
 {error&&<p role="alert" className="text-red-400">{error}</p>}
 {failedWorkspace&&<button onClick={()=>navigate(`/canvas/${failedWorkspace}`)}>打开失败会话并重试</button>}
 </section>;
}
