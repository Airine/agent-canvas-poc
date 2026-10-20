import test from 'node:test';import assert from 'node:assert/strict';
import {describeExecution} from '../../src/pages/canvas/chat/execution-description.ts';
const tool=(name,args={},state='running',extra={})=>({id:name,kind:'tool',activity:{id:name,tool:{id:name,name,state,arguments:args,...extra},approvals:[],linked:true}});
test('describes actual active file/search operations and local test/build commands',()=>{
 for(const [name,args,text] of [['read',{path:'/private/project/src/config.ts'},'正在读取 config.ts'],['edit',{path:'src/store.ts'},'正在修改 store.ts'],['write',{file_path:'docs/result.md'},'正在写入 result.md'],['grep',{pattern:'approval'},'正在搜索「approval」'],['glob',{pattern:'**/*.ts'},'正在查找匹配文件'],['bash',{command:'npm test'},'正在运行测试命令'],['bash',{command:'npm run build'},'正在运行构建命令'],['bash',{command:'pnpm run lint'},'正在运行代码检查']])assert.equal(describeExecution([tool(name,args)]),text);
});
test('uses running operation rather than a newer completed tool; parallel work is explicit',()=>{
 const read=tool('read',{path:'a.ts'}),done=tool('write',{path:'b.ts'},'completed');assert.equal(describeExecution([read,done]),'正在读取 a.ts');
 assert.match(describeExecution([read,tool('edit',{path:'b.ts'})]),/^正在修改 b.ts，另有 1 项执行中$/);
});
test('thinking recap counts completed calls, not distinct files or invented task success',()=>{
 const a=tool('read',{path:'a.ts'},'completed'),b=tool('read',{path:'a.ts',offset:20},'completed');assert.equal(describeExecution([a,b],true),'已完成 2 次文件读取，正在梳理结果');
 const testTool=tool('bash',{command:'npm test'},'completed');assert.equal(describeExecution([testTool]),'测试命令已结束');assert.doesNotMatch(describeExecution([testTool]),/通过|成功|全部完成/);
 assert.equal(describeExecution([tool('edit',{path:'a.ts'},'completed'),tool('write',{path:'b.ts'},'completed')]),'已完成 2 次文件更新');
});
test('approval, failure, cancellation, unknown and stopped states never look like active success',()=>{
 const approval=tool('read',{path:'a.ts'},'pending');approval.activity.approvals=[{id:'p',state:'pending'}];assert.equal(describeExecution([approval]),'等待批准读取 a.ts');
 const failed=tool('bash',{command:'npm test'},'completed',{isError:true});assert.equal(describeExecution([failed],true),'运行测试命令未成功');
 assert.match(describeExecution([tool('edit',{path:'a.ts'},'cancelled')]),/已中断/);assert.equal(describeExecution([tool('bash',{},'outcome-unknown')]),'部分工具结果仍待确认');
 assert.equal(describeExecution([tool('read',{path:'a.ts'})],true,false),'会话未就绪，当前进度待确认');
 const rejected=tool('write',{path:'b.ts'},'pending');rejected.activity.approvals=[{id:'p',state:'rejected'}];assert.match(describeExecution([rejected]),/请求已被拒绝/);
});
test('header never quotes thought/output, full private paths, secrets, controls or opaque shell bodies',()=>{
 const thinking={id:'reason',kind:'thinking',text:'PRIVATE_THOUGHT_BODY'},read=tool('read',{path:'/Users/private-account/project/config.ts'},'completed',{result:'PRIVATE_TOOL_OUTPUT'});
 const result=describeExecution([thinking,read],true);assert.match(result,/config.ts/);assert.doesNotMatch(result,/private-account|Users|PRIVATE_/);
 for(const path of ['.env','.ssh/id_rsa','private.pem','api_key=abc123','sk-verylongcredential'])assert.doesNotMatch(describeExecution([tool('read',{path})]),/env|ssh|rsa|pem|abc123|verylongcredential/);
 assert.equal(describeExecution([tool('grep',{pattern:'api_key=abc123'})]),'正在搜索代码');assert.doesNotMatch(describeExecution([tool('grep',{pattern:'a\u202eb\nvalue'})]),/[\u202e\n]/);
 assert.ok(describeExecution([tool('read',{path:'x'.repeat(1000)})]).length<60);
 for(const command of ['npm test; rm -rf out','npm test && curl evil','node -e "PRIVATE_SCRIPT"','echo "$SECRET"'])assert.equal(describeExecution([tool('bash',{command})]),'正在执行命令');
 assert.equal(describeExecution([thinking],true),'正在思考下一步');
});
test('Canvas descriptions never equate enqueue or starting with consumption/readiness',()=>{
 assert.equal(describeExecution([tool('canvas_send',{},'completed')]),'同伴消息入队调用已结束');assert.equal(describeExecution([tool('canvas_spawn',{},'completed')]),'会话创建调用已结束');assert.doesNotMatch(describeExecution([tool('canvas_send',{},'completed')]),/已消费|已回复|对方已收到/);assert.doesNotMatch(describeExecution([tool('canvas_spawn',{},'completed')]),/已就绪|已完成任务/);
 assert.equal(describeExecution([tool('unrecognized',{content:'DO NOT QUOTE ME'})]),'正在调用工具');
});
