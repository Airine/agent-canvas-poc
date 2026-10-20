import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('managed runtime facade; no legacy HMAC/bind client remains', () => {
 const code=readFileSync(new URL('../../api/e-adapter.ts',import.meta.url),'utf8');
 assert.match(code,/session-manager/); assert.doesNotMatch(code,/createHmac|net.createConnection|E_CORE_BIND_TOKEN/);
});
