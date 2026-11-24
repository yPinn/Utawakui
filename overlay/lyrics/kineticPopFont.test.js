import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from '../../src/components/output/obsTemplateMockupSource.mjs';

const lyricsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(lyricsDirectory, '..', '..');
const fontDirectory = path.join(rootDirectory, 'shared', 'assets', 'fonts');
const fontFilename = 'MPLUSRounded1c-ExtraBold.ttf';
const popFontFilename = 'Keifont.ttf';

describe('Kinetic Pop bundled Japanese typeface contract', () => {
  it('pins the Google Fonts release with matching provenance and OFL license', () => {
    const font = fs.readFileSync(path.join(fontDirectory, fontFilename));
    const source = fs.readFileSync(
      path.join(fontDirectory, 'SOURCE-MPLUS-ROUNDED-1C.txt'),
      'utf8',
    );
    const digest = crypto.createHash('sha256').update(font).digest('hex');

    expect([...font.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    expect(source).toContain('/google/fonts/tree/main/ofl/roundedmplus1c');
    expect(source).toContain(`SHA-256: ${digest}`);
    expect(
      fs.readFileSync(
        path.join(fontDirectory, 'OFL-MPLUS-ROUNDED-1C.txt'),
        'utf8',
      ),
    ).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('uses the same bundled family in the real Overlay and gallery mockup', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'lyrics.css'),
      'utf8',
    );
    const mockup = readObsTemplateMockupSource();
    const notices = fs.readFileSync(
      path.join(rootDirectory, 'THIRD_PARTY_NOTICES.md'),
      'utf8',
    );
    const releaseInventory = fs.readFileSync(
      path.join(rootDirectory, 'docs', 'operations', 'release-inventory.md'),
      'utf8',
    );

    expect(css).toContain("font-family: 'Utawakui M PLUS Rounded 1c';");
    expect(css).toContain(
      "url('/shared/assets/fonts/MPLUSRounded1c-ExtraBold.ttf')",
    );
    expect(mockup).toContain(
      "url('../../../shared/assets/fonts/MPLUSRounded1c-ExtraBold.ttf')",
    );
    expect(notices).toContain('M PLUS Rounded 1c');
    expect(releaseInventory).toContain(
      'shared/assets/fonts/MPLUSRounded1c-ExtraBold.ttf',
    );
  });

  it('pins Keifont with its official source and Apache 2.0 license', () => {
    const font = fs.readFileSync(path.join(fontDirectory, popFontFilename));
    const digest = crypto.createHash('sha256').update(font).digest('hex');
    const source = fs.readFileSync(
      path.join(fontDirectory, 'SOURCE-KEIFONT.txt'),
      'utf8',
    );

    expect([...font.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    expect(source).toContain('https://font.sumomo.ne.jp/font_1.html');
    expect(source).toContain(`SHA-256: ${digest}`);
    expect(
      fs.readFileSync(
        path.join(fontDirectory, 'LICENSE-KEIFONT-APACHE-2.0.txt'),
        'utf8',
      ),
    ).toContain('Apache License');

    const notices = fs.readFileSync(
      path.join(rootDirectory, 'THIRD_PARTY_NOTICES.md'),
      'utf8',
    );
    const releaseInventory = fs.readFileSync(
      path.join(rootDirectory, 'docs', 'operations', 'release-inventory.md'),
      'utf8',
    );
    const builderConfig = fs.readFileSync(
      path.join(rootDirectory, 'electron-builder.yml'),
      'utf8',
    );

    expect(notices).toMatch(/Keifont[\s\S]*Apache License 2\.0/);
    expect(releaseInventory).toContain('shared/assets/fonts/Keifont.ttf');
    expect(builderConfig).toContain('- shared/**/*');
  });

  it('uses warm gold, a fine white red rim and tight cyan/violet separation', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'kineticPop.css'),
      'utf8',
    );
    const layerRule = (material, layer) =>
      css.match(
        new RegExp(
          String.raw`\[data-kinetic-material='${material}'\]\s*\.lyrics-overlay__kinetic-layer--${layer}\s*\{([^}]*)\}`,
          'u',
        ),
      )?.[1];

    expect(layerRule('solid-outline', 'depth')).toContain('display: none;');
    expect(layerRule('solid-outline', 'rim')).toContain(
      '0.14em var(--kinetic-ink)',
    );
    expect(css).toContain('--kinetic-base-yellow: #f8df0e');
    expect(css).toMatch(
      /data-kinetic-composition='punch'[\s\S]*?linear-gradient\([\s\S]*?var\(--kinetic-ochre\)/u,
    );

    expect(layerRule('candy-rim', 'depth')).toContain(
      '0.145em var(--kinetic-ink)',
    );
    expect(layerRule('candy-rim', 'depth')).toContain(
      'translate(0.014em, 0.022em)',
    );
    expect(layerRule('candy-rim', 'rim')).toContain(
      '0.038em var(--kinetic-paper)',
    );
    expect(layerRule('candy-rim', 'fill')).toMatch(
      /to bottom,\s*var\(--kinetic-candy-deep\),\s*var\(--kinetic-candy-light\)/u,
    );
    expect(layerRule('candy-rim', 'fill')).not.toContain('-webkit-text-stroke');

    expect(layerRule('chromatic-depth', 'depth')).toContain(
      'translate(-0.042em, -0.014em)',
    );
    expect(layerRule('chromatic-depth', 'rim')).toContain(
      'translate(0.045em, 0.06em)',
    );
    expect(layerRule('chromatic-depth', 'fill')).toContain(
      '0.06em var(--kinetic-ink)',
    );
    expect(layerRule('chromatic-depth', 'fill')).toContain(
      'var(--kinetic-cool-paper)',
    );
    expect(css).toMatch(
      /lyrics-overlay__kinetic-layer-track--depth[\s\S]*?z-index: 0;[\s\S]*?lyrics-overlay__kinetic-layer-track--rim[\s\S]*?z-index: 1;[\s\S]*?lyrics-overlay__kinetic-layer-track--fill[\s\S]*?z-index: 2;/u,
    );
  });

  it('keeps straight rows neutral and applies only the selected subtle rest pose', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'kineticPop.css'),
      'utf8',
    );

    expect(css).toMatch(
      /data-ovl-kinetic-arrangement='subtle-offset'[\s\S]*?lyrics-overlay__kinetic-unit[\s\S]*?transform: translate\([\s\S]*?--kinetic-rest-x[\s\S]*?--kinetic-rest-y[\s\S]*?scale\(var\(--kinetic-rest-scale\)\)[\s\S]*?rotate\(var\(--kinetic-rest-rotation\)\)/,
    );
    expect(css).not.toContain("data-ovl-kinetic-arrangement='straight'");
  });

  it('centers every single-row lyric against the full symmetric stage', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'kineticPop.css'),
      'utf8',
    );
    const lineRule = css.match(
      /\.lyrics-overlay__kinetic-line\s*{([^}]*)}/,
    )?.[1];
    const rowRule = css.match(/\.lyrics-overlay__kinetic-row\s*{([^}]*)}/)?.[1];
    const trackRule = css.match(
      /\.lyrics-overlay__kinetic-layer-track\s*{([^}]*)}/,
    )?.[1];

    expect(lineRule).toContain('inline-size: 100%;');
    expect(lineRule).toContain('max-inline-size: none;');
    expect(rowRule).toContain('inline-size: 100%;');
    expect(trackRule).toContain('inline-size: 100%;');
    expect(trackRule).toContain('justify-content: center;');
    expect(css).not.toContain('max-inline-size: min(88vw, 28ch);');
  });
});
