import { useContext, useId, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, ArrowLeft, Check, ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import type { ConfigurationChange,RuntimeModel,SessionView } from '../../../../api/e/contracts';
import type { LiveStore } from '../live-store';
import { sessionModelPresentation } from './presentation-state';
import { thinkingName,thinkingLevels,modelName,modelGroups,configurationBasis,configurationBlockReason } from './runtime-config-presentation';
import { redact } from './error-presentation';
import { ChatPopover, ChatConfirm } from './ChatPopover';
import { ChatOverlayContext } from './chat-overlay-context';

type Selection={change:Partial<ConfigurationChange>;basis:string};
export function RuntimeConfigControl({view,store,nodeId}:{view?:SessionView;store:LiveStore;nodeId:string}) {
 const [page,setPage]=useState<'reasoning'|'models'>('reasoning'),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [confirm,setConfirm]=useState<Selection|null>(null),[preview,setPreview]=useState<{basis:string;level:string}|null>(null);
 const inFlight=useRef(false),previewRef=useRef<typeof preview>(null),pointer=useRef(false),gestureBasis=useRef<string|null>(null),modelButton=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),tooltipId=useId(),helpId=useId();
 const overlay=useContext(ChatOverlayContext),config=view?.configuration,basis=configurationBasis(config),levels=thinkingLevels(config);
 const online=store.connState==='online',ready=view?.lifecycle==='ready',modelView=sessionModelPresentation(view,online);
 const reason=configurationBlockReason(view,online,store.readOnly),locked=busy||!!reason||!!error;
 const readUnavailable=busy||!!view?.configurationPending||!online||!ready||store.readOnly;
 const effectivePreview=preview?.basis===basis&&!locked?preview:null;
 const chosen=effectivePreview?.level??config?.thinkingLevel,index=levels.indexOf(chosen??''),dirty=!!effectivePreview&&chosen!==config?.thinkingLevel;
 const pending=busy||!!view?.configurationPending,stale=(modelView.historical||!!error)&&!pending;
 const groups=modelGroups(config?.models??[],query),displayModel=config?.model?modelName(config.model):modelView.summary;
 function resetPreview(){previewRef.current=null;setPreview(null);pointer.current=false;gestureBasis.current=null;}
 function back(){setPage('reasoning');setQuery('');resetPreview();requestAnimationFrame(()=>modelButton.current?.focus());}
 function openModels(){resetPreview();setPage('models');setQuery('');requestAnimationFrame(()=>search.current?.focus());}
 async function act(selection?:Selection){
  if(inFlight.current)return;
  const current=store.sessions.get(nodeId)??view;
  const blocked=selection?configurationBlockReason(current,store.connState==='online',store.readOnly):!current||current.lifecycle!=='ready'||store.connState!=='online'||store.readOnly||current.configurationPending?'当前不能读取配置':undefined;
  if(blocked){setError(blocked);setConfirm(null);resetPreview();return;}
  if(selection&&selection.basis!==configurationBasis(current?.configuration)){setError('配置已变化，请重新选择；未提交旧预览。');setConfirm(null);resetPreview();return;}
  const before=current?.configuration;
  inFlight.current=true;setBusy(true);setError('');setNotice('');
  try{
   const result=await store.sessionAction(nodeId,'configuration',selection?{intentId:crypto.randomUUID(),expectedRevision:before!.revision,...selection.change}:undefined) as {session?:SessionView};
   const after=result.session?.configuration;
   if(!after||after.nativeSessionId!==current?.ref.nativeSessionId||selection?.change.model&&(after.model?.id!==selection.change.model||after.model?.provider!==selection.change.provider)||selection?.change.thinkingLevel!==undefined&&after.thinkingLevel!==selection.change.thinkingLevel)throw Error('未取得一致的运行器回读，请重新读取配置核实');
   if(selection?.change.model){setNotice(before?.thinkingLevel!==after.thinkingLevel?`模型已切换；运行器将推理强度调整为 ${thinkingName(after.thinkingLevel)}（${after.thinkingLevel}）。`:'模型已切换，档位已重新回读。');back();}
   else if(selection)setNotice('推理强度已由运行器确认。');
   else setNotice('已读取当前运行器配置。');
   resetPreview();
  }catch(e){setError(redact(e instanceof Error?e.message:String(e)));resetPreview();}
  finally{inFlight.current=false;setBusy(false);setConfirm(null);}
 }
 function pickModel(model:RuntimeModel){
  if(locked||!config)return;
  if(model.provider===config.model?.provider&&model.id===config.model.id){back();return;}
  const selection={change:{provider:model.provider,model:model.id},basis};
  if(model.provider!==config.model?.provider)setConfirm(selection);else void act(selection);
 }
 function previewIndex(value:string){const level=levels[Number(value)];if(locked||level===undefined)return;const valueNext={basis:gestureBasis.current??basis,level};previewRef.current=valueNext;setPreview(valueNext);}
 function commitPreview(){const value=previewRef.current;if(!value||locked||value.level===config?.thinkingLevel)return;void act({basis:value.basis,change:{thinkingLevel:value.level}});}
 function escape(e:KeyboardEvent){const details=e.target instanceof Element?e.target.closest<HTMLDetailsElement>('details[open]'):null;if(details){e.preventDefault();details.open=false;details.querySelector('summary')?.focus();return;}if(page==='models'){e.preventDefault();back();}else if(dirty){e.preventDefault();resetPreview();}}
 const summaryLevel=config?.thinkingLevel?thinkingName(config.thinkingLevel):undefined;
 return <><span className="chat-config-entry"><ChatPopover id="runtime" label="执行配置" heading={page==='models'?'选择模型':'推理强度'} leading={page==='models'?<button type="button" className="chat-icon-button" aria-label="返回推理设置" onClick={back}><ArrowLeft size={16}/></button>:undefined}
  title={null} align="end" className={`chat-model-trigger chat-reasoning-trigger${error||view?.configurationError?' has-error':''}`} contentClassName="chat-reasoning-popover"
  onOpenChange={open=>{resetPreview();if(open){setPage('reasoning');setQuery('');}}} onEscapeKeyDown={escape}
  triggerProps={{'aria-describedby':tooltipId,'aria-busy':pending}} trigger={<>{stale&&<span className="chat-history-prefix">上次</span>}<span className="chat-model-name">{displayModel}</span>{summaryLevel&&<span className={`chat-reasoning-summary${stale?' is-stale':''}`}>{summaryLevel}</span>}{pending?<RefreshCw className="chat-config-pending" size={13}/>:error||view?.configurationError?<AlertCircle size={14}/>:<ChevronDown size={12}/>}</>}>
  {reason&&<p className="chat-menu-notice">{reason}</p>}
  {page==='reasoning'?<div className="chat-reasoning-main">
   <div className="chat-reasoning-level" data-preview={dirty} aria-live="polite">{thinkingName(chosen)}<span>{dirty?'预览 · 未应用':pending?'等待确认':stale?'最后确认':config?'已确认':'等待回读'}</span></div>
   <button ref={modelButton} type="button" className="chat-reasoning-model" aria-label="选择执行模型" disabled={!config?.models.length} onClick={openModels}><span>{displayModel}</span><ChevronRight size={16}/></button>
   {config&&levels.length>1&&index>=0?<>
    <div className="chat-reasoning-track" style={{'--reasoning-position':`${index/(levels.length-1)*100}%`} as CSSProperties}>
     <input type="range" aria-label="推理强度" aria-valuetext={`${thinkingName(chosen)} (${chosen})${dirty?' · 未应用':''}`} aria-describedby={helpId} min={0} max={levels.length-1} step={1} value={index} disabled={locked}
      onChange={e=>previewIndex(e.target.value)} onPointerDown={e=>{if(!locked){pointer.current=true;gestureBasis.current=basis;e.currentTarget.setPointerCapture(e.pointerId);}}}
      onPointerUp={()=>{if(pointer.current){pointer.current=false;commitPreview();gestureBasis.current=null;}}} onPointerCancel={resetPreview}
      onKeyDown={e=>{if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||overlay?.composing.current)return;if(e.key==='Enter'){e.preventDefault();commitPreview();}else if(e.key==='Escape'&&dirty){e.preventDefault();e.stopPropagation();resetPreview();}}}/>
    </div><div className="chat-reasoning-ticks" aria-hidden="true">{levels.map(level=><span key={level} className={level===chosen?'is-selected':''}>{thinkingName(level)}</span>)}</div>
    <div id={helpId} className="chat-reasoning-preview">{dirty?<><span>将设为 {thinkingName(chosen)}</span><button type="button" onClick={commitPreview} disabled={locked}>应用</button><button type="button" onClick={resetPreview}>取消</button></>:<span className="chat-reasoning-help">拖动后松开应用 · 方向键预选，Enter 确认</span>}</div>
   </>:<p className="chat-reasoning-fixed">{!config?'会话就绪后读取可用档位。':levels.length===1&&levels[0]===config.thinkingLevel?'当前模型只有一个可用档位，无需调整。':levels.length===0?'运行器未提供可调推理档位。':'当前级别与可用档位未对应，请重新读取。'}</p>}
   {stale&&<p className="chat-reasoning-raw">{modelView.label}</p>}
  </div>:<div className="chat-model-catalog">
   <label className="chat-model-search"><Search size={15}/><input ref={search} aria-label="搜索模型" value={query} placeholder="搜索模型或提供方" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();e.currentTarget.closest('.chat-model-catalog')?.querySelector<HTMLButtonElement>('[data-chat-option]:not(:disabled)')?.focus();}}}/></label>
   <div className="chat-model-groups">{groups.length?groups.map(group=><section key={group.provider} aria-label={group.provider}><h4>{group.provider}</h4>{group.models.map(model=>{const selected=config?.model?.provider===model.provider&&config.model.id===model.id;return <button type="button" data-chat-option data-model-provider={model.provider} data-model-id={model.id} className="chat-model-choice" key={`${model.provider}/${model.id}`} aria-label={`${modelName(model)} · ${model.provider}/${model.id}`} aria-pressed={selected} disabled={locked} onClick={()=>pickModel(model)}><span><strong>{modelName(model)}</strong>{model.name&&model.name!==model.id&&<small>{model.id}</small>}</span>{selected&&<Check size={17}/>}</button>;})}</section>):<p className="chat-muted">没有匹配的可用模型。</p>}</div>
  </div>}
  {(error||view?.configurationError)&&<p role="alert" className="chat-error">{error||redact(view?.configurationError)} · 未确认成功。</p>}{notice&&<p role="status" className="chat-config-notice">{notice}</p>}
  <footer className="chat-reasoning-footer">{config?<details className="chat-config-details" onKeyDown={e=>{if(e.key==='Escape'&&e.currentTarget.open&&!e.nativeEvent.isComposing&&!overlay?.composing.current){e.preventDefault();e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary>配置详情</summary><p>仅当前会话 · 最近确认</p><p>{config.model?.provider}/{config.model?.id}</p><p>原生推理档位：{config.thinkingLevel}</p><p>回读于 {config.confirmedAt}</p></details>:<span>仅当前会话</span>}<button type="button" disabled={readUnavailable} onClick={()=>void act()} aria-label="刷新配置"><RefreshCw size={14}/><span>{pending?'回读中':'重新读取'}</span></button></footer>
 </ChatPopover><span id={tooltipId} role="tooltip" className="chat-config-tooltip chat-control-tooltip">调整模型与推理强度</span></span>
 <ChatConfirm open={!!confirm} busy={busy} title="切换执行模型提供方？" confirmLabel="确认切换" onCancel={()=>setConfirm(null)} onConfirm={()=>{if(confirm)void act(confirm);}} description={`将执行模型切换到 ${confirm?.change.provider??''}/${confirm?.change.model??''}，可能使用该提供方已有额度。不会修改审批审查模型、认证或 Pi 全局默认。`}/></>;
}
