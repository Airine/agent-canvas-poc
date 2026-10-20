import { memo, type ReactNode, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { safeLink } from './error-presentation';
function textContent(node:ReactNode):string {if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(textContent).join('');if(isValidElement<{children?:ReactNode}>(node))return textContent(node.props.children);return '';}
export const MarkdownContent=memo(function MarkdownContent({text,streaming=false}:{text:string;streaming?:boolean}){
 return <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={url=>safeLink(url)??''} components={{
  a:({href,children})=>href?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
  img:({alt})=><span className="chat-muted">[图片未自动加载{alt?`：${alt}`:''}]</span>,
  pre:({children})=>{const child=isValidElement<{className?:string}>(children)?children:null;const lang=child?.props.className?.replace('language-','')??'';return <CodeBlock code={textContent(children).replace(/\n$/,'')} language={lang} streaming={streaming}/>;},
  table:({children})=><div className="chat-table"><table>{children}</table></div>,
 }}>{text}</ReactMarkdown></div>;
});
