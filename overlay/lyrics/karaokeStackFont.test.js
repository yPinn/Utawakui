import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from '../../src/components/output/obsTemplateMockupSource.mjs';

const lyricsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(lyricsDirectory, '..', '..');
const fontDirectory = path.join(rootDirectory, 'shared', 'assets', 'fonts');
const fontFilename = 'jf-open-huninn-2.1.ttf';

describe('Classic KTV bundled typeface contract', () => {
  it('pins the official jf open-huninn release with matching provenance', () => {
    const font = fs.readFileSync(path.join(fontDirectory, fontFilename));
    const source = fs.readFileSync(
      path.join(fontDirectory, 'SOURCE.txt'),
      'utf8',
    );
    const digest = crypto.createHash('sha256').update(font).digest('hex');

    expect([...font.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    expect(source).toContain('Version: 2.1');
    expect(source).toContain('/justfont/open-huninn-font/releases/tag/v2.1');
    expect(source).toContain(`SHA-256: ${digest}`);
    expect(
      fs.readFileSync(path.join(fontDirectory, 'OFL.txt'), 'utf8'),
    ).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('uses the same bundled family in the real Overlay and gallery mockup', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'lyrics.css'),
      'utf8',
    );
    const html = fs.readFileSync(
      path.join(lyricsDirectory, 'index.html'),
      'utf8',
    );
    const mockup = readObsTemplateMockupSource();
    const notices = fs.readFileSync(
      path.join(rootDirectory, 'THIRD_PARTY_NOTICES.md'),
      'utf8',
    );
    const design = fs.readFileSync(
      path.join(rootDirectory, 'DESIGN.md'),
      'utf8',
    );
    const releaseInventory = fs.readFileSync(
      path.join(rootDirectory, 'docs', 'operations', 'release-inventory.md'),
      'utf8',
    );
    const builder = fs.readFileSync(
      path.join(rootDirectory, 'electron-builder.yml'),
      'utf8',
    );

    expect(css).toContain("font-family: 'Utawakui Open Huninn';");
    expect(css).toContain(
      "url('/shared/assets/fonts/jf-open-huninn-2.1.ttf') format('truetype')",
    );
    expect(mockup).toContain(
      "url('../../../shared/assets/fonts/jf-open-huninn-2.1.ttf')",
    );
    expect(mockup).toContain("format('truetype')");
    expect(html).toContain(
      'href="/shared/assets/fonts/jf-open-huninn-2.1.ttf"',
    );
    expect(html).toContain('as="font"');
    expect(notices).toContain('jf open-huninn');
    expect(notices).toContain('SIL Open Font License 1.1');
    expect(design).toContain('Utawakui Open Huninn');
    expect(releaseInventory).toContain(
      'shared/assets/fonts/jf-open-huninn-2.1.ttf',
    );
    expect(builder).toContain('- shared/**/*');
  });
});
