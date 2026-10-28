import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { decoderIdentity } from './source.js';
it('resolves approved system aliases and binds their current physical executable', () => {
  const root = fs.mkdtempSync(path.resolve('tasks/wave-decoder-'));
  try {
    const file = path.join(root, 'decoder.exe'),
      alias = path.join(root, 'approved.exe');
    fs.writeFileSync(file, 'fixture');
    fs.linkSync(file, alias);
    expect(decoderIdentity(alias).file).toBe(fs.realpathSync(alias));
    const before = decoderIdentity(alias).stamp;
    fs.appendFileSync(file, 'changed');
    expect(decoderIdentity(alias).stamp).not.toBe(before);
    expect(() => decoderIdentity(root)).toThrow('DECODER_UNAVAILABLE');
    expect(() => decoderIdentity(null)).toThrow('DECODER_UNAVAILABLE');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
