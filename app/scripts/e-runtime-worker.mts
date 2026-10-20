import { recoveryEvent } from '../shared/model-recovery.mjs';
import { createCanvasChannel } from './canvas-channel.mjs';
import { readCollaborationPackage } from '../shared/collaboration-package.mjs';
import { manifestsMatch } from '../shared/collaboration-protocol.mjs';
import { prepareCanvasAdapter } from './canvas-adapter.mjs';
import { fileURLToPath } from 'node:url';
import { readConfiguration, changeConfiguration, assertIdle } from './e-configuration.mjs';
import { validateMessage, messageBlocks } from '../api/e/attachments.ts';
import { loadPiImageProcessor, assertImagesUnchanged } from './e-message-preflight.mjs';
import { controlSession } from './e-control.mjs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs only as a managed IPC worker; the parent supplies server-side configuration.
const children = [];
const sockets = [];
const logs = [];
let bridge, client, ref, closing = false, initialized = false, publishTimer;
let piError, lastSnapshot, piProcess, runtimeConfiguration, refreshTimer;
let piBin, imageProcessor, collaborationChannel, modelRecovery;
let collaborationStatus={state:'unavailable',reason:'API 未提供协作版本，普通聊天不受影响'};
let exclusive = false, serial = Promise.resolve();
const sentIntents = new Set(), actionEvidence = new Set(), origins = {};
function locked(fn) { const job=serial.then(async()=>{exclusive=true;try{return await fn();}finally{exclusive=false;}});serial=job.catch(()=>{});return job; }
function rpc(type,params={}) {
  if(!['get_state','get_available_models','get_available_thinking_levels','get_session_stats','set_thinking_level'].includes(type))throw new Error('unsupported private configuration command');
  return new Promise((resolve,reject)=>{
    const id=`config:${randomUUID()}`;const timer=setTimeout(()=>{pendingPi.delete(id);reject(new Error('outcome-unknown: Pi configuration timeout'));},10000);
    pendingPi.set(id,response=>{clearTimeout(timer);response.success===false?reject(new Error(response.error)):resolve(response.data);});
    piProcess.stdin.write(JSON.stringify({id,type,...params})+'\n');
  });
}
function acceptConfiguration(value) {runtimeConfiguration=value;if(value.model){ref.provider=value.model.provider;ref.model=value.model.id;}return value;}
const pendingPi = new Map();
function send(message) { if (process.connected) process.send(message); }
function log(file) { const stream = fs.createWriteStream(file, { mode: 0o600, flags: 'a' }); logs.push(stream); return stream; }
async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => { const timer=setTimeout(()=>child.kill('SIGKILL'),4000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM'); });
}
async function close(code=0) {
  if (closing) return; closing=true;clearTimeout(publishTimer);clearInterval(refreshTimer);
  bridge?.close();client?.close();
  for (const socket of sockets) socket.destroy();
  for (const child of [...children].reverse()) await terminate(child);
  for (const stream of logs) stream.end();
  process.exit(code);
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>void close());
process.on('disconnect',()=>void close());
process.on('uncaughtException',error=>{send({type:'fatal',error:error.message});void close(1);});
process.on('unhandledRejection',error=>{send({type:'fatal',error:String(error)});void close(1);});
async function connectedPair() {
  const listener=net.createServer();
  await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const accepted=new Promise(resolve=>listener.once('connection',resolve));
  const endpoint=net.createConnection(listener.address().port,'127.0.0.1');
  await new Promise((resolve,reject)=>{endpoint.once('connect',resolve);endpoint.once('error',reject);});
  const inherited=await accepted;listener.close();sockets.push(inherited,endpoint);return {inherited,client:endpoint};
}
function startChild(command,args,options) {
  const child=spawn(command,args,options); children.push(child);
  child.on('error',error=>{send({type:'fatal',error:error.message});void close(1);});
  child.on('exit',(code,signal)=>{if(!closing){send({type:'fatal',error:`runtime exited (${code ?? signal})`});void close(1);}});
  return child;
}
function readLines(stream,callback) {
  let buffer='';stream.setEncoding('utf8');stream.on('data',chunk=>{
    buffer+=chunk;if(Buffer.byteLength(buffer)>32*1024*1024)throw new Error('runtime frame too large');
    for(;;){const i=buffer.indexOf('\n');if(i<0)break;const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.trim())continue;let message;try{message=JSON.parse(line);}catch{continue;}callback(message);}
  });
}
function publish() {
  if(closing||!bridge||!ref)return;
  lastSnapshot=bridge.state.sessions[ref.agentSessionId];
  if(lastSnapshot){
    for(const action of lastSnapshot.pendingActions){
      if(action.kind!=='send'||action.state!=='applied'||!sentIntents.has(action.idempotencyKey))continue;
      const prefix=`action.applied:${action.id}:`;
      for(const eventId of actionEvidence)if(eventId.startsWith(prefix)){
        const observationId=eventId.slice(prefix.length);
        for(const message of lastSnapshot.messages)if(message.role==='user'&&message.provenance?.sourceEventIds?.includes(observationId))origins[message.id]={kind:'unknown',label:'Canvas 本地输入',channel:'canvas-api',authenticated:false,intentId:action.idempotencyKey};
      }
    }
    send({type:'snapshot',snapshot:lastSnapshot,ref,origins});
  }
}
function schedulePublish() { if(!publishTimer)publishTimer=setTimeout(()=>{publishTimer=undefined;publish();},60); }
async function init(input) {
  piBin=input.piBin;
  const load=relative=>import(pathToFileURL(path.join(input.adeRoot,relative)).href);
  const {stableId}=await load('packages/e-core/src/agent-session-contracts.ts');
  const {canonicalBootstrapJson}=await load('packages/e-core/src/daemon-bootstrap.ts');
  const {CoreSocketClient}=await load('packages/e-core/src/socket.ts');
  const {CoreAgentSessionTransport,OrcaAgentSessionBridge}=await load('packages/e-orca-bridge/src/index.ts');
  const nativeSessionId=input.nativeSessionId;
  const agentSessionId=`as:${stableId([nativeSessionId])}`,generation=randomUUID();
  ref={nativeSessionId,agentSessionId,cwd:input.cwd};
  fs.mkdirSync(input.dir,{recursive:true,mode:0o700});
  const sessionDir=path.join(input.dir,'pi-sessions');fs.mkdirSync(sessionDir,{recursive:true,mode:0o700});
  let resumeFile;
  if(input.resume){
    for(const name of fs.readdirSync(sessionDir)){
      const file=path.join(sessionDir,name);
      if(!name.endsWith('.jsonl')||!fs.lstatSync(file).isFile())continue;
      const fd=fs.openSync(file,'r');const buf=Buffer.alloc(65536);const n=fs.readSync(fd,buf,0,buf.length,0);fs.closeSync(fd);
      try{if(JSON.parse(buf.subarray(0,n).toString().split('\n')[0]).id===nativeSessionId){resumeFile=file;break;}}catch{}
    }
    if(!resumeFile)throw new Error('original Pi session file not found; refusing to create an empty replacement');
  }
  const generationDir=path.join(input.dir,'generations',generation);fs.mkdirSync(generationDir,{recursive:true,mode:0o700});
  const rpcPair=await connectedPair(),ingestPair=await connectedPair(),controlPair=await connectedPair();
  const bootstrap={version:1,rpc:[{fd:4,grant:{grantId:`canvas:${generation}`,principalId:'canvas-ui',incarnationId:generation,
    rights:['agentSession.list','agentSession.snapshot','agentSession.events','agentSession.control.send','agentSession.control.abort','agentSession.control.approval.resolve','agentSession.control.model.switch'],agentSessionIds:[agentSessionId],ptySessionIds:[],registry:{workspaceIds:[],worktreeIds:[],agentIds:[]}}}],
    ingest:{fd:5,principal:{principalId:`pi:${nativeSessionId}`,adapter:'e-pi-adapter',nativeSessionId,agentSessionId,generation,allowedEventFamilies:['session','capability','input','run','turn','message','tool','approval','status']}},
    control:{fd:6,adapter:'e-pi-adapter',nativeSessionId,agentSessionId,generation}};
  const coreDir=path.join(input.adeRoot,'packages/e-core');
  const daemon=startChild(process.execPath,['--import','tsx',path.join(coreDir,'src/daemon.ts'),'--bootstrap-fd','3','--state-dir',generationDir],{cwd:coreDir,env:{PATH:process.env.PATH||'',HOME:generationDir},stdio:['ignore','pipe','pipe','pipe',rpcPair.inherited,ingestPair.inherited,controlPair.inherited]});
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('e-core startup timeout')),15000);readLines(daemon.stdout,message=>{if(message.ready){clearTimeout(timer);resolve();}});});
  daemon.stdout.pipe(log(path.join(generationDir,'core.stdout.log')));daemon.stderr.pipe(log(path.join(generationDir,'core.stderr.log')));
  daemon.stdio[3].end(canonicalBootstrapJson(bootstrap)+'\n');await ready;
  let canvasPair,pkg,extensions={adapter:path.join(input.adeRoot,'packages/e-pi-adapter/extensions/e-pi-adapter.ts')};
  if(input.collaboration){
    try {
      pkg=readCollaborationPackage();
      if(!manifestsMatch(input.collaboration,pkg.manifest))throw new Error('API 与 worker 协作资源版本不一致');
      extensions=prepareCanvasAdapter(input.adeRoot,generationDir,fileURLToPath(new URL('./canvas-tools.mjs',import.meta.url)),pkg);
      canvasPair=await connectedPair();
      collaborationChannel=createCanvasChannel(canvasPair.inherited,input.collaboration,{
        onStatus:status=>{collaborationStatus=status;send({type:'collaboration-status',collaboration:status});},
        onCall:call=>send({type:'collaboration',...call}),
      });
    }catch(error){collaborationStatus={state:'incompatible',expected:input.collaboration,reason:error.message};extensions={adapter:path.join(input.adeRoot,'packages/e-pi-adapter/extensions/e-pi-adapter.ts')};}
  }
  send({type:'collaboration-status',collaboration:collaborationStatus});
  const env={...process.env,E_AGENT_BOOTSTRAP_FD:'3',E_PI_ADAPTER_CAPABILITY_TTL_MS:'15000'};
  for(const key of Object.keys(env))if(key.startsWith('ORCA_')||key.startsWith('CANVAS_')||['PORT','API_PORT','ADE_ROOT','PI_SESSION_ID','PI_SESSION_FILE','PI_MODEL','PI_PROVIDER','PI_REASONING_LEVEL'].includes(key)||key.startsWith('E_CORE_')||key.startsWith('E_AGENT_')&&key!=='E_AGENT_BOOTSTRAP_FD')delete env[key];
  if(canvasPair)env.CANVAS_TOOL_FD='7';
  const args=['--mode','rpc',...(input.provider?['--provider',input.provider]:[]),...(input.model?['--model',input.model]:[]),...(input.thinkingLevel?['--thinking',input.thinkingLevel]:[]),
    ...(resumeFile?['--session',resumeFile]:['--session-id',nativeSessionId]),'--session-dir',sessionDir,'--name','Agent Canvas Pi',
    '--no-extensions','--no-prompt-templates','--no-skills','--approve','-e',extensions.adapter,...(extensions.extension?['-e',extensions.extension,'--skill',pkg.skillPath]:[])];
  const journalFd=fs.openSync(path.join(input.dir,'control-journal.jsonl'),fs.constants.O_CREAT|fs.constants.O_RDWR|fs.constants.O_APPEND,0o600);
  const pi=startChild(input.piBin,args,{cwd:input.cwd,env,stdio:['pipe','pipe','pipe','pipe',ingestPair.client,controlPair.client,journalFd,canvasPair?.client??'ignore']});
  piProcess=pi;canvasPair?.client.destroy();
  pi.stderr.pipe(log(path.join(generationDir,'pi.stderr.log')));
  readLines(pi.stdout,event=>{
    const nextRecovery=recoveryEvent(modelRecovery,event);
    if(nextRecovery!==modelRecovery){modelRecovery=nextRecovery;send({type:'model-recovery',nativeSessionId,recovery:modelRecovery??null});}
    if(event.type==='extension_error')piError=String(event.error);
    if(event.type==='response'&&pendingPi.has(event.id)){const cb=pendingPi.get(event.id);pendingPi.delete(event.id);cb(event);}
  });
  pi.stdio[3].end(JSON.stringify({version:1,generation,ingestFd:4,controlFd:5,controlJournalFd:6})+'\n');fs.closeSync(journalFd);
  for(const socket of [rpcPair.inherited,ingestPair.inherited,ingestPair.client,controlPair.inherited,controlPair.client])socket.destroy();
  client=CoreSocketClient.fromConnectedSocket(rpcPair.client);await client.connect();
  const statePromise=new Promise((resolve,reject)=>{const id=`state:${randomUUID()}`;const query=()=>pi.stdin.write(JSON.stringify({id,type:'get_state'})+'\n');const retry=setInterval(query,1000);const timer=setTimeout(()=>{clearInterval(retry);pendingPi.delete(id);reject(new Error('Pi get_state timeout'));},45000);pendingPi.set(id,response=>{clearTimeout(timer);clearInterval(retry);response.success===false?reject(new Error(response.error)):resolve(response.data);});query();});
  const state=await statePromise;
  if(state.sessionId!==nativeSessionId)throw new Error('Pi native session identity mismatch');
  if(state.model){ref.provider=state.model.provider;ref.model=state.model.id;}
  const deadline=Date.now()+90000;
  for(;;){
    if(piError)throw new Error(`Pi extension failed: ${piError}`);
    const sessions=await client.agentSessionList();const session=sessions.find(s=>s.id===agentSessionId);
    if(session?.status==='idle'&&session.capabilities.some(c=>c.name==='send.user-message'&&c.available))break;
    if(Date.now()>deadline)throw new Error('Pi event/capability startup timeout');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  client.on('agentSession.changed',event=>{if(event.agentSessionId===agentSessionId&&typeof event.eventId==='string'&&event.eventId.startsWith('action.applied:'))actionEvidence.add(event.eventId);});
  bridge=new OrcaAgentSessionBridge(new CoreAgentSessionTransport(client));
  bridge.on('changed',schedulePublish);bridge.on('bridgeError',error=>send({type:'degraded',error:error.message}));
  await bridge.subscribe(agentSessionId);initialized=true;
  acceptConfiguration(await readConfiguration(rpc,nativeSessionId));
  if(collaborationChannel)collaborationStatus=await collaborationChannel.ready;
  send({type:'ready',collaboration:collaborationStatus,snapshot:bridge.state.sessions[agentSessionId],ref,configuration:runtimeConfiguration});
  refreshTimer=setInterval(()=>{if(!closing&&!exclusive)void locked(async()=>{acceptConfiguration(await readConfiguration(rpc,nativeSessionId));send({type:'configuration',configuration:runtimeConfiguration});}).catch(()=>{});},15000);
}
async function control(operation,payload){
  if(!initialized||closing)throw new Error('session not ready');
  if(operation!=='messages')return controlSession(bridge,ref.agentSessionId,operation,payload);
  return locked(async()=>{
    const state=await rpc('get_state');
    if(state.sessionId!==ref.nativeSessionId)throw new Error('native identity mismatch');
    if(!payload.deliverAs||payload.deliverAs==='nextTurn')await assertIdle(rpc,ref.nativeSessionId);
    const message=validateMessage(payload.content??'',payload.attachments??[],state.model?.input?.includes('image')??false);
    if(message.attachments.some(a=>a.mimeType!=='text/plain')){imageProcessor??=await loadPiImageProcessor(piBin);await assertImagesUnchanged(message.attachments,state.model,imageProcessor);}
    sentIntents.add(payload.intentId);
    return controlSession(bridge,ref.agentSessionId,operation,{...payload,content:messageBlocks(message.content,message.attachments)});
  });
}

let initStarted=false;
process.on('message',message=>{
  if(!message||typeof message!=='object'||Buffer.byteLength(JSON.stringify(message))>12*1024*1024){send({type:'fatal',error:'invalid IPC request'});void close(1);return;}
  if(message.type==='init'&&!initStarted){initStarted=true;void init(message.config).catch(error=>{send({type:'fatal',error:error.message});void close(1);});return;}
  if(message.type==='collaboration-result'){collaborationChannel?.deliver(message.response);return;}
  if(message.type==='stop'){void close();return;}
  if(message.type==='configuration'){
    void locked(async()=>{if(!initialized||closing)throw new Error('session not ready');return acceptConfiguration(message.change?await changeConfiguration(rpc,bridge,client,ref,message.change):await readConfiguration(rpc,ref.nativeSessionId));}).then(result=>send({type:'response',id:message.id,result}),error=>send({type:'response',id:message.id,error:error.message}));return;
  }
  if(message.type==='control'&&['messages','abort','approval'].includes(message.operation)){
    void control(message.operation,message.payload).then(result=>send({type:'response',id:message.id,result}),error=>send({type:'response',id:message.id,error:error.message}));
  }
});
if(!process.send)throw new Error('e-runtime-worker requires private parent IPC');
