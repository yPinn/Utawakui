import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyReleaseNotes } from './release-contract.mjs';
import {
  carryStableSections,
  prepareRelease,
  extractCopyBlock,
} from './release-prepare.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-release-prepare-'),
  );
  temporaryDirectories.push(directory);
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(directory, relative)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(directory, relative), text);
  };
  write('package.json', `${JSON.stringify({ version: '0.5.3' }, null, 2)}\n`);
  write(
    'package-lock.json',
    `${JSON.stringify({ version: '0.5.3', packages: { '': { version: '0.5.3' } } }, null, 2)}\n`,
  );
  write(
    'shared/releaseAnnouncement.json',
    `${JSON.stringify({ version: '0.5.3', summary: { 'zh-TW': '舊', 'en-US': 'Old' } }, null, 2)}\n`,
  );
  fs.cpSync(
    path.join(rootDirectory, 'docs/operations/release-notes-template.md'),
    path.join(directory, 'docs/operations/release-notes-template.md'),
  );
  fs.cpSync(
    path.join(rootDirectory, 'docs/releases/v0.5.3.md'),
    path.join(directory, 'docs/releases/v0.5.3.md'),
  );
  return directory;
}

const readJson = (directory, relative) =>
  JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'));

describe('prepareRelease', () => {
  it('bumps versions, scaffolds notes, and clears the announcement summary', () => {
    const directory = createFixture();
    const { notesCreated, notesPath } = prepareRelease({
      rootDirectory: directory,
      version: '0.6.0',
    });

    expect(readJson(directory, 'package.json').version).toBe('0.6.0');
    const lock = readJson(directory, 'package-lock.json');
    expect([lock.version, lock.packages[''].version]).toEqual([
      '0.6.0',
      '0.6.0',
    ]);
    expect(readJson(directory, 'shared/releaseAnnouncement.json')).toEqual({
      version: '0.6.0',
      summary: { 'zh-TW': '', 'en-US': '' },
    });

    expect(notesCreated).toBe(true);
    const notes = fs.readFileSync(notesPath, 'utf8');
    expect(notes).toContain('# Utawakui v0.6.0 公開測試版');
    expect(notes).toContain('## Utawakui v0.6.0 Public Test');
    expect(notes).not.toContain('<version>');
    // Unfilled change placeholders must keep the notes from passing the contract.
    expect(() => verifyReleaseNotes(notesPath)).toThrow(/placeholder/);
  });

  it('carries the previous stable install and limitation wording', () => {
    const directory = createFixture();
    const previous = fs.readFileSync(
      path.join(directory, 'docs/releases/v0.5.3.md'),
      'utf8',
    );
    const { notesPath } = prepareRelease({
      rootDirectory: directory,
      version: '0.6.0',
    });
    const notes = fs.readFileSync(notesPath, 'utf8');
    const bullets = (text, heading) =>
      text
        .split(new RegExp(`^## ${heading}\\r?\\n`, 'mu'))[1]
        .split(/\r?\n(?:---|## )/u)[0]
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('- '));

    for (const heading of ['安裝前須知', 'Before Installing']) {
      expect(bullets(notes, heading)).toEqual(bullets(previous, heading));
    }
    // Release-specific limitations start from the template, not the old copy.
    expect(bullets(notes, '已知限制').join('\n')).toContain('<');
  });

  it('replaces a carried section that ends the scaffold', () => {
    expect(
      carryStableSections(
        '## Before Installing\n\n- <a>\n- <b>',
        '## Before Installing\n\n- Official.\n',
      ),
    ).toBe('## Before Installing\n\n- Official.');
  });

  it('keeps existing notes and rejects non-increasing or prerelease versions', () => {
    const directory = createFixture();
    const notesPath = path.join(directory, 'docs/releases/v0.6.0.md');
    fs.writeFileSync(notesPath, 'existing');

    expect(
      prepareRelease({ rootDirectory: directory, version: '0.6.0' })
        .notesCreated,
    ).toBe(false);
    expect(fs.readFileSync(notesPath, 'utf8')).toBe('existing');
    expect(() =>
      prepareRelease({ rootDirectory: directory, version: '0.5.0' }),
    ).toThrow(/greater/);
    expect(() =>
      prepareRelease({ rootDirectory: directory, version: '0.7.0-beta.1' }),
    ).toThrow(/stable/);
  });
});

describe('release-notes helpers', () => {
  it('extracts the template copy block', () => {
    expect(extractCopyBlock('x\n```markdown\n# A\n```\n')).toBe('# A');
    expect(() => extractCopyBlock('no block')).toThrow();
  });

  it('leaves the scaffold unchanged without previous notes', () => {
    expect(carryStableSections('## 安裝前須知\n\n- <x>\n', null)).toBe(
      '## 安裝前須知\n\n- <x>\n',
    );
  });
});
