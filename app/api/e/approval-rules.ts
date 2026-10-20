import fs from 'node:fs';
import path from 'node:path';
import type { ApprovalInput } from './approval-binding.js';
export type RuleDecision = { route:'allow'|'review'|'manual'; rule:string; reason:string };
const sensitive=/(^|[/._-])(env|ssh|aws|gnupg|credentials?|secrets?|tokens?|auth|id_rsa|id_ed25519)([/._-]|$)|\.pem$|\.key$|\.git(?:[/]|$)/i;
function inside(root:string,target:string) {const rel=path.relative(root,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function safePath(root:string,input:string,newFile=false): string | undefined {
 if(!input||input.includes('\0')||input.startsWith('~')||sensitive.test(input))return;
 if(input.split(/[\\/]/).includes('..'))return;
 const resolved=path.resolve(root,input);if(!inside(root,resolved))return;
 try{
  // An in-project directory alias can still target .git or executable config.
  // Keep assisted approval conservative: reject symlinks at every component.
  let current=root;
  for(const part of path.relative(root,resolved).split(path.sep).filter(Boolean)) {
   current=path.join(current,part);
   try { if(fs.lstatSync(current).isSymbolicLink())return; }
   catch(error) { if(!newFile || current!==resolved || (error as NodeJS.ErrnoException).code!=='ENOENT')return; }
  }
  const real=fs.realpathSync(newFile?path.dirname(resolved):resolved);
  if(!inside(root,real))return;
  if(fs.existsSync(resolved)&&fs.lstatSync(resolved).isSymbolicLink())return;
  return resolved;
 }catch{return;}
}
const manual=(rule:string,reason:string):RuleDecision=>({route:'manual',rule,reason});
export function approvalRule(input:ApprovalInput,cwd:string):RuleDecision {
 if(!input.complete||!input.args)return manual('missing-parameters','未收到完整一致的工具参数，必须人工确认');
 let root:string;try{root=fs.realpathSync(cwd);}catch{return manual('cwd-unavailable','无法验证工作目录');}
 const args=input.args;
 if(input.tool==='bash'){
  if(Object.keys(args).some(k=>!['command','timeout'].includes(k))||typeof args.command!=='string')return manual('shell-arguments','未知 shell 参数');
  const command=args.command.trim();
  // Never infer shell safety from prefixes. No operators, quoting, substitutions or expansion.
  if(!/^[a-zA-Z0-9_./ =,:-]+$/.test(command)||sensitive.test(command))return manual('complex-shell','复合命令、展开、引号或敏感路径必须人工确认');
  if(command==='pwd'||/^(git status(?: --short| --porcelain| -s)?|git diff(?: --stat| --name-only| --numstat)?)$/.test(command))return {route:'allow',rule:'readonly-command-v1',reason:'精确命中只读命令白名单'};
  const parts=command.split(/\s+/);
  if(parts[0]==='ls'&&parts.slice(1).every(v=>/^-[alh]+$/.test(v)||!!safePath(root,v))){return {route:'allow',rule:'project-list-v1',reason:'项目范围内的目录列表，未含复合 shell 语法'};}
  return manual('unlisted-shell','未列入白名单的 shell 命令转人工；AI 不批准任意 shell');
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
