import type { RuntimeConfiguration,RuntimeModel,SessionView } from '../../../../api/e/contracts';
const thinkingNames:Record<string,string>={off:'关闭',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'更高',max:'最高'};
export function thinkingName(level?:string){return level?thinkingNames[level]??level:'待确认';}
export function modelName(model?:RuntimeModel){return model?.name?.trim()||model?.id||'模型待确认';}
export function thinkingLevels(config?:RuntimeConfiguration){return [...new Set((config?.thinkingLevels??[]).filter(x=>typeof x==='string'&&x.length>0))];}
export function configurationBasis(config?:RuntimeConfiguration){return JSON.stringify([config?.nativeSessionId,config?.revision,config?.model?.provider,config?.model?.id,config?.thinkingLevel,thinkingLevels(config)]);}
export function configurationBlockReason(view:SessionView|undefined,online:boolean,readOnly:boolean){
 if(readOnly)return '工作区只读，不能修改配置。';
 if(!online)return '连接中断，保留最后确认配置。';
 if(view?.lifecycle!=='ready')return '恢复会话后读取模型与推理档位。';
 if(view.configurationPending)return '正在等待运行器确认…';
 if(view.configurationError)return '配置未确认，请重新读取后再修改。';
 if(!view.configuration)return '尚未读取当前运行器配置。';
 const s=view.snapshot;
 if(s?.status!=='idle'||s.runs.some(r=>r.state==='running')||s.approvals?.some(a=>a.state==='pending')||s.pendingActions?.some(a=>a.kind!=='model'&&['submitted','dispatched','outcome-unknown'].includes(a.state)))return '执行中或有未确认操作，结束后才能修改。';
 return undefined;
}
export function modelGroups(models:RuntimeModel[],query=''){
 const groups=new Map<string,RuntimeModel[]>(),seen=new Set<string>(),q=query.trim().toLocaleLowerCase();
 for(const model of models){const key=JSON.stringify([model.provider,model.id]);if(seen.has(key)||q&&!`${model.provider} ${model.id} ${model.name??''}`.toLocaleLowerCase().includes(q))continue;seen.add(key);const list=groups.get(model.provider)??[];list.push(model);groups.set(model.provider,list);}
 return [...groups].map(([provider,models])=>({provider,models}));
}
