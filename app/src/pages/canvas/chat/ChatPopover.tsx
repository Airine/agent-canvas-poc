import { useContext, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { X } from 'lucide-react';
import { ChatOverlayContext } from './chat-overlay-context';

export function ChatOverlayScope({surface,children}:{surface:string;children:ReactNode}) {
 const [state,setState]=useState({surface,open:''});const composing=useRef(false);
 useEffect(()=>{const start=()=>{composing.current=true;},end=()=>{composing.current=false;};window.addEventListener('compositionstart',start,true);window.addEventListener('compositionend',end,true);return()=>{window.removeEventListener('compositionstart',start,true);window.removeEventListener('compositionend',end,true);};},[]);
 return <ChatOverlayContext.Provider value={{open:state.surface===surface?state.open:'',setOpen:open=>setState({surface,open}),close:id=>setState(current=>current.surface===surface&&current.open===id?{surface,open:''}:current),composing}}>{children}</ChatOverlayContext.Provider>;
}
export function ChatPopover({id,label,title,trigger,children,className='',contentClassName='',align='start',side='top',triggerProps,heading,leading,onOpenChange,onEscapeKeyDown}:{id:string;label:string;title?:string|null;trigger:ReactNode;children:ReactNode;className?:string;contentClassName?:string;align?:'start'|'end'|'center';side?:'top'|'bottom';triggerProps?:Pick<ButtonHTMLAttributes<HTMLButtonElement>,'aria-label'|'aria-describedby'|'aria-busy'>&{'data-session-status'?:string;'data-approval-mode'?:string};heading?:string;leading?:ReactNode;onOpenChange?:(open:boolean)=>void;onEscapeKeyDown?:(event:KeyboardEvent)=>void}) {
 const scope=useContext(ChatOverlayContext);const [local,setLocal]=useState(false);const triggerRef=useRef<HTMLButtonElement>(null),restoreFocus=useRef(true);
 const open=scope?scope.open===id:local;
 const setOpen=(value:boolean)=>{if(value)restoreFocus.current=true;if(scope){if(value)scope.setOpen(id);else scope.close(id);}else setLocal(value);onOpenChange?.(value);};
 return <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
  <Popover.Trigger asChild><button ref={triggerRef} type="button" className={`chat-control ${className}`} aria-label={label} title={title===null?undefined:title??label} {...triggerProps}>{trigger}</button></Popover.Trigger>
  <Popover.Portal><Popover.Content className={`chat-floating ${contentClassName}`} aria-label={label} side={side} align={align} sideOffset={10} collisionPadding={12}
   onEscapeKeyDown={e=>{if(e.isComposing||e.keyCode===229||scope?.composing.current){e.preventDefault();return;}onEscapeKeyDown?.(e);}}
   onInteractOutside={e=>{if(document.querySelector('.chat-confirm'))e.preventDefault();else restoreFocus.current=false;}}
   onCloseAutoFocus={e=>{e.preventDefault();const active=document.activeElement instanceof HTMLElement?document.activeElement.closest('.chat-control'):null;const another=active&&active!==triggerRef.current;if(restoreFocus.current&&!another&&!document.querySelector('.chat-floating[data-state="open"],.chat-confirm'))triggerRef.current?.focus({preventScroll:true});}}
   onKeyDown={e=>{if(e.key==='Escape')return;const target=e.target as HTMLElement;if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||target.matches('input,textarea,select'))return;const options=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-chat-option]:not(:disabled)')];if(!options.length)return;const index=options.indexOf(target as HTMLButtonElement);e.preventDefault();options[e.key==='Home'?0:e.key==='End'?options.length-1:e.key==='ArrowDown'?(index+1)%options.length:(index-1+options.length)%options.length]?.focus();}}
   onWheel={e=>e.stopPropagation()}>
   <header className="chat-floating-header"><div className="chat-floating-heading">{leading}<strong>{heading??label}</strong></div><Popover.Close asChild><button className="chat-icon-button" type="button" aria-label={`关闭${label}`}><X size={16}/></button></Popover.Close></header>
   {children}
  </Popover.Content></Popover.Portal>
 </Popover.Root>;
}
export function ChatConfirm({open,title,description,confirmLabel='确认',danger=false,busy=false,onCancel,onConfirm}:{open:boolean;title:string;description:ReactNode;confirmLabel?:string;danger?:boolean;busy?:boolean;onCancel:()=>void;onConfirm:()=>void}) {
 const scope=useContext(ChatOverlayContext);const cancel=useRef<HTMLButtonElement>(null),previous=useRef<HTMLElement|null>(null);
 return <AlertDialog.Root open={open} onOpenChange={value=>{if(!value&&!busy)onCancel();}}><AlertDialog.Portal>
  <AlertDialog.Overlay className="chat-confirm-overlay"/>
  <AlertDialog.Content className="chat-confirm" onOpenAutoFocus={e=>{e.preventDefault();previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;cancel.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();if(previous.current?.isConnected)previous.current.focus({preventScroll:true});}} onEscapeKeyDown={e=>{if(busy||e.isComposing||e.keyCode===229||scope?.composing.current)e.preventDefault();}}>
   <AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description asChild><div className="chat-confirm-description">{description}</div></AlertDialog.Description>
   <div className="chat-confirm-actions"><AlertDialog.Cancel asChild><button ref={cancel} type="button" disabled={busy}>取消</button></AlertDialog.Cancel><button type="button" className={danger?'chat-danger-button':'chat-primary'} disabled={busy} onClick={onConfirm}>{busy?'提交中…':confirmLabel}</button></div>
  </AlertDialog.Content>
 </AlertDialog.Portal></AlertDialog.Root>;
}
