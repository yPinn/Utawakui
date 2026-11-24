import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyReleaseNotes } from './release-contract.mjs';
import {
  carryStableSections,
  extractCopyBlock,
  prepareRelease,
  publishedInstallerSha256,
  rotateBaselines,
} from './release-prepare.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const temporaryDirectories = [];
const SHA_053 = 'a'.repeat(64);
const fakeGh = () => `${SHA_053}  Utawakui-Setup-0.5.3.exe
`;

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
  write(
    'shared/appUpdateValues.json',
    `${JSON.stringify({ releaseRepository: 'yPinn/Utawakui-Releases' })}
`,
  );
  write(
    'scripts/release-baselines.json',
    `${JSON.stringify(
      [
        {
          version: '0.3.0',
          sha256: 'b'.repeat(64),
          everyRun: false,
          boundary: 'first',
        },
        { version: '0.4.0', sha256: 'c'.repeat(64), everyRun: true },
      ],
      null,
      2,
    )}
`,
  );
  return directory;
}

const prepare = (directory, version, runGh = fakeGh) =>
  prepareRelease({ rootDirectory: directory, version, runGh });

const readJson = (directory, relative) =>
  JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'));

describe('prepareRelease', () => {
  it('bumps versions, scaffolds notes, and clears the announcement summary', () => {
    const directory = createFixture();
    const { notesCreated, notesPath } = prepare(directory, '0.6.0');

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
    expect(readJson(directory, 'scripts/release-baselines.json')).toEqual([
      {
        version: '0.3.0',
        sha256: 'b'.repeat(64),
        everyRun: false,
        boundary: 'first',
      },
      { version: '0.5.3', sha256: SHA_053, everyRun: true },
    ]);

    expect(notesCreated).toBe(true);
    const notes = fs.readFileSync(notesPath, 'utf8');
    expect(notes).toContain('# Utawakui v0.6.0 公開測試版');
    expect(notes).toContain('## Utawakui v0.6.0 Public Test');
    expect(notes).not.toContain('<version>');
    // Unfilled change placeholders must keep the notes from passing the contract.
    expect(() => verifyReleaseNotes(notesPath)).toThrow(/placeholder/);
  });

  it('carries the previous install guidance', () => {
    const directory = createFixture();
    const previous = fs.readFileSync(
      path.join(directory, 'docs/releases/v0.5.3.md'),
      'utf8',
    );
    const { notesPath } = prepare(directory, '0.6.0');
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

    expect(prepare(directory, '0.6.0').notesCreated).toBe(false);
    expect(fs.readFileSync(notesPath, 'utf8')).toBe('existing');
    expect(() => prepare(directory, '0.5.0')).toThrow(/greater/);
    expect(() => prepare(directory, '0.7.0-beta.1')).toThrow(/stable/);
  });
});

describe('CI upgrade baselines', () => {
  it('makes the latest release the only every-run baseline and keeps boundaries', () => {
    expect(
      rotateBaselines(
        [
          { version: '0.3.0', sha256: '1', everyRun: false, boundary: 'first' },
          { version: '0.5.3', sha256: '2', everyRun: true, boundary: 'format' },
          { version: '0.5.2', sha256: '3', everyRun: false },
        ],
        { version: '0.6.0', sha256: '4' },
      ),
    ).toEqual([
      { version: '0.3.0', sha256: '1', everyRun: false, boundary: 'first' },
      { version: '0.5.3', sha256: '2', everyRun: false, boundary: 'format' },
      { version: '0.6.0', sha256: '4', everyRun: true },
    ]);
  });

  it('reads the installer hash from published SHA256SUMS and edits nothing on failure', () => {
    expect(
      publishedInstallerSha256({
        repository: 'r',
        version: '0.5.3',
        runGh: () => `${'A'.repeat(64)}  Utawakui-Setup-0.5.3.exe
`,
      }),
    ).toBe('a'.repeat(64));

    const directory = createFixture();
    expect(() => prepare(directory, '0.6.0', () => 'nothing')).toThrow(
      /no published SHA-256/,
    );
    expect(readJson(directory, 'package.json').version).toBe('0.5.3');
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
