import {test,expect} from '@playwright/test';
import {setup,session,focus} from './fixtures/desktop';

function blocked(){
 const s=session();s.queueReviewVersion=1;
 s.queue={revision:4,paused:true,reason:'API 重启，需明确恢复待发',items:[
  {id:'unknown',intentId:'queue:unknown',actionId:'action:old',content:'旧消息，不得重发',attachments:[],state:'unknown',error:'adapter control timeout; outcome unknown',createdAt:'2026-01-01'},
  {id:'next',intentId:'queue:next',content:'等待另行授权',attachments:[],state:'pending',createdAt:'2026-01-01'},
 ]};return s;
}
const status=(page:import('@playwright/test').Page)=>page.locator('[data-focus-overlay] [data-session-status="a"]');

test('manual review separates lifecycle, requires evidence and consent, keeps audit and never sends',async({page},info)=>{
 const s=blocked(),h=await setup(page,false,s);
 await expect(page.locator('[data-focus-overlay] iframe[title^="PI Desktop"]')).toHaveCount(1);
 await status(page).click();
 await expect(status(page)).toContainText('会话已就绪');await expect(status(page)).toContainText('队列待核实');
 const queue=page.getByRole('region',{name:'Canvas 待发队列'});await expect(queue.getByRole('button',{name:'恢复待发',exact:true})).toBeDisabled();
 await queue.getByRole('button',{name:'核实未知消息',exact:true}).click();
 await queue.getByRole('button',{name:'人工核实并结束跟踪'}).click();
 let dialog=page.getByRole('alertdialog',{name:'核实未知消息'}),confirm=dialog.getByRole('button',{name:'保存核实记录并结束跟踪'});
 await expect(confirm).toBeDisabled();await dialog.getByRole('button',{name:'取消',exact:true}).click();expect(h.calls).toEqual([]);
 await queue.getByRole('button',{name:'人工核实并结束跟踪'}).click();dialog=page.getByRole('alertdialog',{name:'核实未知消息'});confirm=dialog.getByRole('button',{name:'保存核实记录并结束跟踪'});
 await dialog.getByLabel('核实记录',{exact:true}).fill('已检查历史和工具结果，保留未知结果，不再跟踪这条消息。');
 await expect(confirm).toBeDisabled();await dialog.getByRole('checkbox').check();
 await page.setViewportSize({width:390,height:844});
 expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:info.outputPath('queue-review-confirm-narrow.png')});
 await confirm.click();await expect(dialog).toHaveCount(0);
 await expect(status(page)).toContainText('会话已就绪');await expect(status(page)).toContainText('队列已暂停');
 await expect(queue).toContainText('等待另行授权');
 await expect(queue.getByRole('button',{name:'恢复待发',exact:true})).toBeEnabled();
 expect(h.calls.map(c=>c.operation)).toEqual(['queue']);expect(h.calls[0].body.operation).toBe('reviewUnknown');
 expect(s.queue!.paused).toBe(true);expect(s.queue!.items[0].state).toBe('dismissed');expect(s.queue!.items[0].consumedAt).toBeUndefined();expect(s.queue!.items[1].state).toBe('pending');
 const details=page.getByRole('dialog',{name:'会话状态与上下文'});await details.getByText('人工处理记录 · 1',{exact:true}).click();
 await expect(details.locator('[data-queue-review="unknown"]')).toContainText('原结果：未知');await expect(details).toContainText('已检查历史和工具结果');
 await expect(details).not.toContainText('已确认消费 1');await page.screenshot({path:info.outputPath('queue-review-audit.png')});
 await page.reload();await focus(page);await expect(status(page)).toContainText('队列已暂停');expect(h.calls).toHaveLength(1);
});

test('stale review must be reopened; server failure retains note and never clears unknown',async({page})=>{
 const s=blocked(),h=await setup(page,false,s);await status(page).click();await page.getByRole('button',{name:'核实未知消息',exact:true}).click();await page.getByRole('button',{name:'人工核实并结束跟踪'}).click();
 let dialog=page.getByRole('alertdialog',{name:'核实未知消息'});
 await dialog.getByLabel('核实记录',{exact:true}).fill('核实证据');await dialog.getByRole('checkbox').check();
 s.queue!.revision++;h.publish();await expect(dialog.getByRole('button',{name:'保存核实记录并结束跟踪'})).toBeDisabled();await expect(dialog).toContainText('队列版本已改变');
 await dialog.getByRole('button',{name:'取消',exact:true}).click();expect(h.calls).toEqual([]);
 await page.getByRole('button',{name:'人工核实并结束跟踪'}).click();dialog=page.getByRole('alertdialog',{name:'核实未知消息'});
 await dialog.getByLabel('核实记录',{exact:true}).fill('再次核实证据');await dialog.getByRole('checkbox').check();
 await page.route('**/api/workspaces/desktop/nodes/a/queue',route=>route.fulfill({status:409,json:{error:'仍有派发进行中'}}));
 await dialog.getByRole('button',{name:'保存核实记录并结束跟踪'}).click();
 await expect(dialog.getByRole('alert')).toContainText('仍有派发进行中');await expect(dialog.getByLabel('核实记录',{exact:true})).toHaveValue('再次核实证据');
 expect(s.queue!.items[0].state).toBe('unknown');expect(s.queue!.items[0].review).toBeUndefined();
});

test('old API and active run cannot offer an actionable review',async({page})=>{
 const s=blocked();delete s.queueReviewVersion;const h=await setup(page,false,s);await status(page).click();
 await page.getByRole('button',{name:'核实未知消息',exact:true}).click();
 await expect(page.getByRole('button',{name:'人工核实并结束跟踪'})).toHaveCount(0);await expect(page.getByRole('region',{name:'Canvas 待发队列'})).toContainText('当前 API 尚未支持人工核实');
 s.queueReviewVersion=1;s.snapshot!.runs=[{id:'r',state:'running'}];h.publish();
 await expect(page.getByRole('button',{name:'人工核实并结束跟踪'})).toBeDisabled();expect(h.calls).toEqual([]);
});
