import type { SessionView } from '../../../../api/e/contracts';
import { collaborationReady } from '../../../../shared/collaboration-protocol.mjs';
export function collaborationPresentation(view: SessionView | undefined, online: boolean) {
 const status=view?.collaboration;
 if(!online)return {state:'offline',label:'协作连接未确认',reason:'当前离线；下方版本只是上次记录，不代表工具可调用。',status};
 if(view?.lifecycle!=='ready')return {state:'unavailable',label:'协作未启用',reason:'会话就绪后重新确认 Skill 与工具版本；恢复会话不会自动恢复暂停队列。',status};
 if(collaborationReady(status))return {state:'ready',label:'协作工具已确认',reason:'同画布读取、发布与消息入队；仍遵守当前审批。Skill 规则已绑定到受管会话，不表示模型一定采纳每条建议。',status};
 if(status?.state==='checking')return {state:'checking',label:'协作版本确认中',reason:status.reason??'等待运行器握手；仅有资源文件还不够。',status};
 if(status?.state==='incompatible'||status?.state==='ready')return {state:'incompatible',label:'协作版本不兼容',reason:status.reason??'运行器与 API 版本不一致；普通聊天不受影响。',status};
 return {state:'unavailable',label:'协作工具未加载',reason:status?.reason??'此运行器尚未确认协作包。安全更新 API 后，明确恢复会话以加载；不会自动重启。',status};
}
