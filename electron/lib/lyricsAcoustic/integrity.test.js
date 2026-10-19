import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  contained,
  fingerprintTree,
  verifyFileTable,
  sha,
  treeFiles,
} from './integrity.js';
const roots = [];
function root() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-integrity-'));
  roots.push(dir);
  return dir;
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);
it('checks exact bytes and normalized source pins, rejects traversal and cancellation', async () => {
  const dir = root();
  fs.writeFileSync(path.join(dir, 'one.py'), 'one\r\n');
  await verifyFileTable(dir, {
    'one.py': { bytes: 4, sha256: sha('one\n'), normalizeLf: true },
  });
  await expect(
    verifyFileTable(dir, { 'one.py': { bytes: 5, sha256: sha('wrong') } }),
  ).rejects.toThrow('integrity');
  expect(() => contained(dir, dir)).toThrow('path');
  expect(() => contained(dir, path.join(dir, '..', 'escape'))).toThrow('path');
  await expect(fingerprintTree(dir, AbortSignal.abort())).rejects.toMatchObject(
    { name: 'AbortError' },
  );
});
it('fingerprints content independent of the root and rejects links and executable bytecode', async () => {
  const a = root(),
    b = root();
  for (const dir of [a, b]) {
    fs.mkdirSync(path.join(dir, '__pycache__'));
    fs.writeFileSync(path.join(dir, 'one.py'), 'one');
    fs.writeFileSync(path.join(dir, '__pycache__', 'ignored.pyc'), 'cached');
  }
  expect(await fingerprintTree(a)).toBe(await fingerprintTree(b));
  fs.writeFileSync(path.join(b, 'one.py'), 'two');
  expect(await fingerprintTree(a)).not.toBe(await fingerprintTree(b));
  fs.writeFileSync(path.join(a, 'bad.pyc'), 'bytecode');
  expect(() => treeFiles(a)).toThrow('bytecode');
  fs.rmSync(path.join(a, 'bad.pyc'));
  fs.symlinkSync(b, path.join(a, 'linked'), 'junction');
  expect(() => treeFiles(a)).toThrow('link');
});
