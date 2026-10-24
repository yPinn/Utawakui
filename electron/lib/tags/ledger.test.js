import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { readTagLedger, essence } from './ledger.js';
const roots = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);
function fixture() {
  const dir = fs.mkdtempSync(path.resolve('.tmp/tags-ledger-'));
  roots.push(dir);
  return dir;
}
const receipt = () => {
  const id = crypto.randomUUID();
  return {
    id,
    backupId: id,
    trackId: 'track',
    beforeHash: 'a'.repeat(64),
    afterHash: 'b'.repeat(64),
    essence: 'c'.repeat(64),
    createdAt: '2026-10-24T00:00:00.000Z',
    fields: ['title'],
    collectionId: null,
    position: null,
  };
};
it('accepts only bounded versioned receipts and retains explicit primary positions', () => {
  const dir = fixture();
  expect(readTagLedger(dir).data.receipts).toEqual([]);
  const r = {
    ...receipt(),
    collectionId: 'album',
    position: 2,
    restoredFrom: crypto.randomUUID(),
  };
  fs.writeFileSync(
    path.join(dir, 'tag-writebacks.json'),
    JSON.stringify({ version: 1, receipts: [r] }),
  );
  expect(readTagLedger(dir).data.receipts[0]).toEqual(r);
  expect(essence(fs.readFileSync('scripts/fixtures/tags/tone.flac'))).toMatch(
    /^[a-f0-9]{64}$/,
  );
});
it.each([
  (r) => ({ ...r, id: '../outside' }),
  (r) => ({ ...r, trackId: '../track' }),
  (r) => ({ ...r, backupId: 'invalid' }),
  (r) => ({ ...r, beforeHash: 'invalid' }),
  (r) => ({ ...r, createdAt: 'invalid' }),
  (r) => ({ ...r, fields: ['privatePath'] }),
  (r) => ({ ...r, position: 0 }),
  (r) => ({ ...r, collectionId: '../album' }),
  (r) => ({ ...r, restoredFrom: 'invalid' }),
])('rejects malformed recovery or alias evidence', (change) => {
  const dir = fixture();
  fs.writeFileSync(
    path.join(dir, 'tag-writebacks.json'),
    JSON.stringify({ version: 1, receipts: [change(receipt())] }),
  );
  expect(() => readTagLedger(dir)).toThrow();
});
it('rejects duplicate receipts and future versions instead of rewriting them', () => {
  const dir = fixture(),
    file = path.join(dir, 'tag-writebacks.json'),
    r = receipt();
  for (const value of [
    { version: 2, receipts: [] },
    { version: 1, receipts: [r, r] },
    { version: 1, receipts: Array(201).fill(r) },
  ]) {
    const text = JSON.stringify(value);
    fs.writeFileSync(file, text);
    expect(() => readTagLedger(dir)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(text);
  }
});
