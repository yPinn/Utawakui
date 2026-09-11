import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const lyricsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(lyricsDirectory, '..', '..');
const fontDirectory = path.join(rootDirectory, 'shared', 'assets', 'fonts');
const fontFilename = 'HinaMincho-Regular.ttf';
const expectedDigest =
  '8395fafa0c2721b4b5c274031e1336fea0f703d908b175ee21f8ba2f1ad566a0';

describe('Ornate Vertical bundled Japanese typeface contract', () => {
  it('pins Hina Mincho to the official Google Fonts source and OFL license', () => {
    const font = fs.readFileSync(path.join(fontDirectory, fontFilename));
    const source = fs.readFileSync(
      path.join(fontDirectory, 'SOURCE-HINA-MINCHO.txt'),
      'utf8',
    );
    const digest = crypto.createHash('sha256').update(font).digest('hex');

    expect([...font.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    expect(digest).toBe(expectedDigest);
    expect(source).toContain('/google/fonts/tree/main/ofl/hinamincho');
    expect(source).toContain(`SHA-256: ${expectedDigest}`);
    expect(
      fs.readFileSync(path.join(fontDirectory, 'OFL-HINA-MINCHO.txt'), 'utf8'),
    ).toMatch(
      /Copyright 2020 The Hina Mincho Project Authors[\s\S]*SIL OPEN FONT LICENSE Version 1\.1/,
    );
  });

  it('keeps the bundled font visible in notices, packaging inventory, and the exact loopback allowlist', () => {
    const notices = fs.readFileSync(
      path.join(rootDirectory, 'THIRD_PARTY_NOTICES.md'),
      'utf8',
    );
    const releaseInventory = fs.readFileSync(
      path.join(rootDirectory, 'docs', 'operations', 'release-inventory.md'),
      'utf8',
    );
    const outputServer = fs.readFileSync(
      path.join(rootDirectory, 'electron', 'lib', 'outputServer', 'http.js'),
      'utf8',
    );
    const overlayCss = fs.readFileSync(
      path.join(lyricsDirectory, 'lyrics.css'),
      'utf8',
    );
    const galleryPreview = fs.readFileSync(
      path.join(
        rootDirectory,
        'src',
        'components',
        'output',
        'OrnateVerticalPreview.vue',
      ),
      'utf8',
    );

    expect(notices).toMatch(/Hina Mincho[\s\S]*SIL Open Font License 1\.1/);
    expect(releaseInventory).toContain(
      'shared/assets/fonts/HinaMincho-Regular.ttf',
    );
    expect(outputServer).toContain(
      "'/shared/assets/fonts/HinaMincho-Regular.ttf'",
    );
    expect(overlayCss).toContain('font-family: var(--ovl-user-font-family);');
    expect(overlayCss).toContain(
      "url('/shared/assets/fonts/HinaMincho-Regular.ttf')",
    );
    expect(galleryPreview).toContain(
      "url('../../../shared/assets/fonts/HinaMincho-Regular.ttf')",
    );
  });
});
