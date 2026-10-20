import { useCallback, useLayoutEffect, useRef } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';
import type { ChatUIStore } from './chat-ui-store';
export function useConversationScroll(ui:ChatUIStore,focused:boolean,windowSize:number){
 const restoring=useRef(false);
 const cancelRestore=useRef<()=>void>(()=>{});
 const sticky=useStickToBottom({initial:false,resize:'instant'});
 const {scrollRef,contentRef,scrollToBottom,stopScroll}=sticky;
 const capture=useCallback(()=>{
  const el=scrollRef.current;if(restoring.current||!el||!el.clientHeight)return;
  const rect=el.getBoundingClientRect(),scale=rect.height/el.clientHeight||1;
  const entry=Array.from(el.querySelectorAll<HTMLElement>('[data-entry-id]')).find(x=>x.getBoundingClientRect().bottom>rect.top);
  ui.read({id:entry?.dataset.entryId,offset:entry?(entry.getBoundingClientRect().top-rect.top)/scale:0,top:el.scrollTop,bottom:el.scrollHeight-el.clientHeight-el.scrollTop<20});
 },[scrollRef,ui]);
 const restore=useCallback(()=>{
  const el=scrollRef.current;if(!el||!el.clientHeight)return;const saved=ui.getSnapshot().reading;
  if(saved.bottom){void scrollToBottom({animation:'instant'});return;}
  stopScroll();const entry=Array.from(el.querySelectorAll<HTMLElement>('[data-entry-id]')).find(x=>x.dataset.entryId===saved.id);
  if(entry){const rect=el.getBoundingClientRect(),scale=rect.height/el.clientHeight||1;el.scrollTop+=(entry.getBoundingClientRect().top-rect.top)/scale-saved.offset;}else el.scrollTop=saved.top;
 },[scrollRef,scrollToBottom,stopScroll,ui]);
 useLayoutEffect(()=>{
  const el=scrollRef.current;if(!el)return;
  let frame=0, timer:ReturnType<typeof setTimeout>;
  const reconcile=()=>{
   restoring.current=true;cancelAnimationFrame(frame);clearTimeout(timer);
   frame=requestAnimationFrame(()=>{restore();timer=setTimeout(()=>{restore();restoring.current=false;},320);});
  };
  cancelRestore.current=()=>{cancelAnimationFrame(frame);clearTimeout(timer);restoring.current=false;};
  reconcile();const observer=new ResizeObserver(reconcile);observer.observe(el);if(contentRef.current)observer.observe(contentRef.current);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);clearTimeout(timer);restoring.current=false;};
 },[restore,scrollRef,contentRef,focused,windowSize]);
 const setScrollRef=useCallback((el:HTMLDivElement|null)=>{scrollRef(el);},[scrollRef]);
 const setContentRef=useCallback((el:HTMLDivElement|null)=>{contentRef(el);},[contentRef]);
 const userScroll=()=>{cancelRestore.current();stopScroll();capture();};
 return {setContentRef,setScrollRef,capture,userScroll,isAtBottom:sticky.isAtBottom,stopScroll,toLatest:()=>{ui.read({top:0,offset:0,bottom:true});void scrollToBottom({animation:'instant'});}};
}
