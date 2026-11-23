import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import hangulFontFiles from '../../../shared/assets/fonts/hangulFontFiles.json';
import {
  ENTRY_KEY,
  MANIFEST_NAME,
  collectEntryFiles,
  loadCompanionPage,
} from './pageAssets.js';

const manifest = {
  [ENTRY_KEY]: {
    file: 'assets/companion-a.js',
    css: ['assets/companion-a.css'],
    imports: ['_base.js'],
    dynamicImports: ['src/lazy.vue'],
  },
  '_base.js': {
    file: 'assets/base-b.js',
    css: ['assets/base-b.css'],
    assets: ['assets/fonts/x.woff2', 'assets/template.jpg'],
    imports: [ENTRY_KEY],
  },
  'src/lazy.vue': { file: 'assets/lazy-c.js' },
  'index.html': { file: 'assets/main-d.js' },
};

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('companion page assets', () => {
  it('collects only the companion entry closure', () => {
    expect(collectEntryFiles(manifest).sort()).toEqual([
      'assets/base-b.css',
      'assets/base-b.js',
      'assets/companion-a.css',
      'assets/companion-a.js',
      'assets/fonts/x.woff2',
      'assets/lazy-c.js',
      'assets/template.jpg',
    ]);
  });

  it('rejects paths outside assets and missing chunks', () => {
    expect(
      collectEntryFiles({
        [ENTRY_KEY]: { file: '../secret.js', css: ['assets/ok.css'] },
      }),
    ).toEqual(['assets/ok.css']);
    expect(() =>
      collectEntryFiles({ [ENTRY_KEY]: { file: 'a.js', imports: ['_x'] } }),
    ).toThrow('Missing manifest chunk');
  });

  it('loads the page and its files into an exact route table', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-companion-page-'),
    );
    dirs.push(root);
    const dir = path.join(root, 'dist');
    const write = (file, body) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), body);
    };
    write(MANIFEST_NAME, JSON.stringify(manifest));
    write(ENTRY_KEY, '<html></html>');
    for (const file of collectEntryFiles(manifest)) write(file, file);
    write('assets/icons/app-icon.png', 'icon');
    write('assets/icons/other.png', 'other');
    for (const file of hangulFontFiles)
      write(`../shared/assets/fonts/${file}`, file);
    const routes = loadCompanionPage(dir);
    expect([...routes.keys()].sort()).toEqual([
      '/assets/base-b.css',
      '/assets/base-b.js',
      '/assets/companion-a.css',
      '/assets/companion-a.js',
      '/assets/fonts/x.woff2',
      '/assets/icons/app-icon.png',
      '/assets/lazy-c.js',
      '/assets/template.jpg',
      '/m/',
      ...hangulFontFiles.map((file) => `/shared/assets/fonts/${file}`),
    ]);
    expect(routes.get('/m/').type).toBe('text/html; charset=utf-8');
    expect(String(routes.get('/assets/base-b.js').body)).toBe(
      'assets/base-b.js',
    );
    expect(routes.has('/assets/main-d.js')).toBe(false);
    expect(routes.get('/assets/icons/app-icon.png').type).toBe('image/png');
    expect(routes.get('/assets/template.jpg').type).toBe('image/jpeg');
    expect(routes.has('/assets/icons/other.png')).toBe(false);
    const font = routes.get('/shared/assets/fonts/GowunBatang-Regular.woff2');
    expect(font.type).toBe('font/woff2');
    expect(String(font.body)).toBe('GowunBatang-Regular.woff2');
    expect(routes.has('/shared/assets/fonts/OFL-JUA.txt')).toBe(false);
  });
});
