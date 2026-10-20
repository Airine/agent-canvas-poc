import { bindApproval } from '../api/e/approval-binding.ts';
export async function controlSession(bridge, agentSessionId, operation, payload){
  if(!payload||typeof payload.intentId!=='string'||!payload.intentId||payload.intentId.length>256)throw new Error('invalid intent id');
  const perform=async()=>{
    const basis=await bridge.controlBasis(agentSessionId);
    const cap=operation==='messages'?(payload.deliverAs==='steer'?'send.steer':payload.deliverAs==='followUp'?'send.follow-up':'send.user-message'):operation==='abort'?'abort':'approval.resolve';
    if(!basis.capabilities.some(c=>c.name===cap&&c.available&&c.authority==='authoritative'&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now())))throw new Error(`${cap} unavailable or expired`);
    if(operation==='messages'&&(!payload.deliverAs||payload.deliverAs==='nextTurn')&&basis.runningRunIds.length)throw new Error('current run is active; wait for idle or choose steer/followUp');
    const input={agentSessionId:agentSessionId,expectedSessionId:basis.nativeSessionId,expectedRevision:basis.revision,actor:'canvas-ui',idempotencyKey:payload.intentId};
    if(operation==='messages')return bridge.send({...input,content:payload.content,...(payload.deliverAs?{deliverAs:payload.deliverAs}:{})});
    if(operation==='abort'){
      const target=payload.targetRunId||basis.runningRunIds[0];if(!target||!basis.runningRunIds.includes(target))throw new Error('no matching active run');
      return bridge.abort({...input,targetRunId:target});
    }
    if(payload.expectedApprovalDigest && bindApproval(bridge.state.sessions[agentSessionId],payload.approvalId)?.digest!==payload.expectedApprovalDigest)throw new Error('approval arguments changed after review');
    const approval=bridge.state.sessions[agentSessionId]?.approvals?.find(a=>a.id===payload.approvalId&&a.state==='pending');
    if(!approval)throw new Error('pending approval not found');
    return bridge.resolveApproval({...input,approvalId:payload.approvalId,decision:payload.decision,...(payload.response===undefined?{}:{response:payload.response})});
  };
  try{return await perform();}catch(error){if(error.code!=='STALE_STATE')throw error;return perform();}
}
