import fs from 'node:fs';
import { safePath } from './approval-paths.js';
import { shellRule } from './approval-shell.js';
import { validateCollaborationArgs } from '../../shared/collaboration-protocol.mjs';
export const APPROVAL_POLICY_VERSION=2;
import type { ApprovalInput } from './approval-binding.js';
export type RuleDecision = { route:'allow'|'review'|'manual'; rule:string; reason:string };
const manual=(rule:string,reason:string):RuleDecision=>({route:'manual',rule,reason});
export function approvalRule(input:ApprovalInput,cwd:string):RuleDecision {
 if(!input.complete||!input.args)return manual('missing-parameters','未收到完整一致的工具参数，必须人工确认');
 let root:string;try{root=fs.realpathSync(cwd);}catch{return manual('cwd-unavailable','无法验证工作目录');}
 const args=input.args;
 if(input.tool==='bash'){
  if(Object.keys(args).some(k=>!['command','timeout'].includes(k))||typeof args.command!=='string')return manual('shell-arguments','未知 shell 参数');
  if(args.timeout!==undefined&&(typeof args.timeout!=='number'||!Number.isFinite(args.timeout)||args.timeout<=0))return manual('shell-arguments','无效的 shell 超时参数');
  return shellRule(args.command,root);
 }
  if(input.tool==='canvas_spawn')return manual('canvas-spawn','派生会启动新的真实会话并消耗模型额度，必须人工确认');
 // Contract growth must never silently expand permission scope.
 if(['canvas_agents','canvas_read','canvas_publish','canvas_send'].includes(input.tool)){
  try{validateCollaborationArgs(input.tool,args);}catch{return manual('canvas-arguments-v2','Canvas 工具参数不符合共享契约，需人工确认');}
  const text=Object.values(args).join('\n');
  if(/-----BEGIN|\bsk-[a-zA-Z0-9]{12}|(?:api[_-]?key|password|authorization|bearer|secret|credential|access[_-]?token)\s*[:=]|https?:\/\/|\b(?:rm|sudo|curl|wget)\s|git\s+(?:push|reset)|忽略.*(?:指令|规则)|ignore.*(?:instruction|policy)/i.test(text))return manual('canvas-sensitive-v2','协作内容含敏感、外传或高风险指令线索，需人工确认');
  return {route:'review',rule:'managed-canvas-v2',reason:'已识别同 Canvas 受管工具；需 AI 审查任务相关性，服务端身份、范围与队列限制仍有效'};
 }
 if(!['write','edit'].includes(input.tool))return manual('unknown-tool','未知工具需要人工审批');
 const rawPath=args.path??args.file_path;
 if(typeof rawPath!=='string')return manual('missing-path','缺少完整文件路径');
 const allowedKeys=input.tool==='write'?['path','file_path','content']:['path','file_path','oldText','newText'];
 if(Object.keys(args).some(k=>!allowedKeys.includes(k)))return manual('unknown-fields','未知工具参数需要人工确认');
 if(rawPath.split(/[\\/]/).some(part=>part.startsWith('.')&&part!=='.'&&part!=='..')||/(?:^|[/\\])(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|Makefile|Dockerfile|pyproject\.toml|Cargo\.toml)$|\.(?:sh|bash|zsh|ps1|command|bat|cmd)$/i.test(rawPath))return manual('execution-config','隐藏配置、依赖清单或启动脚本必须人工确认');
 const file=safePath(root,rawPath,input.tool==='write');
 if(!file)return manual('path-boundary','路径越界、敏感位置、符号链接或父目录无法验证');
 const risky=/(https?:\/\/|fetch\s*\(|curl\b|wget\b|child_process|exec\s*\(|spawn\s*\(|rmSync|unlink|rmtree|Authorization|Bearer\s|api[_-]?key|ignore.*(?:instruction|规则)|忽略.*(?:指令|规则))/i;
 if(input.tool==='write'){
  if(fs.existsSync(file))return manual('overwrite','覆盖已有文件必须人工确认');
  if(typeof args.content!=='string'||args.content.length>8000||risky.test(args.content))return manual('write-risk','大文件或涉及执行、网络/敏感内容，转人工');
  return {route:'review',rule:'new-project-file-v1',reason:'小型项目新文件，需要独立 AI 审查任务相关性与风险'};
 }
 if(typeof args.oldText!=='string'||typeof args.newText!=='string'||!args.oldText||!args.newText.trim()||args.oldText.length>2000||args.newText.length>4000||risky.test(args.oldText+args.newText))return manual('edit-risk','删除、大范围替换或涉及敏感行为，转人工');
 try{
  const stat=fs.statSync(file);if(!stat.isFile()||stat.size>256000)return manual('file-size','目标文件无法安全检查');
  const content=fs.readFileSync(file,'utf8');if(content.split(args.oldText).length!==2)return manual('edit-mismatch','替换位置不是唯一匹配');
 }catch{return manual('file-unavailable','无法读取并验证目标文件');}
 return {route:'review',rule:'bounded-project-edit-v1',reason:'项目内唯一匹配的小范围编辑，需要独立 AI 审查'};
}
