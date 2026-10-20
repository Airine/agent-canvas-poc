import {test,expect} from '@playwright/test';
import {setup,session,input} from './fixtures/desktop';
import type {SessionView} from '../../api/e/contracts';
const at=(index:number)=>new Date(Date.UTC(2026,0,1,12,0,index)).toISOString();
function addStep(s:SessionView,index:number,state='completed'){
 const id=`tool-${index}`,name=index%3===0?'bash':'read';
 const args=name==='bash'?{command:`printf 'fixture ${index}'`}:{path:`src/module-${index}.ts`};
 s.snapshot!.messages.push({id:`step-${index}`,role:'assistant',order:index+1,runId:'r',turnId:`internal-${index}`,createdAt:at(index+1),state:'completed',blocks:[{type:'text',text:' \n '},{type:'tool-call',toolCallId:id,name,arguments:args}]});
 s.snapshot!.tools.push({id,name,state,runId:'r',turnId:`internal-${index}`,parentMessageId:`step-${index}`,arguments:args,result:`fixture output ${index}`,createdAt:at(index+1),updatedAt:at(index+2)});
}
function chain(count=8,answer=true){
 const s=session();s.snapshot!.messages=[{id:'user',role:'user',state:'completed',order:0,createdAt:at(0),blocks:[{type:'text',text:'检查项目结构，给我一个简短总结。'}],origin:{kind:'human',label:'Canvas 输入',channel:'canvas',authenticated:true}}];
 s.snapshot!.tools=[];for(let i=0;i<count;i++)addStep(s,i);
 if(answer)s.snapshot!.messages.push({id:'answer',role:'assistant',state:'completed',order:count+2,runId:'r',turnId:'answer-turn',createdAt:at(count+3),blocks:[{type:'text',text:'已检查项目结构。\n\n入口、展示层与测试目录已经区分，具体读取与命令记录可在上方执行过程中按需查看。'}]});
 s.snapshot!.capabilities.push({name:'approval.resolve',available:true,authority:'authoritative'});return s;
}

test('tool-only internal turns form one compact hierarchy without repeated timestamps or eager outputs',async({page},info)=>{
 await page.setViewportSize({width:1440,height:1000});const s=chain();s.snapshot!.approvals=[{id:'approved',toolCallId:'tool-0',kind:'bash',state:'approved'}];const h=await setup(page,false,s);
 const group=page.locator('[data-execution-group]'),entry=page.locator('.chat-turn-process');await expect(group).toHaveCount(1);await expect(entry).toHaveCount(1);await expect(page.locator('[data-entry-id]')).toHaveCount(3);
 await expect(group).toContainText('8 个工具');await expect(group.locator('.chat-execution-description')).toContainText('最近已查看 module-7.ts');await expect(entry.locator('.chat-turn-footer,time')).toHaveCount(0);await expect(group.locator('[data-tool-id]')).toHaveCount(0);expect((await entry.boundingBox())!.height).toBeLessThanOrEqual(56);
 await input(page).fill('保留当前草稿');const original=await input(page).elementHandle();await page.screenshot({path:info.outputPath('collapsed-desktop.png')});
 const trigger=group.getByRole('button',{name:/执行过程/});await trigger.focus();await page.keyboard.press('Enter');await expect(group.locator('[data-tool-id]')).toHaveCount(8);await expect(group.locator('.chat-output')).toHaveCount(0);await expect(group.getByText('已批准',{exact:true})).toHaveCount(0);
 const first=group.locator('[data-tool-id="tool-0"]');await first.getByRole('button').click();await expect(first).toContainText('fixture output 0');await expect(first).toContainText('已批准');await expect(first).toContainText('请求时间');await page.screenshot({path:info.outputPath('expanded-desktop.png')});
 await trigger.click();await expect(group.locator('[data-tool-id]')).toHaveCount(0);await page.keyboard.press('Escape');await page.getByRole('button',{name:'进入专注',exact:true}).click();await expect(input(page)).toHaveValue('保留当前草稿');expect(await original!.evaluate(el=>el===document.querySelector('[data-focus-overlay] textarea'))).toBe(true);expect(h.calls).toEqual([]);
});

test('long running chains keep an opened tool stable while new steps arrive and stay bounded',async({page})=>{
 const s=chain(45,false);const h=await setup(page,true,s);const group=page.locator('[data-execution-group]');await group.getByRole('button',{name:/执行过程/}).click();await expect(group.locator('[data-tool-id]')).toHaveCount(20);await expect(group.getByRole('button',{name:'显示更早步骤（还有 25 项）'})).toBeVisible();
 const reading=group.locator('[data-tool-id="tool-25"]');await reading.getByRole('button').click();const handle=await reading.elementHandle();await expect(reading).toContainText('fixture output 25');
 addStep(s,45,'running');h.publish();await expect(group).toContainText('46 个工具');await expect(group.locator('.chat-execution-description')).toContainText('正在执行命令');await expect(group.locator('[data-tool-id]')).toHaveCount(20);await expect(reading).toContainText('fixture output 25');expect(await handle!.evaluate(el=>el.isConnected)).toBe(true);await expect(group.getByRole('button',{name:'查看新增步骤（1 项）'})).toBeVisible();
 await group.getByRole('button',{name:/显示更早步骤/}).click();await expect(group.locator('[data-tool-id]')).toHaveCount(40);await group.getByRole('button',{name:/查看新增步骤/}).click();await expect(group.locator('[data-tool-id="tool-45"]')).toContainText('执行中');
 await group.getByRole('button',{name:/执行过程/}).click();addStep(s,46,'running');h.publish();await expect(group.getByRole('button',{name:/执行过程/})).toHaveAttribute('aria-expanded','false');await expect(group.locator('[data-tool-id]')).toHaveCount(0);expect(h.calls).toEqual([]);
});

test('collapsed failure and pending approval stay visible and usable at 390px',async({page},info)=>{
 const s=chain(6,false);s.snapshot!.tools[0].isError=true;s.snapshot!.approvals=[{id:'pending',toolCallId:'tool-5',toolName:'read',kind:'read',state:'pending'}];const h=await setup(page,true,s);await page.getByRole('button',{name:'铺满视口'}).click();await page.setViewportSize({width:390,height:844});
 const group=page.locator('[data-execution-group]');await expect(group).toContainText('1 个工具失败');await expect(group.getByRole('button',{name:/执行过程/})).toHaveAttribute('aria-expanded','false');const card=page.getByTestId('approval-card');await expect(card).toBeVisible();await expect(card.getByRole('button',{name:'批准',exact:true})).toBeEnabled();
 expect(await page.getByRole('log').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);const bounds=(await group.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(391);await page.screenshot({path:info.outputPath('mobile-failure-approval.png')});
 await group.getByRole('button',{name:/执行过程/}).click();await expect(group.locator('[data-tool-id="tool-5"]')).toContainText('等待批准');expect(h.calls).toEqual([]);
});


test('mixed message boundaries collapse the screenshot pattern into two compact execution rows',async({page},info)=>{
 await page.setViewportSize({width:1440,height:1000});const s=chain(24,false);s.snapshot!.tools[3].isError=true;
 const bridge={type:'tool-call',toolCallId:'bridge',name:'bash',arguments:{command:'printf fixture-bridge'}};
 s.snapshot!.messages.push({id:'preamble',role:'assistant',state:'completed',order:25,runId:'r',turnId:'preamble-turn',createdAt:at(25),blocks:[{type:'thinking',text:'Inspect the boundary.'},{type:'text',text:'先检查入口，再调整展示层。'},bridge]});
 s.snapshot!.tools.push({id:'bridge',name:'bash',state:'completed',parentMessageId:'preamble',runId:'r',turnId:'preamble-turn',arguments:bridge.arguments,result:'bridge output'});
 for(let i=24;i<93;i++){addStep(s,i);s.snapshot!.messages.at(-1)!.createdAt=at(i+2);}
 s.snapshot!.tools.find(t=>t.id==='tool-40')!.isError=true;
 const answer={id:'mixed-answer',role:'assistant',state:'running',order:96,runId:'r',turnId:'answer-turn',createdAt:at(96),blocks:[{type:'thinking',text:'Prepare the summary.'}]};s.snapshot!.messages.push(answer);
 const h=await setup(page,true,s),groups=page.locator('[data-execution-group]');await expect(groups).toHaveCount(2);await expect(groups.nth(0)).toContainText('24 个工具');await expect(groups.nth(1)).toContainText('70 个工具');await expect(page.getByRole('button',{name:'思考过程',exact:true})).toHaveCount(0);
 for(const group of await groups.all()){
  const toggle=group.getByRole('button',{name:/执行过程/});await expect(toggle).not.toContainText('段思考');await expect(toggle).not.toContainText('bash');
  expect((await group.boundingBox())!.height).toBeLessThanOrEqual(40);
  const title=(await group.locator('.chat-execution-title').boundingBox())!,state=(await group.locator('.chat-execution-state').boundingBox())!;expect(state.x-title.x).toBeLessThan(280);
 }
 await expect(page.locator('.chat-turn-process .chat-turn-footer')).toHaveCount(0);await groups.nth(1).getByRole('button',{name:/执行过程/}).click();
 const reading=groups.nth(1).locator('[data-tool-id="tool-80"]');await reading.getByRole('button').click();const handle=await reading.elementHandle();await expect(reading).toContainText('fixture output 80');
 answer.blocks.push({type:'text',text:'调整完成。正文与连续执行记录保持各自的阅读层级。'});answer.state='completed';h.publish();await expect(groups).toHaveCount(2);await expect(page.getByText('调整完成。正文与连续执行记录保持各自的阅读层级。',{exact:true})).toBeVisible();expect(await handle!.evaluate(el=>el.isConnected)).toBe(true);await expect(reading).toContainText('fixture output 80');
 await groups.nth(1).getByRole('button',{name:/执行过程/}).click();await page.screenshot({path:info.outputPath('mixed-boundaries-desktop.png')});await page.getByRole('button',{name:'铺满视口'}).click();await page.setViewportSize({width:390,height:844});expect(await page.getByRole('log').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:info.outputPath('mixed-boundaries-mobile.png')});expect(h.calls).toEqual([]);
});

test('splitting prose around a tool preserves one copy action for the complete original reply',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as unknown as {copied:string}).copied=text;}}}));
 const s=chain(1,false),message=s.snapshot!.messages.find(m=>m.id==='step-0')!;message.blocks=[{type:'text',text:'操作前的说明'},...message.blocks.filter(b=>b.type==='tool-call'),{type:'text',text:'操作后的总结'}];await setup(page,false,s);
 await expect(page.getByRole('button',{name:'复制回复',exact:true})).toHaveCount(1);await page.getByRole('button',{name:'复制回复',exact:true}).click();expect(await page.evaluate(()=>(window as unknown as {copied:string}).copied)).toBe('操作前的说明\n操作后的总结');await expect(page.locator('.chat-turn-process time')).toHaveCount(0);
});


test('live activity sentence follows tools and thinking without expanding, writing or losing draft',async({page},info)=>{
 await page.setViewportSize({width:1440,height:1000});const s=chain(0,false);addStep(s,1,'running');const read=s.snapshot!.tools[0],message=s.snapshot!.messages[1];read.arguments={path:'/private/project/src/session-store.ts'};message.blocks=[{type:'thinking',text:'PRIVATE_THOUGHT_NOT_FOR_HEADER'},{type:'tool-call',toolCallId:read.id,name:read.name,arguments:read.arguments}];message.state='running';
 const h=await setup(page,true,s),group=page.locator('[data-execution-group]'),description=group.locator('.chat-execution-description');await input(page).fill('摘要更新时保留草稿');const original=await input(page).elementHandle(),sentence=await description.elementHandle();
 await expect(description).toHaveText('正在读取 session-store.ts');await expect(group).not.toContainText('/private/project');await expect(group).not.toContainText('PRIVATE_THOUGHT');await expect(group.getByRole('button',{name:/执行过程/})).toHaveAttribute('aria-expanded','false');await page.screenshot({path:info.outputPath('activity-reading.png')});
 read.state='completed';h.publish();await expect(description).toHaveText('已查看 session-store.ts，正在梳理结果');await page.screenshot({path:info.outputPath('activity-thinking.png')});
 message.state='completed';addStep(s,2,'running');const edit=s.snapshot!.tools[1],editMessage=s.snapshot!.messages.at(-1)!;edit.name='edit';edit.arguments={path:'src/view.ts'};editMessage.state='running';editMessage.blocks=[{type:'tool-call',toolCallId:edit.id,name:'edit',arguments:edit.arguments}];h.publish();await expect(description).toHaveText('正在修改 view.ts');expect(await sentence!.evaluate(el=>el.isConnected)).toBe(true);
 edit.state='pending';s.snapshot!.approvals=[{id:'p',kind:'edit',toolName:'edit',toolCallId:edit.id,state:'pending'}];h.publish();await expect(description).toHaveText('等待批准修改 view.ts');await expect(page.getByTestId('approval-card')).toBeVisible();await expect(page.getByTestId('approval-card').getByRole('button',{name:'批准',exact:true})).toBeEnabled();
 s.snapshot!.approvals[0].state='approved';edit.state='failed';edit.isError=true;h.publish();await expect(description).toHaveText('修改 view.ts未成功');await expect(group).toContainText('1 个工具失败');
 await page.getByRole('button',{name:'铺满视口'}).click();await page.setViewportSize({width:390,height:844});expect(await page.getByRole('log').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);await expect(description).toHaveAttribute('title','修改 view.ts未成功');await page.screenshot({path:info.outputPath('activity-mobile.png')});
 await expect(input(page)).toHaveValue('摘要更新时保留草稿');expect(await original!.evaluate(el=>el===document.querySelector('[data-focus-overlay] textarea'))).toBe(true);await expect(group.getByRole('button',{name:/执行过程/})).toHaveAttribute('aria-expanded','false');expect(h.calls).toEqual([]);
});
