import { X } from 'lucide-react';
import type { CanvasEdge } from './contracts';
import type { CommunicationState } from '../../../api/e/collaboration-contracts';
const labels: Record<CommunicationState, string> = { preparing:'准备投递',pending:'待发',paused:'已暂停',submitted:'等待消费确认',consumed:'已确认消费',unknown:'结果未知 · 不会重发',rejected:'已拒绝',cancelled:'已移除',read:'已读取' };
export function CommunicationTrace({edge,onClose}:{edge:CanvasEdge;onClose:()=>void}) {
 const records=edge.communication?.records??[];
 return <aside className="canvas-communication-trace" role="complementary" aria-label="Agent 通信记录">
  <header><div><strong>Agent 通信</strong><p>{edge.communication?.count??0} 条实际记录 · 最近 {records.length} 条</p></div><button type="button" onClick={onClose} aria-label="关闭通信记录"><X size={18}/></button></header>
  <p className="canvas-communication-note">引用本身不产生连线。已入队不等于已消费，已消费不等于任务完成。箭头表示操作发起方 → 目标。</p>
  <ol>{[...records].reverse().map(record=><li key={record.id} data-communication-id={record.id}>
   <div className="canvas-communication-row"><strong>{record.operation==='send'?'发送消息':'读取产物'}</strong><span data-communication-state={record.state}>{labels[record.state]}</span></div>
   <p className="canvas-communication-identity">{record.sourceName} → {record.targetName}</p>
   <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time>
   <pre>{record.content}</pre>
   {record.truncated&&<p>内容已截断；摘要对应完整源文本。</p>}
   {record.error&&<p role="alert">{record.error}</p>}
   <details><summary>来源与证据</summary><p>记录 {record.id}</p><p>调用 {record.toolCallId}</p>{record.artifactId&&<p>产物 / 回复 {record.artifactId}</p>}{record.digest&&<p>SHA-256 {record.digest}</p>}<p>链深度 {record.hop} · 更新 {record.updatedAt}</p></details>
  </li>)}</ol>
 </aside>;
}
