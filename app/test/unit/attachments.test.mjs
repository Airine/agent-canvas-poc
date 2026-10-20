import test from 'node:test';
import assert from 'node:assert/strict';
import { clipboardImages } from '../../src/pages/canvas/chat/attachments.ts';

const file = (name, type, size = 3) => new File([new Uint8Array(size)], name, { type });
const item = (type, value) => ({ kind: 'file', type, getAsFile: () => value });

test('clipboard images are picked from file items and unnamed screenshots get a usable name', () => {
  const png = file('', 'image/png');
  const picked = clipboardImages({ items: [item('image/png', png), { kind: 'string', type: 'text/plain', getAsFile: () => null }], files: [] });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].type, 'image/png');
  assert.equal(picked[0].name, '粘贴图片 1.png');
  assert.equal(picked[0].size, 3);
});

test('clipboard falls back to files when items expose no image, keeps names and de-duplicates', () => {
  const jpeg = file('chart.jpg', 'image/jpeg');
  const fromFiles = clipboardImages({ items: [], files: [jpeg, file('notes.txt', 'text/plain')] });
  assert.deepEqual(fromFiles.map(f => f.name), ['chart.jpg']);
  const duplicated = clipboardImages({ items: [item('image/jpeg', jpeg)], files: [jpeg] });
  assert.equal(duplicated.length, 1);
  assert.equal(duplicated[0].name, 'chart.jpg');
});

test('non-image and missing clipboard data never throw or invent attachments', () => {
  assert.deepEqual(clipboardImages(undefined), []);
  assert.deepEqual(clipboardImages(null), []);
  assert.deepEqual(clipboardImages({ items: [item('application/pdf', file('a.pdf', 'application/pdf'))] }), []);
});
