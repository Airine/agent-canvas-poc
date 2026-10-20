import type { Attachment } from '../../../../api/e/contracts';
import { ATTACHMENT_LIMITS } from '../../../../shared/message-content.mjs';
export function base64(bytes:Uint8Array):string {
 let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);
}
export function pastedAttachment(text:string,name='粘贴内容.txt'):Attachment {return {id:crypto.randomUUID(),name,mimeType:'text/plain',data:base64(new TextEncoder().encode(text))};}
export async function readAttachment(file:File):Promise<Attachment>{
 if(file.size>ATTACHMENT_LIMITS.image)throw Error('单个文件超过 2 MiB 限制');
 const reported=file.type.toLowerCase().split(';',1)[0].trim();
 const mime=['text/plain','text/markdown','text/x-markdown','text/csv'].includes(reported)
  || (!reported && /\.(txt|md|log|csv)$/i.test(file.name)) ? 'text/plain' : reported;
 if(!['text/plain','image/png','image/jpeg','image/webp'].includes(mime))throw Error('请选择 UTF-8 纯文本或 PNG/JPEG/WebP 图片');
 return {id:crypto.randomUUID(),name:file.name,mimeType:mime as Attachment['mimeType'],data:base64(new Uint8Array(await file.arrayBuffer()))};
}
