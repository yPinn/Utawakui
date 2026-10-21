import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

describe('local renderer ESM boundary', () => {
  it('declares ESM only inside src and preserves the CommonJS app entry', () => {
    const readPackage = (file) =>
      JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    expect(readPackage('src/package.json').type).toBe('module');
    expect(readPackage('package.json').type).not.toBe('module');
    expect(readPackage('package.json').main).toBe('electron/entry.js');
  });

  for (const [name, executable] of [
    ['Node', process.execPath],
    ['Electron Node runtime', require('electron')],
  ]) {
    it(`${name} loads main-side lyrics without syntax detection or warnings`, () => {
      const result = spawnSync(
        executable,
        [
          '--no-experimental-detect-module',
          '--trace-warnings',
          '-e',
          `
            const assert = require('node:assert/strict');
            const { normalizeLyricsDocument } = require('./src/utils/lyricsDocument.js');
            const { loadResearchInput } = require('./electron/lib/lyricsResearch/input.js');
            assert.equal(typeof loadResearchInput, 'function');
            const document = normalizeLyricsDocument({
              text: '[00:01.25]First\\n[00:03.50]Second',
              source: { filename: 'main.lrc', language: 'und', kind: 'manual' },
              sourceFingerprint: 'a'.repeat(64),
              normalizerProfileId: 'lyrics-source-v2',
              timing: { status: 'missing' },
            });
            assert.equal(document.lines[0].startMs, 1250);
            assert.equal(document.lines[0].text, 'First');
            assert.equal(document.lines[1].startMs, 3500);
            console.log('lyrics module boundary OK');
          `,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
          timeout: 10_000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('lyrics module boundary OK');
      expect(result.stderr).not.toContain('MODULE_TYPELESS_PACKAGE_JSON');
    });
  }
});
