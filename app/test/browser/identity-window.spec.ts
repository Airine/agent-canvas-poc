import {setCardView} from './ui-actions';
import {openDiagnostics} from './ui-actions';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import type { SessionView } from '../../api/e/contracts';

function session(nodeId: string, title = 'Agent'): SessionView {
  return {
    workspaceId: 'identity', nodeId, title, lifecycle: 'ready', approvalMode: 'manual', version: 1, updatedAt: '2026-01-01',
    ref: { agentSessionId: `as:${nodeId}`, nativeSessionId: `native:${nodeId}`, cwd: '/fixture' },
    snapshot: {
      id: `as:${nodeId}`, nativeSessionId: `native:${nodeId}`, epoch: 'e', revision: 1, seq: 1, nextSeq: 2, status: 'idle',
      messages: Array.from({ length: 40 }, (_, i) => ({ id: `m-${i}`, role: 'assistant', state: 'completed', order: i, runId: `r-${i}`, turnId: `t-${i}`, createdAt: new Date(1700000000000 + i * 1000).toISOString(), blocks: [{ type: 'text', text: `回复 ${i}\n\n${'正文内容。'.repeat(40)}` }] })),
      runs: [], tools: [], approvals: [], pendingActions: [], degradedReasons: [],
      capabilities: [{ name: 'send.user-message', available: true, authority: 'authoritative' }],
    },
  };
}
async function setup(page: Page, views = [session('a'), session('b')]) {
  let socket: WebSocketRoute;
  let generation = 0, sequence = 0;
  const requests: Array<{ title: string; expectedVersion: number }> = [];
  let rejectNext = false;
  const publish = (view: SessionView) => socket.send(JSON.stringify({ type: 'session', session: view, workspaceId: 'identity', generation: String(generation), sequence: ++sequence }));
  await page.route('**/api/**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH' && req.url().endsWith('/session')) {
      const body = req.postDataJSON(); requests.push(body);
      const view = views.find(value => value.nodeId === new URL(req.url()).pathname.split('/').at(-2))!;
      if (rejectNext) { rejectNext = false; view.version++; publish(view); return route.fulfill({ status: 409, json: { session: view } }); }
      if (body.expectedVersion !== view.version) return route.fulfill({ status: 409, json: { session: view } });
      view.title = body.title; view.version++;
      return route.fulfill({ json: { session: view } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.routeWebSocket('**/ws', ws => {
    socket = ws; generation++; sequence = 0;
    ws.onMessage(raw => {
      if (JSON.parse(String(raw)).type !== 'hello') return;
      ws.send(JSON.stringify({ type: 'graph', workspaceId: 'identity', generation: String(generation), sequence: ++sequence, backend: 'e', source: 'live', graph: {
        nodes: views.map((view, i) => ({ id: view.nodeId, title: view.title, type: 'chat', backend: 'e', status: 'waiting', harness: 'pi', env: 'e', agentId: view.ref.agentSessionId, sessionRef: view.ref, x: i * 550, y: 0 })), edges: [], zones: [], runState: 'idle',
      } }));
      views.forEach(publish);
    });
  });
  await page.goto('/canvas/identity');
  await page.getByRole('button', { name: '复位到 100%' }).click();
  return { requests, views, publish: (view: SessionView) => { view.version++; publish(view); }, conflict: () => { rejectNext = true; } };
}
const card = (page: Page, id = 'a') => page.locator(`.react-flow__node[data-id="${id}"]`);
async function focus(page: Page) {
  await setCardView(page,card(page),'detail');
  await card(page).getByRole('button', { name: '进入专注' }).click();
  return page.getByRole('dialog', { name: /专注模式/ });
}

test('nickname saves from compact/detail/focus; sibling suffixes update; conflicts retain draft', async ({ page }) => {
  const h = await setup(page);
  const a = card(page), b = card(page, 'b');
  await setCardView(page,a,'compact');
  await expect(a.locator('.session-discriminator')).toHaveText(/^@/);
  await expect(b.locator('.session-discriminator')).toHaveText(/^@/);
  expect(await a.locator('.session-discriminator').textContent()).not.toBe(await b.locator('.session-discriminator').textContent());
  await a.getByRole('button', { name: /修改 Agent 昵称/ }).click();
  await a.getByLabel('Agent 昵称', { exact: true }).fill('Writer');
  await a.getByRole('button', { name: '保存昵称' }).click();
  await expect(a.locator('.session-nickname')).toHaveText('Writer');
  await expect(b.locator('.session-discriminator')).toHaveCount(0);
  expect(h.requests[0]).toEqual({ title: 'Writer', expectedVersion: 1 });
  await setCardView(page,a,'detail');
  await a.getByRole('button', { name: /修改 Agent 昵称/ }).click();
  await a.getByLabel('Agent 昵称', { exact: true }).fill('Editor');
  await a.getByRole('button', { name: '保存昵称' }).click();
  await expect(a.locator('.session-nickname')).toHaveText('Editor');
  const dialog = await focus(page);
  await dialog.getByRole('button', { name: /修改 Agent 昵称/ }).click();
  await dialog.getByLabel('Agent 昵称', { exact: true }).fill('Reviewer');
  h.conflict();
  await dialog.getByRole('button', { name: '保存昵称' }).click();
  await expect(dialog.getByRole('alert')).toContainText('尚未保存');
  await expect(dialog.getByLabel('Agent 昵称', { exact: true })).toHaveValue('Reviewer');
  await dialog.getByRole('button', { name: '保存昵称' }).click();
  await expect(dialog.locator('.session-nickname')).toHaveText('Reviewer');
  await page.keyboard.press('Escape');
  await expect(a.locator('.session-nickname')).toHaveText('Reviewer');
  await page.reload();
  await expect(a.locator('.session-nickname')).toHaveText('Reviewer');
  h.views[1].title = 'Reviewer'; h.publish(h.views[1]);
  await expect(a.locator('.session-discriminator')).toHaveText(/^@/);
  await expect(b.locator('.session-discriminator')).toHaveText(/^@/);
});

test('one accessible light, no duplicate focused shell or theme control; failure text stays', async ({ page }) => {
  const h = await setup(page, [session('a')]);
  await setCardView(page,card(page),'detail');
  const light = page.locator('[data-session-status="a"]:visible');
  await expect(light).toHaveCount(1);
  await light.focus();
  await expect(page.getByRole('tooltip', { name: /可继续对话/ })).toBeVisible();
  const dialog = await focus(page);
  await expect(light).toHaveCount(1);
  await expect(card(page).locator('[data-node-shell-header]')).toBeHidden();
  await expect(dialog.getByText('专注对话', { exact: true })).toHaveCount(0);
  const theme = page.getByRole('combobox', { name: '主题配色' });
  await expect(theme).toHaveCount(1);
  await theme.selectOption('dark');
  await dialog.getByRole('button', { name: '铺满视口' }).click();
  await theme.selectOption('light');
  await theme.focus(); await expect(theme).toBeFocused();
  expect(await theme.evaluate(el => { const box = el.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === el; })).toBe(true);
  h.views[0].snapshot!.messages.at(-1)!.error = 'upstream failed'; h.publish(h.views[0]);
  await expect(dialog.locator('.session-status-important')).toContainText('上次回复失败');
  h.views[0].snapshot!.approvals = [{ id: 'pending', toolCallId: 'tool', kind: 'bash', state: 'pending' }]; h.publish(h.views[0]);
  await expect(dialog.locator('.session-status-important')).toContainText('等待批准');
});

test('floating/fullscreen reuse DOM, folds, draft and reading anchor; Escape unwinds layers and IME', async ({ page }) => {
  const view = session('a');
  view.snapshot!.messages.at(-1)!.blocks.push({ type: 'tool-call', toolCallId: 'tool', name: 'read', arguments: { path: 'fixture.txt' } });
  view.snapshot!.tools = [{ id: 'tool', name: 'read', state: 'completed', parentMessageId: 'm-39', result: 'fixture output' }];
  await setup(page, [view]);
  const dialog = await focus(page);
  await expect(dialog).toHaveAttribute('data-window-mode', 'floating');
  const input = dialog.getByLabel('发送给真实 Agent 的消息');
  await input.fill('草稿保留');
  await dialog.getByRole('button', { name: /执行过程/ }).click();
  await expect(dialog.locator('[data-tool-id="tool"]')).toBeVisible();
  const carrier = await dialog.locator('[data-focus-carrier]').elementHandle();
  const textarea = await input.elementHandle();
  const log = dialog.getByRole('log');
  await log.evaluate(el => { el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 })); el.scrollTop = el.scrollHeight / 2; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(350);
  const anchor = () => log.evaluate(el => { const top = el.getBoundingClientRect().top; return [...el.querySelectorAll<HTMLElement>('[data-entry-id]')].find(row => row.getBoundingClientRect().bottom > top)?.dataset.entryId; });
  const before = await anchor();
  await dialog.getByRole('button', { name: '铺满视口' }).click();
  await expect(dialog).toHaveAttribute('data-window-mode', 'full');
  expect(await carrier!.evaluate(el => el === document.querySelector('[data-focus-overlay] [data-focus-carrier]'))).toBe(true);
  expect(await textarea!.evaluate(el => el === document.querySelector('[data-focus-overlay] textarea'))).toBe(true);
  await expect(input).toHaveValue('草稿保留');
  await expect(dialog.locator('[data-tool-id="tool"]')).toBeAttached();
  await expect.poll(anchor).toBe(before);
  await dialog.getByRole('button', { name: '还原浮窗' }).click();
  await expect(dialog).toHaveAttribute('data-window-mode', 'floating');
  await expect.poll(anchor).toBe(before);
  await dialog.getByRole('button', { name: '铺满视口' }).click();
  expect(await textarea!.evaluate(el => el === document.querySelector('[data-focus-overlay] textarea'))).toBe(true);
  await input.focus();
  await input.dispatchEvent('compositionstart');
  await input.press('Escape');
  await expect(dialog).toHaveAttribute('data-window-mode', 'full');
  await input.dispatchEvent('compositionend');
  await input.dispatchEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true });
  await expect(dialog).toHaveAttribute('data-window-mode', 'full');
  await input.evaluate(el => el.addEventListener('keydown', event => event.preventDefault(), { once: true }));
  await input.press('Escape');
  await expect(dialog).toHaveAttribute('data-window-mode', 'full');
  // A portal-style menu outside the panel consumes Escape without closing/restoring it.
  await page.evaluate(() => {
    const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); menu.tabIndex = 0; menu.textContent = 'Portal menu'; menu.style.cssText = 'position:fixed;top:0;left:0;z-index:100';
    document.body.appendChild(menu); menu.focus(); menu.addEventListener('keydown', event => { if (event.key === 'Escape') menu.remove(); });
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(dialog).toHaveAttribute('data-window-mode', 'full');
  await openDiagnostics(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '会话诊断', exact: true })).toHaveCount(0);
  await expect(dialog).toHaveAttribute('data-window-mode', 'full');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveAttribute('data-window-mode', 'floating');
  await expect.poll(anchor).toBe(before);
  await expect(input).toHaveValue('草稿保留');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await carrier!.evaluate(el => el.isConnected)).toBe(true);
  expect(await textarea!.evaluate(el => el.isConnected)).toBe(true);
  await expect(card(page).getByLabel('发送给真实 Agent 的消息')).toHaveValue('草稿保留');
  const reopened = await focus(page);
  await expect(reopened).toHaveAttribute('data-window-mode', 'floating');
});
