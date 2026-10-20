import {stopSession,openSessionMenu} from './ui-actions';
import { test, expect } from '@playwright/test';

// Opt-in only: this test calls the user's current Pi model. It never changes
// provider defaults, injects keys, or uses a fixture as model-response evidence.
test('real Pi responds inside the main canvas and resumes the same native session', async ({page}) => {
 test.skip(process.env.CANVAS_REAL_E2E !== '1', 'Set CANVAS_REAL_E2E=1 and CANVAS_TEST_URL for a running real e instance');
 test.setTimeout(240000);
 const marker=`CANVAS_REAL_${Date.now()}`;
 await page.goto('/');
 await page.getByLabel('画布名称').fill(`真实验证 ${marker}`);
 await page.getByRole('button',{name:'创建并打开画布'}).click({timeout:30000});
 await page.waitForURL('**/canvas/**',{timeout:120000});
 const wid=new URL(page.url()).pathname.split('/').at(-1)!;
 const input=page.getByLabel('发送给真实 Agent 的消息');
 await input.fill(`请勿调用任何工具。请记住标记 ${marker}，本次只回复这个标记。`);
 await page.getByRole('button',{name:'发送',exact:true}).click();
 await expect(page.getByTestId('message-assistant').filter({hasText:marker})).toHaveCount(1,{timeout:90000});
 await expect(page.locator('[data-session-status]:visible')).toHaveAttribute('aria-label',/可继续对话/,{timeout:30000});
 await input.fill('请勿调用工具，只回复上一条消息让我记住的标记。');
 await page.getByRole('button',{name:'发送',exact:true}).click();
 await expect(page.getByTestId('message-assistant').filter({hasText:marker})).toHaveCount(2,{timeout:90000});
 await page.reload();await expect(page.getByTestId('message-assistant').filter({hasText:marker})).toHaveCount(2);
 const w=await (await page.request.get(`/api/workspaces/${wid}`)).json();const nid=w.graph.nodes[0].id;
 const before=await (await page.request.get(`/api/workspaces/${wid}/nodes/${nid}/session`)).json();
 expect(before.session.snapshot.pendingActions.filter((a:{state:string})=>a.state==='applied').length).toBeGreaterThanOrEqual(2);
 await expect(page.locator('[data-session-status]:visible')).toHaveAttribute('aria-label',/可继续对话/,{timeout:30000});
 await stopSession(page);
 await page.getByRole('button',{name:'恢复会话',exact:true}).click();
 await expect(page.locator('[data-session-status]:visible')).toHaveAttribute('aria-label',/可继续对话/,{timeout:120000});await openSessionMenu(page);await expect(page.getByRole('button',{name:'停止会话',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 const after=await (await page.request.get(`/api/workspaces/${wid}/nodes/${nid}/session`)).json();
 expect(after.session.ref.nativeSessionId).toBe(before.session.ref.nativeSessionId);
 await stopSession(page);
});
