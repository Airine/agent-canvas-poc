import { Check, Copy } from 'lucide-react';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ChatUIStore } from './chat-ui-store';
export function CopyButton({text,label='复制',iconOnly=false}:{text:string;label?:string;iconOnly?:boolean}) {
 const [status,setStatus]=useState('');return <button type="button" className={`chat-quiet ${iconOnly?'chat-copy-icon':''}`} aria-label={label} title={status||label} onClick={()=>{void navigator.clipboard.writeText(text).then(()=>setStatus('已复制'),()=>setStatus('复制失败'));}}>{iconOnly?<>{status==='已复制'?<Check size={15}/>:<Copy size={15}/>}<span className="sr-only" role="status">{status}</span></>:status||label}</button>;
}
export function Disclosure({ui,id,label,children,defaultOpen=false,onToggle}:{ui:ChatUIStore;id:string;label:ReactNode;children:ReactNode;defaultOpen?:boolean;onToggle?:(open:boolean)=>void}) {
 const state=useSyncExternalStore(ui.subscribe,ui.getSnapshot);const open=state.expanded[id]??defaultOpen;
 return <div className="chat-disclosure"><button type="button" className="chat-disclosure-trigger" aria-expanded={open} onClick={()=>{onToggle?.(!open);ui.toggle(id,!open);}}><span aria-hidden>{open?'⌄':'›'}</span>{label}</button>{open&&<div className="chat-disclosure-body">{children}</div>}</div>;
}
export function Output({text}:{text:string}) {const [limit,setLimit]=useState(4000);return <><pre className="chat-output">{text.slice(0,limit)}</pre>{text.length>limit&&<button type="button" className="chat-quiet" onClick={()=>setLimit(n=>n+8000)}>展开更多（剩余 {text.length-limit} 字符）</button>}</>;}
