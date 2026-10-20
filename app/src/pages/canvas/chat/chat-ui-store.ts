import type { Attachment, DeliverAs } from '../../../../api/e/contracts';
export interface Reading { id?: string; offset: number; top: number; bottom: boolean }
export interface ChatUIState { attachments: Attachment[]; lostAttachments: string[]; draft: string; mode: DeliverAs; revision: number; expanded: Record<string,boolean>; visible: number; reading: Reading; sending: boolean; error: string; intent?: {id:string;signature:string;revision:number;destination?:'messages'|'queue'}; updatedAt:number }
export class ChatUIStore {
 private state: ChatUIState;
 private listeners=new Set<()=>void>();
 private intents=new Map<string,string>();
 intent(key:string){let id=this.intents.get(key);if(!id){id=crypto.randomUUID();this.intents.set(key,id);}return id;}
 readonly key:string; readonly storage?: Pick<Storage,'getItem'|'setItem'>;
 constructor(key: string, storage?: Pick<Storage,'getItem'|'setItem'>) {
  this.key=key;this.storage=storage;
  this.state={attachments:[],lostAttachments:[],draft:'',mode:'nextTurn',revision:0,expanded:{},visible:30,reading:{top:0,offset:0,bottom:true},sending:false,error:'',updatedAt:Date.now()};
  try {const x=JSON.parse(storage?.getItem(key)??'null');if(x&&Date.now()-x.updatedAt<24*3600000&&typeof x.draft==='string'&&x.draft.length<=100000&&['nextTurn','steer','followUp'].includes(x.mode)){this.state={...this.state,draft:x.draft,lostAttachments:Array.isArray(x.attachmentNames)?x.attachmentNames.filter((n:unknown)=>typeof n==='string'):[],mode:x.mode,revision:Number.isSafeInteger(x.revision)?x.revision:0,...(x.intent&&typeof x.intent.id==='string'&&typeof x.intent.signature==='string'?{intent:x.intent}:{})};if(Array.isArray(x.controlIntents))this.intents=new Map(x.controlIntents.filter((row:unknown)=>Array.isArray(row)&&row.length===2&&row.every(v=>typeof v==='string')).slice(-100));}}catch{/* disabled storage: memory only */}
 }
 getSnapshot=()=>this.state;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 update(patch:Partial<ChatUIState>) {this.state={...this.state,...patch,updatedAt:Date.now()};try{this.storage?.setItem(this.key,JSON.stringify({attachmentNames:[...this.state.attachments.map(a=>a.name),...this.state.lostAttachments],draft:this.state.draft.slice(0,100000),mode:this.state.mode,revision:this.state.revision,intent:this.state.intent,controlIntents:[...this.intents].slice(-100),updatedAt:this.state.updatedAt}));}catch{/* quota/private mode */}for(const fn of this.listeners)fn();}
 draft(value:string){this.update({draft:value.slice(0,100000),revision:this.state.revision+1,error:''});}
 mode(value:DeliverAs){this.update({mode:value,revision:this.state.revision+1,error:''});}
 toggle(id:string,open:boolean){this.update({expanded:{...this.state.expanded,[id]:open}});}
 read(reading:Reading){this.state={...this.state,reading};}
 attachments(value:Attachment[],reselectedNames:string[]=[]){this.update({attachments:value,lostAttachments:this.state.lostAttachments.filter(name=>!reselectedNames.includes(name)),revision:this.state.revision+1,error:''});}
 dismissLost(){this.update({lostAttachments:[],revision:this.state.revision+1,error:''});}
 begin(mode:DeliverAs=this.state.mode,destination?:'messages'|'queue'){const s=this.state,signature=JSON.stringify([mode,s.draft,s.revision,s.attachments.map(a=>[a.id,a.name,a.mimeType,a.data.length])]);const intent=s.intent?.signature===signature?s.intent:{id:crypto.randomUUID(),signature,revision:s.revision,...(destination?{destination}:{})};this.update({intent,sending:true,error:''});return {text:s.draft,attachments:s.attachments,mode,revision:s.revision,id:intent.id,destination};}
 beginAutomatic(destination:'messages'|'queue'){
  const s=this.state;
  if(s.intent?.revision===s.revision){
   if(!['messages','queue'].includes(s.intent.destination??''))throw Error('此草稿有旧版未确认提交记录，请先在会话诊断核实；不会自动改成普通消息或重发');
   if(destination!==s.intent.destination)throw Error('上一条提交结果未确认，不能因运行状态变化改道发送或重新入队；请先在会话诊断核实');
  }
  return this.begin('nextTurn',destination);
 }
 finish(sent:{revision:number},error?:string){this.update({sending:false,error:error??'',...(error?{}:{intent:undefined,...(this.state.revision===sent.revision?{draft:'',attachments:[],lostAttachments:[]}:{})})});}
}
const stores=new Map<string,ChatUIStore>();
export function chatUIKey(workspaceId:string,nodeId:string,nativeId:string){return `canvas.chat.v1:${JSON.stringify([workspaceId,nodeId,nativeId])}`;}
export function getChatUI(workspaceId:string,nodeId:string,nativeId:string){
 const key=chatUIKey(workspaceId,nodeId,nativeId);let store=stores.get(key);
 if(!store){let storage:Storage|undefined;try{storage=globalThis.sessionStorage;}catch{/* memory */}store=new ChatUIStore(key,storage);stores.set(key,store);}return store;
}
