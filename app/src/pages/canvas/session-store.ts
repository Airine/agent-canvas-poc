import { useCallback, useSyncExternalStore } from 'react';
import type { SessionView } from '../../../api/e/contracts';
export class SessionStore {
 readonly views=new Map<string,SessionView>();
 private listeners=new Map<string,Set<()=>void>>();
 apply(view:SessionView):boolean {
  const prior=this.views.get(view.nodeId);
  if(prior&&prior.workspaceId===view.workspaceId&&prior.version>=view.version)return false;
  this.views.set(view.nodeId,view);for(const fn of this.listeners.get(view.nodeId)??[])fn();return true;
 }
 get(nodeId:string){return this.views.get(nodeId);}
 subscribe(nodeId:string,fn:()=>void){const list=this.listeners.get(nodeId)??new Set();list.add(fn);this.listeners.set(nodeId,list);return()=>{list.delete(fn);if(!list.size)this.listeners.delete(nodeId);};}
}
export function useSession(store:SessionStore,nodeId:string){return useSyncExternalStore(useCallback(fn=>store.subscribe(nodeId,fn),[store,nodeId]),()=>store.get(nodeId));}
export function capabilityAvailable(view:SessionView|undefined,name:string,now=Date.now()):boolean {
 return view?.lifecycle==='ready'&&!!view.snapshot?.capabilities.some(c=>c.name===name&&c.available&&c.authority==='authoritative'&&(c.expiresAt===undefined||Date.parse(c.expiresAt)>now));
}
