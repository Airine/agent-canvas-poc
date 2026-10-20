export type CardViewPreference='auto'|'compact'|'detail';
export type CardViewSetting=CardViewPreference|'inherit';
export const GLOBAL_CARD_VIEW_KEY='canvas.card-view.global.v1';
export const CARD_VIEW_LABELS:Record<CardViewPreference,string>={auto:'自动',compact:'缩略',detail:'详细'};
export function isCardView(value:unknown):value is CardViewPreference{return value==='auto'||value==='compact'||value==='detail';}
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
/** A browser-local default, shared by namespaced product canvases, not demo runtimes. */
export class GlobalCardViewPreferences {
 private value:CardViewPreference='auto';
 private loaded=false;
 private listeners=new Set<()=>void>();
 private storage:()=>StorageLike;
 private events:EventTarget|undefined;
 constructor(storage:()=>StorageLike=()=>globalThis.localStorage,events:EventTarget|undefined=typeof window==='undefined'?undefined:window){this.storage=storage;this.events=events;}
 private refresh(){try{const value=this.storage().getItem(GLOBAL_CARD_VIEW_KEY);this.value=isCardView(value)?value:'auto';}catch{/* private/quota mode keeps the in-memory value */}this.loaded=true;}
 getSnapshot=():CardViewPreference=>{if(!this.loaded)this.refresh();return this.value;};
 private onStorage=(event:Event)=>{const e=event as StorageEvent;if(e.key!==GLOBAL_CARD_VIEW_KEY&&e.key!==null)return;try{if(e.storageArea&&e.storageArea!==this.storage())return;}catch{return;}const next=isCardView(e.newValue)?e.newValue:'auto';if(next===this.value)return;this.value=next;this.loaded=true;for(const fn of this.listeners)fn();};
 subscribe=(listener:()=>void)=>{if(!this.listeners.size){this.refresh();this.events?.addEventListener('storage',this.onStorage);}this.listeners.add(listener);return()=>{this.listeners.delete(listener);if(!this.listeners.size)this.events?.removeEventListener('storage',this.onStorage);};};
 set(value:CardViewPreference){if(!isCardView(value))return;const changed=this.getSnapshot()!==value;this.value=value;try{this.storage().setItem(GLOBAL_CARD_VIEW_KEY,value);}catch{/* in-memory fallback */}if(changed)for(const fn of this.listeners)fn();}
}
export const globalCardViewPreferences=new GlobalCardViewPreferences();
