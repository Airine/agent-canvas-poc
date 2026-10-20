import type { SessionView } from '../../../../api/e/contracts';
import { collaborationPresentation } from './collaboration-presentation';
import { redact } from './error-presentation';
export function CollaborationStatus({view,online}:{view?:SessionView;online:boolean}) {
 const p=collaborationPresentation(view,online),loaded=p.status?.loaded,expected=p.status?.expected;
 return <section className="chat-collaboration-status" aria-label="Canvas 协作能力" data-collaboration-state={p.state}>
  <strong>{p.label}</strong><p className="chat-muted">{redact(p.reason)}</p>
  {loaded&&<details><summary>协作版本与加载证据</summary><dl>
   <dt>运行器报告</dt><dd>协议 v{loaded.protocolVersion} · 扩展 v{loaded.extensionVersion} · Skill v{loaded.skill.version}</dd>
   <dt>Skill</dt><dd>{loaded.skill.id} · {p.status?.skillDiscovered?'已发现':'未确认发现'}</dd>
   <dt>工具注册</dt><dd>{p.status?.activeTools?.length??0} / {expected?.tools.length??4}</dd>
   <dt>资源摘要</dt><dd><code>{loaded.bundleHash.slice(0,12)}</code></dd>
   {expected&&expected.bundleHash!==loaded.bundleHash&&<><dt>API 期望</dt><dd><code>{expected.bundleHash.slice(0,12)}</code></dd></>}
   {p.status?.confirmedAt&&<><dt>上次确认</dt><dd><time dateTime={p.status.confirmedAt}>{p.status.confirmedAt}</time></dd></>}
  </dl></details>}
 </section>;
}
