import { exactOperationKey } from './approval-binding.js';
import type { MessageOrigin, SessionMessage, SessionView } from './contracts.js';
export interface OriginBinding { origin: MessageOrigin; observedMessageId: string; sourceEventIds: string[] }
export function orderedMessages(messages: readonly SessionMessage[]) {
  return [...messages].sort((a,b) => (Date.parse(a.createdAt ?? '') || 0) - (Date.parse(b.createdAt ?? '') || 0) || a.order - b.order || a.id.localeCompare(b.id));
}
/** Restored e message IDs differ. Bind only a previously observed exact tuple, never parse identity from prose. */
export function associateMessageOrigins(view: SessionView, observed: Record<string,MessageOrigin>, intents: Record<string,MessageOrigin>, bindings: Record<string,OriginBinding>) {
  const snapshot=view.snapshot;if(!snapshot || snapshot.nativeSessionId!==view.ref.nativeSessionId)return;
  const key=(message:SessionMessage)=>{
    const p=message.provenance as {authenticated?:boolean;adapter?:string;sourceEventIds?:string[]}|undefined;
    if(message.role!=='user'||!message.createdAt||!Number.isFinite(Date.parse(message.createdAt))||p?.authenticated!==true||p.adapter!=='e-pi-adapter'||!p.sourceEventIds?.length)return;
    return JSON.stringify([view.ref.nativeSessionId,message.createdAt,exactOperationKey('user-message',message.blocks)]);
  };
  const counts=new Map<string,number>();for(const message of snapshot.messages){const tuple=key(message);if(tuple)counts.set(tuple,(counts.get(tuple)??0)+1);}
  for(const message of snapshot.messages){
    const receipt=observed[message.id], origin=receipt?.intentId ? intents[receipt.intentId] ?? receipt : receipt, tuple=key(message);
    if(origin){
      message.origin=origin;
      if(tuple&&counts.get(tuple)===1){const p=message.provenance as {sourceEventIds:string[]};bindings[tuple]={origin:structuredClone(origin),observedMessageId:message.id,sourceEventIds:[...p.sourceEventIds]};}
    }else if(tuple&&counts.get(tuple)===1&&bindings[tuple])message.origin=structuredClone(bindings[tuple].origin);
  }
}
