import {test,expect} from '@playwright/test';
import {setup,session,input} from './fixtures/desktop';
function recoveredHistory(){const s=session();s.lifecycle='interrupted';s.configuration=undefined;s.ref.provider='fixture';s.ref.model='previous-model';return s;}

test('legacy interrupted history is neutral and compact, with explicit historical model and no auto action',async({page},info)=>{
 await page.setViewportSize({width:1280,height:1000});const writes:string[]=[];page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')writes.push(r.url());});const h=await setup(page,false,recoveredHistory());await page.keyboard.press('Escape');const card=page.locator('.react-flow__node[data-id="a"]');
 await expect(card.locator('.session-status')).toHaveAttribute('data-tone','muted');await expect(card.locator('.session-status-important')).toHaveText('待恢复');await expect(card.locator('[data-notice=recovery]')).toHaveCount(0);await expect(card.locator('[data-node-shell-header]').getByRole('button',{name:'恢复会话',exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'执行配置',exact:true})).not.toHaveAttribute('title');await expect(card.getByRole('button',{name:'执行配置',exact:true})).toContainText('上次');await expect(card.getByRole('button',{name:'上下文用量',exact:true})).toHaveCount(0);await expect(card.getByRole('button',{name:'存入待发',exact:true})).toBeDisabled();
 const geometry=await card.evaluate(el=>({notice:el.querySelector('.chat-session-notice')?.getBoundingClientRect().height??0,composer:el.querySelector('.chat-composer')!.getBoundingClientRect().height}));expect(geometry.notice).toBeLessThanOrEqual(66);expect(geometry.composer).toBeLessThanOrEqual(132);for(const theme of ['light','dark']){await page.getByLabel('主题配色').selectOption(theme);await card.screenshot({path:info.outputPath(`recovery-card-${theme}.png`)});}await info.attach('geometry.json',{body:JSON.stringify(geometry),contentType:'application/json'});
 await card.getByRole('button',{name:'执行配置',exact:true}).click();const menu=page.getByRole('dialog',{name:'执行配置',exact:true});await expect(menu).toContainText('上次使用：fixture/previous-model');await expect(menu).toContainText('恢复会话后读取');await expect(menu.getByRole('combobox')).toHaveCount(0);await expect(page.locator('[data-session-status]:visible')).not.toContainText('%');await page.keyboard.press('Escape');await card.getByRole('button',{name:'进入专注'}).click();await page.screenshot({path:info.outputPath('recovery-focus.png')});expect(writes).toEqual([]);expect(h.calls).toEqual([]);
});

test('paused draft submission stores without authorizing, never sends or resumes even after reconnect',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')writes.push(r.url());});const h=await setup(page,false,recoveredHistory());await input(page).fill('留待稍后执行');await expect(page.locator('.chat-composer-hint')).toContainText('仅保存到暂停队列');await expect(page.getByRole('button',{name:'存入待发',exact:true})).toHaveAttribute('title',/明确恢复待发/);await input(page).press('Enter');await expect(input(page)).toHaveValue('');expect(h.calls).toHaveLength(1);expect(h.calls[0].operation).toBe('queue');expect(h.calls[0].body).toMatchObject({operation:'add',content:'留待稍后执行',authorize:false});expect(h.s.queue!.paused).toBe(true);await page.reload();await page.getByRole('button',{name:'进入专注'}).click();await expect(page.getByRole('region',{name:'Canvas 待发队列'})).toContainText('已暂停');expect(writes).toHaveLength(1);expect(writes.every(u=>u.endsWith('/queue'))).toBe(true);
});

test('real failures retain danger and diagnostics; historical running snapshot has no interrupt control',async({page},info)=>{
 const s=recoveredHistory();s.snapshot!.runs=[{id:'old',state:'running'}];const h=await setup(page,false,s);await expect(page.getByRole('button',{name:'中断当前轮',exact:true})).toHaveCount(0);await expect(page.locator('[data-notice=recovery]')).toHaveCount(0);await expect(page.getByRole('button',{name:'恢复会话',exact:true})).toBeVisible();s.error='runtime worker exited';h.publish();await expect(page.locator('[data-notice=runtime]')).toHaveClass(/tone-danger/);await expect(page.locator('[data-focus-overlay] .session-status')).toHaveAttribute('data-tone','danger');await page.locator('[data-notice=runtime]').getByRole('button',{name:'查看诊断'}).click();await expect(page.getByRole('dialog',{name:'会话诊断',exact:true})).toContainText('runtime worker exited');await page.keyboard.press('Escape');await page.screenshot({path:info.outputPath('actual-fault.png')});s.error=undefined;s.snapshot!.degradedReasons=['adapter unavailable'];h.publish();await expect(page.locator('[data-notice=runtime]')).toBeVisible();
});

test('ready readback replaces historical summary without losing draft, paused queue or full-window DOM',async({page})=>{
 const s=recoveredHistory();const h=await setup(page,false,s);await input(page).fill('恢复期间保留的草稿');const el=await input(page).elementHandle();await page.getByRole('button',{name:'铺满视口'}).click();await page.setViewportSize({width:390,height:844});await expect(page.locator('.chat-history-prefix')).toBeVisible();await expect(input(page)).toHaveValue('恢复期间保留的草稿');expect(await page.locator('.chat-composer').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 s.lifecycle='starting';h.publish();await expect(page.locator('[data-notice=starting]')).toBeVisible();await expect(page.getByRole('button',{name:'发送',exact:true})).toBeDisabled();s.lifecycle='ready';s.configuration=session().configuration;h.publish();await expect(page.locator('[data-notice=recovery]')).toHaveCount(0);await expect(page.getByRole('button',{name:'执行配置',exact:true})).toContainText('vision');await expect(page.locator('.chat-history-prefix')).toHaveCount(0);await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();await expect(input(page)).toHaveValue('恢复期间保留的草稿');expect(await el!.evaluate(el=>el===document.querySelector('[data-focus-overlay] textarea'))).toBe(true);expect(s.queue!.paused).toBe(true);expect(h.calls).toEqual([]);
});


test('model fetch failure is labelled as network failure without hiding raw diagnosis',async({page})=>{
 const s=session();s.snapshot!.messages.push({id:'network-error',role:'assistant',state:'completed',order:3,error:'TypeError: fetch failed',blocks:[]});const h=await setup(page,false,s);
 await expect(page.locator('[data-focus-overlay] [data-session-status]')).toHaveAttribute('aria-label',/上次模型网络请求失败/);await expect(page.locator('[data-focus-overlay] .session-status')).toHaveAttribute('data-tone','danger');const notice=page.locator('.chat-error').last();await expect(notice).toContainText('模型网络请求失败');await notice.getByRole('button',{name:'查看脱敏详情'}).click();await expect(notice).toContainText('fetch failed');expect(h.calls).toEqual([]);
});


test('session archive hides the card, restores from toolbar and delete requires confirmation',async({page},info)=>{
 const s=session();s.sessionLifecycleVersion=2;const archived=structuredClone(s);archived.lifecycle='stopped';archived.archivedAt='2026-01-02T00:00:00Z';archived.queue={...s.queue!,paused:true,reason:'会话停止或归档，需明确恢复待发'};let archivedItems=[];let deleteCalls=0;
 const h=await setup(page,false,s);
 await page.route('**/api/workspaces/desktop/nodes/a/archive',route=>{archived.version=++s.version;archivedItems=[archived];h.publishLifecycle(archived);return route.fulfill({json:{session:archived}});});
 await page.route('**/api/workspaces/desktop/sessions?view=archived',route=>route.fulfill({json:{sessions:archivedItems}}));
 await page.route('**/api/workspaces/desktop/nodes/a/resume',route=>{s.version++;archivedItems=[];h.publishLifecycle(s);return route.fulfill({json:{session:s}});});
 await page.route('**/api/workspaces/desktop/nodes/a/session',route=>{if(route.request().method()==='DELETE'){deleteCalls++;archivedItems=[];return route.fulfill({json:{ok:true}});}return route.fallback();});
 const card=page.locator('.react-flow__node[data-id="a"]');await page.getByRole('dialog',{name:/专注模式/}).getByRole('button',{name:'会话操作',exact:true}).click();await page.getByRole('button',{name:'归档会话',exact:true}).click();await page.getByRole('button',{name:'确认归档',exact:true}).click();await expect(card).toHaveCount(0);
 await page.getByRole('button',{name:'已归档会话',exact:true}).click();let popover=page.getByRole('dialog',{name:'已归档会话',exact:true});await expect(popover.locator('[data-archived-session="a"]')).toContainText('验收 Agent');await page.screenshot({path:info.outputPath('archived-sessions.png')});await popover.getByRole('button',{name:'恢复',exact:true}).click();await expect(card).toHaveCount(1);await expect(popover).toContainText('没有已归档会话');
 await card.getByRole('button',{name:'会话操作',exact:true}).click();await page.getByRole('button',{name:'归档会话',exact:true}).click();await page.getByRole('button',{name:'确认归档',exact:true}).click();await expect(card).toHaveCount(0);
 await page.getByRole('button',{name:'已归档会话',exact:true}).click();popover=page.getByRole('dialog',{name:'已归档会话',exact:true});await popover.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();expect(deleteCalls).toBe(0);await expect(popover.locator('[data-archived-session="a"]')).toBeVisible();
 await popover.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(popover).toContainText('没有已归档会话');expect(deleteCalls).toBe(1);await expect(card).toHaveCount(0);expect(h.calls).toEqual([]);
});

test('archive controls stay hidden until the running API reports lifecycle actions v2',async({page})=>{
 const s=session();const h=await setup(page,false,s);await expect(page.getByRole('button',{name:'已归档会话',exact:true})).toHaveCount(0);await page.getByRole('dialog',{name:/专注模式/}).getByRole('button',{name:'会话操作',exact:true}).click();await expect(page.getByRole('button',{name:'归档会话',exact:true})).toHaveCount(0);expect(h.calls).toEqual([]);
});

test('failed archived restore retains its error after refreshing the list',async({page})=>{
 const s=session();s.sessionLifecycleVersion=2;await setup(page,false,s);
 const archived={...s,nodeId:'archived',lifecycle:'stopped',archivedAt:'2026-01-02'};
 await page.route('**/api/workspaces/desktop/sessions?view=archived',route=>route.fulfill({json:{sessions:[archived]}}));
 await page.route('**/api/workspaces/desktop/nodes/archived/resume',route=>route.fulfill({status:503,json:{error:'live session limit reached'}}));
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'已归档会话',exact:true}).click();
 const popover=page.getByRole('dialog',{name:'已归档会话',exact:true});
 await popover.getByRole('button',{name:'恢复',exact:true}).click();
 await expect(popover.getByRole('alert')).toHaveText('live session limit reached');
 await expect(popover.locator('[data-archived-session="archived"]')).toBeVisible();
 await expect(popover.getByRole('button',{name:'恢复',exact:true})).toBeEnabled();
});
