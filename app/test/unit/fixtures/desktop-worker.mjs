let ref,snapshot,configuration;
function publish(){process.send({type:'snapshot',ref,snapshot});}
process.on('message',m=>{
 if(m.type==='stop')return process.exit(0);
 if(m.type==='init'){
  ref={nativeSessionId:m.config.nativeSessionId,agentSessionId:`as:${m.config.nativeSessionId}`,cwd:m.config.cwd,provider:'fixture',model:'one'};
  snapshot={id:ref.agentSessionId,nativeSessionId:ref.nativeSessionId,epoch:'fixture',revision:1,seq:1,nextSeq:2,status:'idle',messages:[],tools:[],runs:[],pendingActions:[],capabilities:[{name:'send.user-message',available:true,authority:'authoritative'}],degradedReasons:[]};
  configuration={nativeSessionId:ref.nativeSessionId,confirmedAt:new Date().toISOString(),model:{provider:'fixture',id:'one',input:['text']},models:[{provider:'fixture',id:'one',input:['text']}],thinkingLevel:m.config.thinkingLevel??'low',thinkingLevels:['low','high']};
  return process.send({type:'ready',ref,snapshot,configuration});
 }
 if(m.type==='configuration')return setTimeout(()=>{configuration={...configuration,thinkingLevel:m.change?.thinkingLevel??configuration.thinkingLevel};process.send({type:'response',id:m.id,result:configuration});},50);
 if(m.type==='control'){
  if(m.payload.content==='hang')return;
  const action={id:m.payload.intentId,kind:'send',idempotencyKey:m.payload.intentId,state:'dispatched'};snapshot.pendingActions.push(action);snapshot.status='live';snapshot.runs=[{id:m.id,state:'running'}];publish();process.send({type:'response',id:m.id,result:action});
  setTimeout(()=>{action.state='applied';action.settledAt=new Date().toISOString();publish();},30);
  setTimeout(()=>{snapshot.status='idle';snapshot.runs[0].state='completed';publish();},80);
 }
});process.on('disconnect',()=>process.exit(0));
