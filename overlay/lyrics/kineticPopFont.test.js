import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
    const mockup = fs.readFileSync(
      path.join(
        rootDirectory,
        'src',
        'components',
        'output',
        'ObsTemplateMockup.vue',
      ),
      'utf8',
    );
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

  it('keeps material one flat, enlarges material two, and offsets material three only down-right', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'lyrics.css'),
      'utf8',
    );

    expect(css).toContain("font-family: 'Utawakui Keifont';");
    expect(css).toContain("url('/shared/assets/fonts/Keifont.ttf')");
    expect(css).toMatch(
      /\[data-kinetic-material='solid-outline'\][\s\S]*?lyrics-overlay__kinetic-layer--depth[\s\S]*?display: none;/,
    );
    expect(css).toMatch(
      /\[data-kinetic-material='candy-rim'\][\s\S]*?font-size: 1\.18em;/,
    );
    expect(css).toContain('transform: translate(0.065em, 0.075em);');
    expect(css).toContain('transform: translate(0.12em, 0.14em);');
    expect(css).not.toContain('transform: translate(-0.06em, 0.045em);');

    const candyStart = css.indexOf("[data-kinetic-material='candy-rim']");
    const candyEnd = css.indexOf(
      "[data-kinetic-material='chromatic-depth']",
      candyStart,
    );
    const candyCss = css.slice(candyStart, candyEnd);
    const candyRimRule = candyCss.match(
      /\[data-kinetic-material='candy-rim'\]\s*\.lyrics-overlay__kinetic-layer--rim\s*{([^}]*)}/s,
    )?.[1];
    expect(css).toMatch(
      /\.lyrics-overlay__kinetic-layer\s*{[^}]*-webkit-text-stroke-color: transparent;[^}]*-webkit-text-stroke-width: 0;/s,
    );
    expect(candyCss).toContain('color: var(--ovl-color-kinetic-ink);');
    expect(candyCss).toContain('transform: translate(0.07em, 0.09em);');
    expect(candyCss).toContain('color: var(--ovl-color-kinetic-paper);');
    expect(candyRimRule).toContain(
      '-webkit-text-stroke: 0.03em var(--ovl-color-kinetic-paper);',
    );
    expect(candyRimRule).not.toContain(
      '-webkit-text-stroke: 0.045em var(--ovl-color-kinetic-paper);',
    );
    expect(candyCss).toContain('line-height: 1.12;');
    expect(css).toMatch(
      /lyrics-overlay__kinetic-layer-track--depth[\s\S]*?z-index: 0;[\s\S]*?lyrics-overlay__kinetic-layer-track--rim[\s\S]*?z-index: 1;[\s\S]*?lyrics-overlay__kinetic-layer-track--fill[\s\S]*?z-index: 2;/,
    );
    expect(candyCss).toContain('to bottom left');
    expect(candyCss).toContain('var(--ovl-color-kinetic-candy-deep)');
    expect(candyCss).toContain('var(--ovl-color-kinetic-candy-light)');
    expect(candyCss).not.toContain('var(--ovl-color-kinetic-ochre)');
    const candyFillRule = candyCss.match(
      /lyrics-overlay__kinetic-layer--fill\s*{([^}]*)}/s,
    )?.[1];
    expect(candyFillRule).toContain(
      '-webkit-text-stroke: 0.0125em var(--ovl-color-kinetic-paper);',
    );
    expect(candyFillRule).not.toContain(
      '-webkit-text-stroke: 0.025em var(--ovl-color-kinetic-paper);',
    );
    expect(candyFillRule).toContain('paint-order: fill stroke;');
    expect(candyFillRule).not.toContain('var(--ovl-color-kinetic-ink)');
    expect(candyFillRule).not.toContain('-webkit-text-stroke-width: 0;');
  });

  it('keeps straight rows neutral and applies only the selected subtle rest pose', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'lyrics.css'),
      'utf8',
    );

    expect(css).toMatch(
      /data-ovl-kinetic-arrangement='subtle-offset'[\s\S]*?lyrics-overlay__kinetic-unit[\s\S]*?transform: translate\([\s\S]*?--kinetic-rest-x[\s\S]*?--kinetic-rest-y[\s\S]*?scale\(var\(--kinetic-rest-scale\)\)[\s\S]*?rotate\(var\(--kinetic-rest-rotation\)\)/,
    );
    expect(css).not.toContain("data-ovl-kinetic-arrangement='straight'");
  });

  it('centers every single-row lyric against the full symmetric stage', () => {
    const css = fs.readFileSync(
      path.join(lyricsDirectory, 'lyrics.css'),
      'utf8',
    );
    const lineRule = css.match(
      /:root\[data-ovl-template='kinetic-pop'\] \.lyrics-overlay__kinetic-line\s*{([^}]*)}/,
    )?.[1];
    const rowRule = css.match(
      /:root\[data-ovl-template='kinetic-pop'\] \.lyrics-overlay__kinetic-row\s*{([^}]*)}/,
    )?.[1];
    const trackRule = css.match(
      /:root\[data-ovl-template='kinetic-pop'\] \.lyrics-overlay__kinetic-layer-track\s*{([^}]*)}/,
    )?.[1];

    expect(lineRule).toContain('inline-size: 100%;');
    expect(lineRule).toContain('max-inline-size: none;');
    expect(rowRule).toContain('inline-size: 100%;');
    expect(trackRule).toContain('inline-size: 100%;');
    expect(trackRule).toContain('justify-content: center;');
    expect(css).not.toContain('max-inline-size: min(88vw, 28ch);');
  });
});
