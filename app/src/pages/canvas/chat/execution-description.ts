import type { SessionTool } from '../../../../api/e/contracts';
import type { ToolDisplay, TurnPart } from './model';
import { redact } from './error-presentation';

type Activity={kind:string;action:string;done:string};
/** Header labels are bounded metadata, never raw tool output, script bodies or thinking text. */
function label(value:unknown):string {
 if(typeof value!=='string'||value.length>4096)return '';
 const text=value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/g,' ').trim();
 if(redact(text)!==text)return '';
 const chars=Array.from(text);return chars.length>28?chars.slice(0,27).join('')+'…':text;
}
function fileLabel(value:unknown):string {
 if(typeof value!=='string'||value.length>4096||value.includes('://')||/(^|[/\\])(?:\.env(?:\.|$)|\.ssh(?:[/\\]|$)|\.aws(?:[/\\]|$)|credentials?(?:[./\\]|$))|id_rsa|id_ed25519|\.(?:pem|key)$/i.test(value))return '';
 return label(value.split(/[/\\]/).filter(Boolean).at(-1));
}
function commandActivity(value:unknown):Activity {
 const generic={kind:'command',action:'执行命令',done:'命令已结束'};
 // Classification is descriptive, not a shell parser, safety verdict or approval rule.
 // Any compound/quoted/expanded/opaque command falls back instead of hiding a dangerous tail.
 if(typeof value!=='string'||value.length>4096||!/^[-\w ./,:=+]+$/.test(value.trim()))return generic;
 const words=value.trim().split(/\s+/),[bin,sub]=words;
 const script=['npm','pnpm','yarn','bun'].includes(bin)?(sub==='run'?words[2]:sub):undefined;
 if(script&&/^test(?::[\w-]+)?$/.test(script)||bin==='pytest'||['python','python3'].includes(bin)&&sub==='-m'&&words[2]==='pytest')return {kind:'test',action:'运行测试命令',done:'测试命令已结束'};
 if(script&&/^build(?::[\w-]+)?$/.test(script))return {kind:'build',action:'运行构建命令',done:'构建命令已结束'};
 if(script&&/^(?:lint|typecheck)(?::[\w-]+)?$/.test(script))return {kind:'check',action:'运行代码检查',done:'代码检查命令已结束'};
 if(bin==='git'&&['status','diff','log'].includes(sub))return {kind:'git',action:'查看 Git 变更记录',done:'Git 查看命令已结束'};
 if(['rg','grep'].includes(bin))return {kind:'search',action:'搜索代码',done:'搜索命令已结束'};
 if(bin==='ls')return {kind:'list',action:'查看目录内容',done:'目录查看命令已结束'};
 if(bin==='pwd'&&words.length===1)return {kind:'directory',action:'确认工作目录',done:'工作目录查询已结束'};
 return generic;
}
function activity(tool:SessionTool):Activity {
 const args=tool.arguments&&typeof tool.arguments==='object'&&!Array.isArray(tool.arguments)?tool.arguments as Record<string,unknown>:{};
 const name=tool.name.toLowerCase(),file=fileLabel(args.path??args.file_path),target=file?' '+file:'文件';
 if(name==='read')return {kind:'read',action:'读取'+target,done:'已查看'+target};
 if(name==='edit'||name==='write')return {kind:'change',action:(name==='edit'?'修改':'写入')+target,done:(name==='edit'?'已修改':'已写入')+target};
 if(['grep','search'].includes(name)){
  const query=label(args.pattern??args.query),scope=query?`「${query}」`:'代码';
  return {kind:'search',action:'搜索'+scope,done:'已搜索'+scope};
 }
 if(['glob','find'].includes(name))return {kind:'locate',action:'查找匹配文件',done:'文件查找调用已结束'};
 if(['ls','list'].includes(name))return {kind:'list',action:'查看目录内容',done:'目录查看调用已结束'};
 if(['bash','shell'].includes(name))return commandActivity(args.command);
 const canvas:Record<string,Activity>={
  canvas_agents:{kind:'canvas',action:'查询同画布 Agent',done:'同画布 Agent 查询已结束'},
  canvas_read:{kind:'canvas',action:'读取同伴产物',done:'同伴产物读取已结束'},
  canvas_publish:{kind:'canvas',action:'发布协作产物',done:'产物发布调用已结束'},
  canvas_send:{kind:'canvas',action:'将消息加入同伴队列',done:'同伴消息入队调用已结束'},
  canvas_spawn:{kind:'canvas',action:'创建协作会话',done:'会话创建调用已结束'},
 };
 return canvas[name]??{kind:'other',action:'调用工具',done:'工具调用已结束'};
}
const failed=({tool}:ToolDisplay)=>tool.state==='failed'||!!tool.isError;
const rejected=(item:ToolDisplay)=>item.approvals.some(a=>a.state==='rejected');
function completedDescription(tools:ToolDisplay[]):string {
 const successful=tools.filter(item=>item.tool.state==='completed'&&!failed(item)&&!rejected(item));
 const last=successful.at(-1);if(!last)return '工具调用已结束';
 const details=successful.map(item=>activity(item.tool));
 if(successful.length===tools.length&&details.length>1&&details.every(item=>item.kind===details[0].kind)){
  const aggregate:Record<string,string>={read:'文件读取',change:'文件更新',search:'搜索',locate:'文件查找',list:'目录查看'};
  if(aggregate[details[0].kind])return `已完成 ${successful.length} 次${aggregate[details[0].kind]}`;
 }
 return (tools.length>1?'最近':'')+activity(last.tool).done;
}
/** Deterministic, local description: never interprets a tool result as task success. */
export function describeExecution(parts:TurnPart[],streaming=false,live=true):string {
 const tools=parts.flatMap(part=>part.kind==='tool'?[part.activity]:[]);
 const running=tools.filter(item=>item.tool.state==='running'&&!failed(item)&&!rejected(item));
 const waiting=tools.filter(item=>item.approvals.some(a=>a.state==='pending'));
 const pending=tools.filter(item=>item.tool.state==='pending'&&!failed(item)&&!rejected(item));
 if(!live&&(streaming||running.length||waiting.length||pending.length))return '会话未就绪，当前进度待确认';
 const approval=waiting.at(-1);if(approval)return '等待批准'+activity(approval.tool).action;
 const current=running.at(-1);if(current)return '正在'+activity(current.tool).action+(running.length>1?`，另有 ${running.length-1} 项执行中`:'');
 const queued=pending.at(-1);if(queued)return '准备'+activity(queued.tool).action;
 const last=tools.at(-1);
 if(last){
  const latest=activity(last.tool);
  if(rejected(last))return latest.action+'请求已被拒绝';
  if(failed(last))return latest.action+'未成功';
  if(last.tool.state==='cancelled')return latest.action+'已中断';
  if(tools.some(({tool})=>!['completed','failed','cancelled'].includes(tool.state)))return '部分工具结果仍待确认';
  const done=completedDescription(tools);return done+(streaming?'，正在梳理结果':'');
 }
 return streaming?'正在思考下一步':parts.some(part=>part.kind==='thinking')?'思考记录可展开查看':'过程记录可展开查看';
}
