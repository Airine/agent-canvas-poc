import { useEffect, useRef, useState } from 'react';
import type { SessionView } from '../../../../api/e/contracts';
import { Output,CopyButton } from './primitives';
import { redact } from './error-presentation';
export function Diagnostics({view,open:controlled,onOpenChange,onReturnFocus}:{view?:SessionView;open?:boolean;onOpenChange?:(value:boolean)=>void;onReturnFocus?:()=>void}){
 const [local,setLocal]=useState(false);const open=controlled??local;const setOpen=onOpenChange??setLocal;const trigger=useRef<HTMLButtonElement>(null);const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(open)close.current?.focus();},[open]);
 const dismiss=()=>{setOpen(false);if(onReturnFocus)onReturnFocus();else trigger.current?.focus();};
 const data={ref:view?.ref,lifecycle:view?.lifecycle,error:view?.error,epoch:view?.snapshot?.epoch,revision:view?.snapshot?.revision,capabilities:view?.snapshot?.capabilities,actions:view?.snapshot?.pendingActions,system:view?.snapshot?.messages.filter(m=>m.role==='system')};
 return <>
  {controlled===undefined&&<button ref={trigger} type="button" className="chat-diagnostics-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={()=>open?dismiss():setOpen(true)}>会话诊断</button>}
  {open&&<aside className="chat-diagnostics-panel" data-chat-diagnostics role="dialog" aria-label="会话诊断" aria-modal="false" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();}}}>
   <header><strong>会话诊断</strong><button ref={close} type="button" aria-label="关闭会话诊断" onClick={dismiss}>关闭 ×</button></header>
   <p className="chat-muted">会话身份、连接能力和控制回执。输入已接收不等于任务成功；以下信息已脱敏。</p>
   <CopyButton text={redact(data)} label="复制诊断"/>
   <div className="chat-diagnostics-content"><Output text={redact(data)}/></div>
  </aside>}
 </>;
}
