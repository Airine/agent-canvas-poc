// Explicit fixture process. Never used by runtime production paths.
let config;
process.on('message', message=>{
 if(message.type==='stop')process.exit(0);
 if(message.type==='init'){
  config=message.config;
  if(config.dir.includes('fail-start')){process.send({type:'fatal',error:'fixture start failure'});setTimeout(()=>process.exit(1),10);return;}
  if(config.dir.includes('hang-start'))return;
  const ref={nativeSessionId:config.nativeSessionId,agentSessionId:`as:${config.nativeSessionId}`,cwd:config.cwd};
  process.send({type:'ready',ref,snapshot:{...ref,id:ref.agentSessionId,epoch:'fixture',revision:1,seq:1,nextSeq:2,status:'idle',capabilities:[],messages:[],runs:[],tools:[],pendingActions:[],degradedReasons:[]}});
 }
 if(message.type==='control'){
  if(message.payload.content==='crash'){process.exit(1);return;}
  if(message.payload.content==='hang')return;
  setTimeout(()=>process.send({type:'response',id:message.id,result:{id:message.payload.intentId,state:'dispatched'}}),40);
 }
});
process.on('disconnect',()=>process.exit(0));
