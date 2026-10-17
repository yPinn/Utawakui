import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { outputAppearanceFieldsForTemplate } from '../../shared/outputAppearance.mjs';
import { readObsTemplateMockupSource } from '../../src/components/output/obsTemplateMockupSource.mjs';

const lyricsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(lyricsDirectory, '..', '..');
const fontDirectory = path.join(rootDirectory, 'shared', 'assets', 'fonts');
const fontFilename = 'GenEiAntiqueNv6-M.ttf';

describe('Manga Frame bundled Japanese typeface contract', () => {
  it('pins the official GenEi Antique 6.0a release with its OFL license', () => {
    const font = fs.readFileSync(path.join(fontDirectory, fontFilename));
    const source = fs.readFileSync(
      path.join(fontDirectory, 'SOURCE-GENEI-ANTIQUE.txt'),
      'utf8',
    );
    const digest = crypto.createHash('sha256').update(font).digest('hex');

    expect([...font.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    expect(source).toContain('Version: 6.0a');
    expect(source).toContain('https://okoneya.jp/font/download.html');
    expect(source).toContain(`SHA-256: ${digest}`);
    expect(source).toContain('Reserved Font Name: 源暎');
    expect(
      fs.readFileSync(
        path.join(fontDirectory, 'OFL-GENEI-ANTIQUE.txt'),
        'utf8',
      ),
    ).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('uses the same local family for Japanese Manga copy and ruby in Output and preview', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'lyrics.css'),
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
    const architecture = fs.readFileSync(
      path.join(rootDirectory, 'docs', 'architecture.md'),
      'utf8',
    );
    const releaseInventory = fs.readFileSync(
      path.join(rootDirectory, 'docs', 'operations', 'release-inventory.md'),
      'utf8',
    );

    expect(css).toContain("font-family: 'Utawakui GenEi Antique';");
    expect(css).toContain("url('/shared/assets/fonts/GenEiAntiqueNv6-M.ttf')");
    // GenEi Antique is Manga's default font choice, not a forced Japanese rule.
    const appearanceCss = fs.readFileSync(
      path.join(rootDirectory, 'overlay', 'shared', 'appearance.css'),
      'utf8',
    );
    const mangaFont = outputAppearanceFieldsForTemplate('manga-frame').find(
      (field) => field.key === 'fontFamily',
    );
    expect(mangaFont.defaultValue).toBe('antique');
    expect(mangaFont.options.map((option) => option.id)).toEqual([
      'sans',
      'serif',
      'rounded',
      'antique',
    ]);
    expect(appearanceCss).toMatch(
      /\[data-ovl-font='antique'\]\s*{[^}]*'Utawakui GenEi Antique'/,
    );
    expect(css).not.toMatch(
      /data-manga-language='ja'\]\s*\.lyrics-overlay__manga-text/,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__manga-text\s*{[^}]*font-family: var\(--ovl-user-font-family\);/,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__manga-text rt\s*{[\s\S]*?font-family: inherit;/,
    );
    expect(mockup).toContain(
      "url('../../../shared/assets/fonts/GenEiAntiqueNv6-M.ttf')",
    );
    expect(mockup).toMatch(
      /\.obs-template-mockup__manga-text\s*{[^}]*font-family: var\(--obs-user-font-family\);/,
    );
    expect(mockup).toMatch(
      /\[data-appearance-font='antique'\]\s*{\s*--obs-user-font-family: var\(--ui-output-preview-font-antique\);/,
    );
    expect(notices).toContain('GenEi Antique');
    expect(design).toContain('Utawakui GenEi Antique');
    expect(architecture).toContain('GenEi Antique');
    expect(releaseInventory).toContain(
      'shared/assets/fonts/GenEiAntiqueNv6-M.ttf',
    );
  });
});
