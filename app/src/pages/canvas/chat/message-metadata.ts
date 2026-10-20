import type {SessionMessage,SessionTool} from '../../../../api/e/contracts';
export function sourceLabel(message?:SessionMessage):string {
 const source=message?.origin;
 if(!source||typeof source!=='object')return '来源未知 · 历史或未关联输入';
 const value=source as Record<string,unknown>;
 if(typeof value.label!=='string'||typeof value.channel!=='string')return '来源未知 · 缺少可信来源信息';
 if(value.authenticated!==true)return `${value.label} · 身份未认证`;
 const kind=value.kind==='human'?'Human':value.kind==='agent'?'Agent':value.kind==='system'?'系统':'来源未知';
 return `${kind} · ${value.label}`;
}
export function modelLabel(message?:SessionMessage):string|undefined {
 if(typeof message?.model==='string')return message.model;
 if(message?.model&&typeof message.model==='object') {const m=message.model as Record<string,unknown>;return [m.provider,m.id??m.model].filter(v=>typeof v==='string').join('/')||undefined;}
 return undefined;
}
export function toolDuration(tools:SessionTool[]):string|undefined {
 if(!tools.length||tools.some(t=>!['completed','failed','cancelled'].includes(t.state)||!t.createdAt||!t.updatedAt))return undefined;
 const start=Math.min(...tools.map(t=>Date.parse(t.createdAt!))),end=Math.max(...tools.map(t=>Date.parse(t.updatedAt!)));
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return undefined;
 return `${((end-start)/1000).toFixed(1)}s`;
}
