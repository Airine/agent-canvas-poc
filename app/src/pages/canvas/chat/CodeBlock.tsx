import { useEffect, useState } from 'react';
import type { ThemedToken } from 'shiki';
import { useTheme } from 'next-themes';
import { CopyButton } from './primitives';
const loaders={
 javascript:()=>import('shiki/langs/javascript.mjs'),typescript:()=>import('shiki/langs/typescript.mjs'),tsx:()=>import('shiki/langs/tsx.mjs'),json:()=>import('shiki/langs/json.mjs'),bash:()=>import('shiki/langs/bash.mjs'),python:()=>import('shiki/langs/python.mjs'),css:()=>import('shiki/langs/css.mjs'),html:()=>import('shiki/langs/html.mjs'),
};
const aliases:Record<string,string>={js:'javascript',ts:'typescript',sh:'bash',shell:'bash',py:'python'};
let engine:Promise<import('shiki').HighlighterCore>|undefined;
async function highlight(code:string,language:keyof typeof loaders,theme:string){
 engine??=Promise.all([import('shiki/core'),import('shiki/engine/javascript'),import('shiki/themes/github-dark.mjs'),import('shiki/themes/github-light.mjs')]).then(([core,js,dark,light])=>core.createHighlighterCore({themes:[dark.default,light.default],langs:[],engine:js.createJavaScriptRegexEngine()}));
 const h=await engine;await h.loadLanguage((await loaders[language]()).default);return h.codeToTokens(code,{lang:language,theme}).tokens;
}
export function CodeBlock({code,language='',streaming=false}:{code:string;language?:string;streaming?:boolean}) {
 const {resolvedTheme}=useTheme();const theme=resolvedTheme==='light'?'github-light':'github-dark';
 const [tokens,setTokens]=useState<{code:string;theme:string;lines:ThemedToken[][]}|null>(null),[limit,setLimit]=useState(16000);
 useEffect(()=>{let alive=true;const lang=aliases[language]??language;if(streaming||code.length>16000||!Object.hasOwn(loaders,lang))return;
 void highlight(code,lang as keyof typeof loaders,theme).then(lines=>{if(alive)setTokens({code,lines,theme});}).catch(()=>{/* plaintext is a supported fallback */});return()=>{alive=false;};},[code,language,streaming,theme]);
 return <div className="chat-code"><div className="chat-code-header"><span>{language||'纯文本'}</span><CopyButton text={code} label="复制代码"/></div><pre><code>{tokens?.code===code&&tokens.theme===theme?tokens.lines.map((line,i)=><span key={i}>{line.map((token,j)=><span key={j} style={{color:token.color}}>{token.content}</span>)}{'\n'}</span>):code.slice(0,limit)}</code></pre>{!tokens&&code.length>limit&&<button className="chat-quiet" onClick={()=>setLimit(n=>n+16000)}>展开更多代码</button>}</div>;
}
