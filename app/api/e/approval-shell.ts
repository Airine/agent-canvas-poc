import fs from 'node:fs';
import path from 'node:path';
import { safePath, sensitive } from './approval-paths.js';
import { inspectNode } from './approval-node.js';

/** Deliberately bounded shell grammar, NOT an interpreter or sandbox. No expansion occurs. */
function commands(source:string):string[][] {
 if(!source.trim()||source.length>12000||[...source.replace(/\r\n/g,'\n')].some(c=>(c.charCodeAt(0)<32&&c!=='\n'&&c!=='\t')||c.charCodeAt(0)===127))throw Error('命令为空、过长或包含控制字符');
 source=source.replace(/\r\n/g,'\n');
 const result:string[][]=[];let words:string[]=[],word='',started=false,quote='',after='';
 const flush=()=>{if(started){words.push(word);word='';started=false;}};
 const boundary=(op:string)=>{
  flush();if(!words.length){if(op==='\n'&&(!after||after===';'||after==='\n'))return;throw Error('不完整的命令连接');}
  result.push(words);words=[];after=op;if(result.length>12)throw Error('命令链过长');
 };
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quote==="'"){if(c===quote)quote='';else word+=c;continue;}
  if(c==='\\'){
   const next=source[++i];if(next===undefined)throw Error('反斜杠未闭合');
   if(next==='\n')continue;
   if(quote==='"'&&!['$','`','"','\\'].includes(next))word+='\\';
   word+=next;started=true;continue;
  }
  if(quote==='"'){
   if(c==='"')quote='';else {if(c==='$'||c==='`')throw Error('变量或命令替换需要人工确认');word+=c;}continue;
  }
  if(c==="'"||c==='"'){quote=c;started=true;continue;}
  if(c==='#'&&!started){while(i+1<source.length&&source[i+1]!=='\n')i++;continue;}
  if(c===' '||c==='\t'){flush();continue;}
  if(c==='\n'||c===';'){boundary(c);continue;}
  if(c==='|'||c==='&'){
   let op=c;if(source[i+1]===c){op+=c;i++;}
   if(op==='&')throw Error('后台执行需要人工确认');boundary(op);continue;
  }
  if('$`<>(){}*?[]~!>'.includes(c))throw Error('展开、重定向、分组或未支持的 shell 语法需要人工确认');
  word+=c;started=true;
 }
 if(quote)throw Error('引号未闭合');flush();
 if(words.length)result.push(words);else if(after&&after!==';'&&after!=='\n')throw Error('命令链不完整');
 if(!result.length||result.length>12)throw Error('命令链为空或过长');
 return result;
}
function regular(root:string,value:string){const file=safePath(root,value);if(!file)return false;const stat=fs.statSync(file);return stat.isFile()&&stat.size<=256000;}
function searchPath(root:string,value:string){
 const target=safePath(root,value);if(!target)return false;let count=0;
 const visit=(file:string):boolean=>{
  if(++count>2000)return false;const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||sensitive.test(path.relative(root,file)))return false;
  if(stat.isFile())return stat.size<=256000;
  if(!stat.isDirectory())return false;
  return fs.readdirSync(file).filter(name=>!name.startsWith('.')).every(name=>visit(path.join(file,name)));
 };
 return visit(target);
}
function inspect(words:string[],root:string){
 const [name,...args]=words;
 if(name==='node'){
  if(args.length!==2||!['-e','--eval'].includes(args[0]))throw Error('仅支持完整内联 Node 源码；脚本文件、启动选项或隐藏加载转人工');
  inspectNode(args[1],root);return;
 }
 if(name==='pwd'&&!args.length)return;
 if(name==='git'&&/^(status(?: --short| --porcelain| -s)?|diff(?: --stat| --name-only| --numstat)?)$/.test(args.join(' ')))return;
 if(args.some(arg=>sensitive.test(arg)||arg.includes('://')))throw Error('敏感路径或网络目标需要人工确认');
 if(name==='ls'&&args.every(arg=>arg.startsWith('-')?/^-[alh]+$/.test(arg):!!safePath(root,arg)))return;
 if(name==='echo'&&args.every(arg=>!arg.startsWith('-')||arg==='-n'))return;
 if(['cat','head','tail','wc'].includes(name)){
  const files:string[]=[];
  for(let i=0;i<args.length;i++){
   const arg=args[i];
   if(arg==='--'){files.push(...args.slice(i+1));break;}
   if(arg.startsWith('-')){
    if(name==='cat'&&/^-[nbEsT]+$/.test(arg)||name==='wc'&&/^-[lwc]+$/.test(arg))continue;
    if(['head','tail'].includes(name)&&/^-(?:[1-9]\d{0,3}|[nc][1-9]\d{0,3})$/.test(arg))continue;
    if(['head','tail'].includes(name)&&['-n','-c'].includes(arg)&&/^[1-9]\d{0,3}$/.test(args[i+1]??'')){i++;continue;}
    throw Error('未支持的读取选项需要人工确认');
   }
   files.push(arg);
  }
  if(files.every(file=>regular(root,file)))return;
  throw Error('读取目标越界、敏感、过大或不是普通文件');
 }
 if(name==='rg'||name==='grep'){
  let pattern=false;const files:string[]=[];
  for(const arg of args){
   if(!pattern&&/^-[nilcwF]+$/.test(arg))continue;
   if(!pattern&&!arg.startsWith('-')){pattern=true;continue;}
   if(arg.startsWith('-'))throw Error('未支持的搜索选项需要人工确认');files.push(arg);
  }
  if(!pattern)throw Error('缺少搜索表达式');
  // rg without a path searches cwd; grep without a path only consumes stdin.
  if(name==='rg'&&!files.length)files.push('.');
  if(files.every(file=>name==='rg'?searchPath(root,file):regular(root,file)))return;
  throw Error('无法完整验证搜索范围（含敏感文件、链接或超出检查上限）');
 }
 throw Error(`命令 ${name.slice(0,80)} 的执行效果未受支持，需人工确认`);
}
export function shellRule(command:string,root:string):{route:'allow'|'review'|'manual';rule:string;reason:string} {
 try{
  const parsed=commands(command);for(const words of parsed)inspect(words,root);
  // Keep the original direct whitelist narrow: quotes and chains are reviewed, not auto-approved.
  const plain=command.trim();
  if(/^[a-zA-Z0-9_./ =,:-]+$/.test(plain)&&parsed.length===1){
   if(plain==='pwd'||/^(git status(?: --short| --porcelain| -s)?|git diff(?: --stat| --name-only| --numstat)?)$/.test(plain))return {route:'allow',rule:'readonly-command-v1',reason:'精确命中只读命令白名单'};
   if(parsed[0][0]==='ls')return {route:'allow',rule:'project-list-v1',reason:'已验证项目路径的简单目录列表'};
  }
  return {route:'review',rule:'inspectable-shell-v2',reason:'支持的完整可见命令链；需独立 AI 确认任务相关性与低风险'};
 }catch(error){return {route:'manual',rule:'shell-boundary-v2',reason:error instanceof Error?error.message:'命令无法完整解析，需人工确认'};}
}
