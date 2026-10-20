import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useAgentMentions } from './use-agent-mentions';
import { ArrowUp, Plus, Send } from 'lucide-react';
import type { Attachment, SessionView } from '../../../../api/e/contracts';
import { validateMessage } from '../../../../shared/message-content.mjs';
import type { LiveStore } from '../live-store';
import type { ChatUIStore } from './chat-ui-store';
import { automaticDelivery } from './presentation-state';
import { redact } from './error-presentation';
import { AttachmentTray } from './AttachmentTray';
import { clipboardImages,pastedAttachment,readAttachment } from './attachments';
import { RuntimeConfigControl } from './RuntimeConfigControl';
import { QueuePanel } from './QueuePanel';
import { ApprovalModeControl } from '../ApprovalModeControl';
import { SessionControls } from '../SessionControls';
export function Composer({ui,view,store,nodeId,now}:{ui:ChatUIStore;view?:SessionView;store:LiveStore;nodeId:string;now:number}) {
 const s=useSyncExternalStore(ui.subscribe,ui.getSnapshot);const composing=useRef(false),fileInput=useRef<HTMLInputElement>(null),textarea=useRef<HTMLTextAreaElement>(null);const delivery=automaticDelivery(view,store.connState==='online',now,store.readOnly);
 const {state,enqueue,pausedEnqueue,canSubmit}=delivery;
 const queueLabel=pausedEnqueue?'存入待发':'加入待发';
 const pausedHint='仅保存到暂停队列；恢复会话并明确恢复待发后才会执行。';

 const mentions=useAgentMentions({store,nodeId,textarea,draft:s.draft,setDraft:value=>ui.draft(value),disabled:!state.canEdit});
 const hasContent=!!s.draft.trim()||s.attachments.length>0;
 useLayoutEffect(()=>{const el=textarea.current;if(!el)return;const grow=()=>{el.style.height='auto';const style=getComputedStyle(el);el.style.height=`${Math.min(parseFloat(style.maxHeight)||200,Math.max(parseFloat(style.minHeight)||64,el.scrollHeight))}px`;};grow();let width=el.clientWidth;const observer=new ResizeObserver(()=>{if(el.clientWidth!==width){width=el.clientWidth;grow();}});observer.observe(el);return()=>observer.disconnect();},[s.draft]);
 function updateAttachments(items:Attachment[]){try{if(items.length)validateMessage(s.draft,items,view?.configuration?.model?.input.includes('image')??false);ui.attachments(items);}catch(e){ui.update({error:redact(String(e))});}}
 async function files(files:FileList|null){if(!files)return;try{await addFiles([...files]);}finally{if(fileInput.current)fileInput.current.value='';}}
 async function addFiles(list:File[]){if(!list.length)return;try{const added=await Promise.all(list.map(readAttachment));const current=ui.getSnapshot();const items=[...current.attachments,...added];validateMessage(current.draft,items,view?.configuration?.model?.input.includes('image')??false);ui.attachments(items,added.map(a=>a.name));}catch(e){ui.update({error:redact(String(e))});}}
 async function submit(){
  if(ui.getSnapshot().sending||!canSubmit||!hasContent||composing.current||s.lostAttachments.length)return;
  try{validateMessage(s.draft,s.attachments,view?.configuration?.model?.input.includes('image')??false);}catch(e){ui.update({error:redact(String(e))});return;}
  const current=store.sessions.get(nodeId)??view;const latest=automaticDelivery(current,store.connState==='online',Date.now(),store.readOnly);
  if(!latest.canSubmit){ui.update({error:latest.state.reason||'会话状态已变化，草稿保留，请核对后再发送'});return;}
  let sent:ReturnType<ChatUIStore['beginAutomatic']>;
  try{sent=ui.beginAutomatic(latest.destination);}catch(e){ui.update({error:redact(String(e))});return;}
  try{
   if(sent.destination==='queue'){const q=current?.queue;const retainPause=q?.paused&&q.items.some(i=>i.state==='pending'||i.state==='unknown');await store.sessionAction(nodeId,'queue',{mutationId:sent.id,expectedRevision:q?.revision??0,operation:'add',itemId:sent.id,content:sent.text,attachments:sent.attachments,authorize:!retainPause&&current?.lifecycle==='ready'});}
   else await store.sessionAction(nodeId,'messages',{intentId:sent.id,content:sent.text,attachments:sent.attachments,deliverAs:'nextTurn'});
   ui.finish(sent);
  }catch(e){ui.finish(sent,redact(e instanceof Error?e.message:String(e)));}
 }

 const hint=pausedEnqueue&&hasContent?pausedHint:view?.configurationError?'配置尚未确认，请打开执行配置重新回读。':view?.configurationPending?'配置回读中，草稿会保留。':view?.lifecycle==='ready'&&store.connState==='online'&&!state.active&&!enqueue?state.reason:undefined;
 return <div className="chat-input-dock"><QueuePanel view={view} store={store} nodeId={nodeId}/><form className="chat-composer" onSubmit={e=>{e.preventDefault();void submit();}}>
  <AttachmentTray items={s.attachments} onChange={state.canEdit?updateAttachments:undefined}/>
  {s.lostAttachments.length>0&&<div className="chat-warning" role="alert">刷新后附件内容不可恢复：{s.lostAttachments.join('、')}。请重新选择，或明确移除后再发送。<button type="button" onClick={()=>ui.dismissLost()}>移除缺失附件标记</button></div>}
  {mentions.menu}<textarea ref={textarea} {...mentions.aria} aria-label="发送给真实 Agent 的消息" aria-describedby={`hint-${nodeId}`} placeholder={state.active?'继续写消息，空闲后按序发送…':'写下消息…'} value={s.draft} maxLength={100000} rows={1} disabled={!state.canEdit} onChange={e=>{ui.draft(e.target.value);mentions.changed(e.currentTarget);}} onSelect={e=>mentions.selection(e.currentTarget)} onFocus={e=>mentions.changed(e.currentTarget)} onBlur={()=>mentions.blur()} onCompositionStart={()=>{composing.current=true;mentions.composition(true);}} onCompositionEnd={e=>{composing.current=false;mentions.composition(false);mentions.changed(e.currentTarget);}} onPaste={e=>{const images=clipboardImages(e.clipboardData);if(images.length){e.preventDefault();if(!state.canEdit){ui.update({error:'当前会话不可编辑附件'});return;}void addFiles(images);return;}const text=e.clipboardData.getData('text/plain');if(text.length>2000){e.preventDefault();updateAttachments([...s.attachments,pastedAttachment(text,`粘贴内容 ${s.attachments.length+1}.txt`)]);}}} onKeyDown={e=>{if(mentions.keyDown(e))return;if(e.key==='Enter'&&!e.shiftKey&&!composing.current&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();void submit();}}}/>
  <div className="chat-composer-toolbar"><div className="chat-toolbar-start">
   <input ref={fileInput} type="file" className="sr-only" aria-label="选择附件文件" accept="text/plain,.txt,.md,.log,.csv,image/png,image/jpeg,image/webp" multiple disabled={!state.canEdit} onChange={e=>void files(e.target.files)}/><button type="button" className="chat-control chat-add-attachment" aria-label="添加附件" disabled={!state.canEdit||s.attachments.length>=4} onClick={()=>fileInput.current?.click()} title="添加附件 · 最多 4 个；单图 2 MiB，文本合计 100 KiB"><Plus size={19}/></button>
   <ApprovalModeControl store={store} nodeId={nodeId} view={view}/>

  </div><div className="chat-toolbar-end"><RuntimeConfigControl view={view} store={store} nodeId={nodeId}/><SessionControls store={store} nodeId={nodeId} placement="dock"/>
   <button className={`chat-send ${enqueue?'is-queue':''}${pausedEnqueue?' is-paused':''}`} type="submit" aria-label={s.sending?'提交中…':enqueue?queueLabel:'发送'} title={pausedEnqueue?pausedHint:enqueue?'加入 Canvas 待发，确认空闲后按序提交':'发送消息 · Enter'} disabled={!canSubmit||s.sending||!hasContent||s.lostAttachments.length>0}>{enqueue?<><Send size={15}/><span>{s.sending?'提交中…':queueLabel}</span></>:s.sending?<span>提交中…</span>:<ArrowUp size={19}/>}</button>
  </div></div>
  <p id={`hint-${nodeId}`} className={hint?`chat-composer-hint${pausedEnqueue?' is-paused-hint':''}`:'sr-only'}>{hint||(pausedEnqueue?pausedHint:'Enter 提交；Shift+Enter 换行。普通消息在执行中加入待发；不会自动重发。')}</p>
  {s.error&&<p role="alert" className="chat-error">{s.error} · 草稿已保留，不会自动重发。</p>}
 </form></div>;
}
