import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const entrySource = fs.readFileSync(
  path.join(import.meta.dirname, 'entry.js'),
  'utf8',
);

function runEntry(argv = []) {
  const events = [];
  const runSpoutHelper = vi.fn(() => events.push('spout-helper'));
  const require = vi.fn((request) => {
    if (request === '../shared/spoutOutputContract') {
      return { SPOUT_HELPER_ARGUMENT: '--spout-helper' };
    }
    if (request === './main/spoutHelperEntry') return { runSpoutHelper };
    if (request === './main') {
      events.push('main');
      return {};
    }
    throw new Error(`Unexpected require: ${request}`);
  });

  vm.runInNewContext(entrySource, {
    process: { argv: ['electron.exe', '.', ...argv] },
    require,
  });

  return { events, require, runSpoutHelper };
}

describe('Electron entry', () => {
  it('routes the default process without importing helper-only code', () => {
    const result = runEntry();

    expect(result.events).toEqual(['main']);
    expect(result.require).not.toHaveBeenCalledWith('./main/spoutHelperEntry');
  });

  it('routes helper mode without importing the full composition root', () => {
    const result = runEntry(['--spout-helper']);

    expect(result.runSpoutHelper).toHaveBeenCalledOnce();
    expect(result.events).toEqual(['spout-helper']);
    expect(result.require).not.toHaveBeenCalledWith('./main');
  });
});
