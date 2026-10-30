import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { readLocaleCatalogs } from './localeCatalogs.js';

describe('readLocaleCatalogs', () => {
  let dir;
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

  it('merges one JSON file per namespace under each locale', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-locales-'));
    fs.mkdirSync(path.join(dir, 'zh-TW'));
    fs.writeFileSync(path.join(dir, 'zh-TW', 'shell.json'), '{"quit":"結束"}');
    fs.writeFileSync(path.join(dir, 'zh-TW', 'notes.txt'), 'ignored');
    fs.writeFileSync(path.join(dir, 'catalog.test.js'), '');
    expect(readLocaleCatalogs(dir)).toEqual({
      'zh-TW': { shell: { quit: '結束' } },
    });
  });

  it('reads the shipped catalogs', () => {
    dir = '';
    expect(readLocaleCatalogs()['zh-TW'].shell.thumbar.play).toBe('播放');
  });
});
