import fs from 'node:fs';
import path from 'node:path';
import { parse, type AnyNode } from 'acorn';
import { safePath } from './approval-paths.js';

type Data = {kind:'data';text?:string};
type Value = Data|{kind:'fs'|'path'|'JSON'|'console'};
const data:Data={kind:'data'};
const forbidden=new Set(['constructor','prototype','__proto__']);
const methods=new Set(['map','filter','find','some','every','forEach','slice','join','includes','indexOf','split','trim','toLowerCase','toUpperCase','startsWith','endsWith','at']);
/** Abstract inspection, not JS execution. Unknown nodes/calls/paths fail closed.
 * Only builtin fs/path, plain data transforms and console output are supported.
 * Filesystem reads require statically known local paths; data-derived paths are NOT guessed.
 */
export function inspectNode(source:string,root:string):void {
 if(source.length>8000)throw Error('内联源码过长');
 const scope=new Map<string,Value>([['JSON',{kind:'JSON'}],['console',{kind:'console'}]]);
 let nodes=0;
 const fail=():never=>{throw Error('内联 Node 含未支持的执行效果或动态路径，需人工确认');};
 const plain=(value:Value):Data=>{if(value.kind!=='data')return fail();return value;};
 const property=(node:AnyNode):string=>{
  if(node.type!=='MemberExpression')return fail();
  const key=!node.computed&&node.property.type==='Identifier'?node.property.name:node.computed&&node.property.type==='Literal'&&['string','number'].includes(typeof node.property.value)?String(node.property.value):fail();
  if(forbidden.has(key))fail();return key;
 };
 const bind=(name:string,value:Value)=>{if(scope.has(name)||['require','process','global','globalThis','eval','Function','Buffer','__dirname','__filename'].includes(name)||forbidden.has(name))fail();scope.set(name,value);};
 const visit=(node:AnyNode):Value=>{
  if(++nodes>2000)fail();
  switch(node.type){
   case 'Program':case 'BlockStatement':for(const child of node.body)visit(child);return data;
   case 'EmptyStatement':return data;
   case 'ExpressionStatement':return visit(node.expression);
   case 'VariableDeclaration':
    if(node.kind!=='const')return fail();
    for(const declaration of node.declarations){if(declaration.id.type!=='Identifier'||!declaration.init)fail();else bind(declaration.id.name,visit(declaration.init));}return data;
   case 'Identifier':return scope.get(node.name)??fail();
   case 'Literal':if(node.regex||node.bigint)fail();return typeof node.value==='string'?{kind:'data',text:node.value}:data;
   case 'ArrayExpression':for(const item of node.elements){if(item)plain(visit(item));}return data;
   case 'ObjectExpression':
    for(const item of node.properties){
     if(item.type!=='Property'||item.kind!=='init'||item.method||item.computed)fail();
     else {const key=item.key.type==='Identifier'?item.key.name:item.key.type==='Literal'?String(item.key.value):fail();if(forbidden.has(key))fail();plain(visit(item.value));}
    }return data;
   case 'MemberExpression':plain(visit(node.object));property(node);return data;
   case 'UnaryExpression':if(!['!','+','-','typeof','void'].includes(node.operator))fail();plain(visit(node.argument));return data;
   case 'BinaryExpression':case 'LogicalExpression':{
    const left=plain(visit(node.left)),right=plain(visit(node.right));
    return node.operator==='+'&&left.text!==undefined&&right.text!==undefined?{kind:'data',text:left.text+right.text}:data;
   }
   case 'ConditionalExpression':plain(visit(node.test));plain(visit(node.consequent));plain(visit(node.alternate));return data;
   case 'IfStatement':plain(visit(node.test));visit(node.consequent);if(node.alternate)visit(node.alternate);return data;
   case 'ReturnStatement':if(node.argument)plain(visit(node.argument));return data;
   case 'CallExpression':{
    if(node.optional||node.arguments.some(arg=>arg.type==='SpreadElement'))fail();
    if(node.callee.type==='Identifier'&&node.callee.name==='require'){
     if(node.arguments.length!==1||node.arguments[0].type!=='Literal')return fail();
     const name=node.arguments[0].value;
     return name==='fs'||name==='node:fs'?{kind:'fs'}:name==='path'||name==='node:path'?{kind:'path'}:fail();
    }
    if(node.callee.type!=='MemberExpression')return fail();
    const name=property(node.callee),owner=visit(node.callee.object);
    // Only plain-data callback parameters: no module capabilities or callable values escape.
    const args=node.arguments.map(arg=>{
     if(arg.type==='ArrowFunctionExpression'){
      if(owner.kind!=='data'||!['map','filter','find','some','every','forEach'].includes(name)||arg.async)fail();
      const outer=new Map(scope);
      for(const param of arg.params){if(param.type!=='Identifier')fail();else bind(param.name,data);}
      plain(visit(arg.body));scope.clear();for(const [key,value] of outer)scope.set(key,value);return data;
     }
     return plain(visit(arg));
    });
    if(owner.kind==='fs'){
     if(!['readFileSync','readdirSync','existsSync','statSync'].includes(name)||args.length<1||args.length>2||args[0].text===undefined)fail();
     const file=safePath(root,args[0].text!);if(!file)throw Error('Node 读取路径越界、敏感、链接或不存在');
     const stat=fs.statSync(file!);
     if(name==='readFileSync'){
      if(args.length!==2||!['utf8','utf-8'].includes(args[1].text??'')||!stat.isFile()||stat.size>256000)fail();
     }else if(args.length!==1||name==='readdirSync'&&(!stat.isDirectory()||fs.readdirSync(file!).length>2000))fail();
     return data;
    }
    if(owner.kind==='path'){
     if(!['join','resolve','dirname','basename','extname'].includes(name)||!args.length||args.some(arg=>arg.text===undefined))fail();
     const texts=args.map(arg=>arg.text!);
     if(name==='join')return {kind:'data',text:path.join(...texts)};
     if(name==='resolve')return {kind:'data',text:path.resolve(root,...texts)};
     if(texts.length!==1)fail();return {kind:'data',text:name==='dirname'?path.dirname(texts[0]):name==='basename'?path.basename(texts[0]):path.extname(texts[0])};
    }
    if(owner.kind==='JSON'&&['parse','stringify'].includes(name)&&args.length>=1&&args.length<=3)return data;
    if(owner.kind==='console'&&['log','info','error'].includes(name))return data;
    if(owner.kind==='data'&&methods.has(name))return data;
    return fail();
   }
   default:return fail();
  }
 };
 visit(parse(source,{ecmaVersion:2022,sourceType:'script'}));
}
