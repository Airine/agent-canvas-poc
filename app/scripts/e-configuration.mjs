// Deliberately narrow private worker configuration API. No arbitrary RPC passthrough.
function cleanModel(model) {
  if(!model||typeof model.provider!=='string'||typeof model.id!=='string')return undefined;
  return {provider:model.provider,id:model.id,...(typeof model.name==='string'?{name:model.name}:{}),input:Array.isArray(model.input)?model.input.filter(v=>v==='text'||v==='image'):[],...(Number.isFinite(model.contextWindow)&&model.contextWindow>0?{contextWindow:model.contextWindow}:{})};
}
export async function readConfiguration(rpc,nativeSessionId) {
  const state=await rpc('get_state');
  if(state.sessionId!==nativeSessionId)throw new Error('configuration native identity mismatch');
  const available=await rpc('get_available_models'),thinking=await rpc('get_available_thinking_levels');
  const stats=await rpc('get_session_stats'),model=cleanModel(state.model),usage=stats.sessionId===nativeSessionId?stats.contextUsage:undefined;
  const validUsage=usage&&model?.contextWindow===usage.contextWindow&&Number.isFinite(usage.contextWindow)&&usage.contextWindow>0&&(usage.tokens===null||Number.isFinite(usage.tokens)&&usage.tokens>=0)&&(usage.percent===null||Number.isFinite(usage.percent)&&usage.percent>=0);
  return {nativeSessionId,confirmedAt:new Date().toISOString(),model,thinkingLevel:state.thinkingLevel,models:(available.models??[]).map(cleanModel).filter(Boolean),thinkingLevels:thinking.levels??[],...(validUsage?{contextUsage:{tokens:usage.tokens,contextWindow:usage.contextWindow,percent:usage.percent}}:{})};
}
export async function assertIdle(rpc,nativeSessionId) {
  const state=await rpc('get_state');
  if(state.sessionId!==nativeSessionId)throw new Error('native identity mismatch');
  if(state.isStreaming||state.isCompacting||state.pendingMessageCount>0)throw new Error('运行器忙碌或有已提交消息，等待空闲后操作');
  return state;
}
export async function changeConfiguration(rpc,bridge,client,ref,change) {
  await assertIdle(rpc,ref.nativeSessionId);
  const before=await readConfiguration(rpc,ref.nativeSessionId);
  if(change.model){
    if(!before.models.some(m=>m.provider===change.provider&&m.id===change.model))throw new Error('运行器没有可用的指定模型');
    const basis=await bridge.controlBasis(ref.agentSessionId);
    if(basis.runningRunIds.length||!basis.capabilities.some(c=>c.name==='model.switch'&&c.available&&c.authority==='authoritative'&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now())))throw new Error('model.switch unavailable');
    await assertIdle(rpc,ref.nativeSessionId);
    const result=await client.agentSessionSwitchModel({agentSessionId:ref.agentSessionId,expectedSessionId:ref.nativeSessionId,expectedRevision:basis.revision,actor:'canvas-ui',idempotencyKey:change.intentId,provider:change.provider,model:change.model});
    if(['rejected','outcome-unknown'].includes(result.status))throw new Error(`${result.status}: ${result.reason??'model switch unconfirmed'}`);
  }
  if(change.thinkingLevel!==undefined){
    const levels=await rpc('get_available_thinking_levels');
    if(!levels.levels?.includes(change.thinkingLevel))throw new Error('当前模型不支持此思考级别');
    await assertIdle(rpc,ref.nativeSessionId);
    await rpc('set_thinking_level',{level:change.thinkingLevel});
  }
  const after=await readConfiguration(rpc,ref.nativeSessionId);
  if(change.model&&(after.model?.provider!==change.provider||after.model?.id!==change.model)||change.thinkingLevel!==undefined&&after.thinkingLevel!==change.thinkingLevel)throw new Error('outcome-unknown: runtime configuration readback mismatch');
  return after;
}
