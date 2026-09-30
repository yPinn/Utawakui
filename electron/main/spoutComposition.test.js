import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Spout output composition boundary', () => {
  it('dispatches helper mode before importing the full application composition root', () => {
    const manifest = JSON.parse(read('package.json'));
    const entry = read('electron/entry.js');

    expect(manifest.main).toBe('electron/entry.js');
    expect(entry).toContain("require('./main/spoutHelperEntry')");
    expect(entry).toContain("require('./main')");
    expect(entry.indexOf("require('./main/spoutHelperEntry')")).toBeLessThan(
      entry.indexOf("require('./main')"),
    );
    expect(entry).not.toContain("require('electron')");
  });

  it('keeps the native bridge import helper-only and wires a separate main-owned adapter', () => {
    const main = read('electron/main.js');
    const runtime = read('electron/main/spoutOutputRuntime.js');
    const helper = read('electron/main/spoutHelperEntry.js');

    expect(main).toContain("require('./main/spoutOutputRuntime')");
    expect(main).toContain("require('./main/spoutOutputHandlers')");
    expect(main).not.toContain('@napolab/texture-bridge-core');
    expect(runtime).not.toContain('@napolab/texture-bridge-core');
    expect(helper).toContain("require('@napolab/texture-bridge-core')");
    expect(main.indexOf('app.enableSandbox();')).toBeLessThan(
      main.indexOf('app.setName(APP_NAME);'),
    );
    expect(helper.indexOf('app.enableSandbox();')).toBeLessThan(
      helper.indexOf("if (typeof process.send !== 'function')"),
    );
  });

  it('ships the Windows native package outside ASAR', () => {
    const builder = read('electron-builder.yml');
    expect(builder).toContain('node_modules/@napolab/texture-bridge*/**/*');
  });
});
