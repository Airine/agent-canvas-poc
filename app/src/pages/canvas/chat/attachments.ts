import type { Attachment } from '../../../../api/e/contracts';
import { ATTACHMENT_LIMITS } from '../../../../shared/message-content.mjs';
function base64(bytes:Uint8Array):string {
 let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);
}
export function pastedAttachment(text:string,name='粘贴内容.txt'):Attachment {return {id:crypto.randomUUID(),name,mimeType:'text/plain',data:base64(new TextEncoder().encode(text))};}
const CLIPBOARD_IMAGE_TYPES = ['image/png','image/jpeg','image/webp'];
type ClipboardItemLike = {kind?:string;type?:string;getAsFile?:()=>File|null};
/** Clipboard images arrive as file items in Chrome/Firefox and as files (sometimes unnamed) in Safari. */
export function clipboardImages(data:{items?:ArrayLike<ClipboardItemLike>;files?:ArrayLike<File>}|null|undefined):File[] {
 if(!data)return [];
 const picked:File[]=[];
 for(const item of data.items?Array.from(data.items):[]){
  const type=(item?.type??'').toLowerCase();
  if(item?.kind!=='file'||!CLIPBOARD_IMAGE_TYPES.includes(type))continue;
  const file=item.getAsFile?.();if(file)picked.push(file);
 }
 if(!picked.length)for(const file of data.files?Array.from(data.files):[])if(CLIPBOARD_IMAGE_TYPES.includes((file.type??'').toLowerCase()))picked.push(file);
 const seen=new Set<string>();
 return picked.filter(file=>{const key=`${file.name}:${file.size}:${file.lastModified}`;if(seen.has(key))return false;seen.add(key);return true;})
  .map((file,index)=>file.name?file:new File([file],`粘贴图片 ${index+1}.${file.type.split('/')[1]||'png'}`,{type:file.type}));
}
export async function readAttachment(file:File):Promise<Attachment>{
 if(file.size>ATTACHMENT_LIMITS.image)throw Error('单个文件超过 2 MiB 限制');
 const reported=file.type.toLowerCase().split(';',1)[0].trim();
 const mime=['text/plain','text/markdown','text/x-markdown','text/csv'].includes(reported)
  || (!reported && /\.(txt|md|log|csv)$/i.test(file.name)) ? 'text/plain' : reported;
 if(!['text/plain','image/png','image/jpeg','image/webp'].includes(mime))throw Error('请选择 UTF-8 纯文本或 PNG/JPEG/WebP 图片');
 return {id:crypto.randomUUID(),name:file.name,mimeType:mime as Attachment['mimeType'],data:base64(new Uint8Array(await file.arrayBuffer()))};
}
