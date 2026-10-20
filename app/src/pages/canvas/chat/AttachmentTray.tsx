import { FileText, Image, X } from 'lucide-react';
import type { Attachment } from '../../../../api/e/contracts';
import { attachmentText } from '../../../../shared/message-content.mjs';
import { pastedAttachment } from './attachments';
import { ChatPopover } from './ChatPopover';
export function AttachmentTray({items,onChange}:{items:Attachment[];onChange?:(value:Attachment[])=>void}) {
 if(!items.length)return null;
 return <div className="chat-attachments" aria-label="消息附件">{items.map(a=><div key={a.id} className="chat-attachment" data-attachment-id={a.id}>
  <ChatPopover id={`attachment:${a.id}`} label={`附件 ${a.name}`} title={`预览 ${a.name}`} contentClassName="chat-attachment-popover" trigger={<>{a.mimeType==='text/plain'?<FileText size={14}/>:<Image size={14}/>}<span>{a.name}</span></>}>
   {a.mimeType==='text/plain'?onChange?<textarea aria-label={`编辑附件 ${a.name}`} value={attachmentText(a)} rows={6} onChange={e=>onChange(items.map(x=>x.id===a.id?{...pastedAttachment(e.target.value,a.name),id:a.id}:x))}/>:<pre>{attachmentText(a)}</pre>:<img alt={`附件预览 ${a.name}`} src={`data:${a.mimeType};base64,${a.data}`} loading="lazy"/>}
   <p className="chat-muted">{a.mimeType==='text/plain'?'按预览原文和附件名称发送，不写入项目文件。':'按原始图片内容块发送，不读取其他路径或远程资源。'}</p>
  </ChatPopover>{onChange&&<button type="button" className="chat-attachment-remove" aria-label={`移除 ${a.name}`} title={`移除 ${a.name}`} onClick={()=>onChange(items.filter(x=>x.id!==a.id))}><X size={13}/></button>}
 </div>)}</div>;
}
