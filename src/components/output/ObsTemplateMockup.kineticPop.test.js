import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

describe('Kinetic Pop gallery mockup', () => {
  it('previews the default second material in one animated lyric stage', () => {
    const source = readObsTemplateMockupSource();

    const kineticMarkup = source.match(
      /<template v-else-if="preset\?\.id === 'kinetic-pop'">([\s\S]*?)<\/template>/,
    )?.[1];

    expect(kineticMarkup).toBeDefined();
    expect(kineticMarkup).not.toContain('v-for="line in kineticPreviewLines"');
    expect(kineticMarkup).toContain(
      ':data-kinetic-material="kineticPreviewLine.material"',
    );
    expect(kineticMarkup).toContain(
      ':data-kinetic-arrangement="kineticPreviewArrangement"',
    );
    expect(kineticMarkup).toContain(
      'v-for="(row, rowIndex) in kineticPreviewLine.rows"',
    );
    expect(kineticMarkup).toContain('v-for="(unit, unitIndex) in row.units"');
    expect(source).toContain("kineticMaterial: 'candy-rim'");
    expect(source).not.toContain("material: 'solid-outline', text:");
    expect(source).not.toContain("material: 'chromatic-depth', text:");
    expect(source).toContain('adaptKineticPopLyricsPresentation,');
    expect(source).toContain(
      'const presentation = adaptKineticPopLyricsPresentation(text, {',
    );
    expect(source).toContain('rows: presentation.rows.map');
    expect(source).toContain('units: row.units.map');
    expect(source).toContain('kineticPopBurstDelaySeconds(unitIndex)');
    expect(source).toMatch(/kineticPopRestPose\(\s*unitIndex,/);
    expect(source).toContain("kinetic?.arrangement ?? 'straight'");
    expect(source).toContain("'--kinetic-rest-x': unit.restX");
    expect(source).toContain("[data-kinetic-arrangement='subtle-offset']");
    expect(source).not.toContain('unitIndex * 35');
    expect(source).not.toContain("presentation.composition === 'caption'");
    expect(source).not.toContain('? [{ text: row.text }]');
    expect(source).not.toContain('units: Array.from(line.text).map');
    expect(source).toContain('@keyframes obs-preview-kinetic-unit-cycle');
    expect(source).toContain(
      ":data-motion=\"animated ? 'playing' : 'paused'\"",
    );
    expect(source).not.toContain('data-kinetic-preview-phase');
    expect(source).toContain('to bottom left');
    const candyStart = source.indexOf(
      ".obs-template-mockup__kinetic-line[data-kinetic-material='candy-rim']",
    );
    const candyEnd = source.indexOf(
      ".obs-template-mockup__kinetic-line[data-kinetic-material='chromatic-depth']",
      candyStart,
    );
    const candyCss = source.slice(candyStart, candyEnd);
    const unitRule = candyCss.match(
      /obs-template-mockup__kinetic-unit\s*{([^}]*)}/s,
    )?.[1];
    const rimRule = candyCss.match(
      /obs-template-mockup__kinetic-unit::before\s*{([^}]*)}/s,
    )?.[1];
    const fillRule = [
      ...candyCss.matchAll(
        /obs-template-mockup__kinetic-unit::after\s*{([^}]*)}/gs,
      ),
    ].at(-1)?.[1];
    expect(unitRule).toContain('color: transparent;');
    expect(unitRule).toContain('-webkit-text-stroke: 0;');
    expect(rimRule).toContain(
      '-webkit-text-stroke: 0.03em var(--ui-output-preview-kinetic-paper);',
    );
    expect(rimRule).toContain(
      'text-shadow: 0.07em 0.09em 0 var(--ui-output-preview-kinetic-ink);',
    );
    expect(fillRule).toContain(
      '-webkit-text-stroke: 0.0125em var(--ui-output-preview-kinetic-paper);',
    );
    expect(fillRule).toContain('paint-order: fill stroke;');
    expect(fillRule).not.toContain('var(--ui-output-preview-kinetic-ink)');
    expect(source).toMatch(
      /data-motion='playing'\] \.obs-template-mockup__kinetic-unit\s*{[^}]*animation:/s,
    );
    expect(source).toContain('line-height: 1.12;');
    expect(source).toContain("font-family: 'Utawakui M PLUS Rounded 1c'");
    expect(source).toContain('MPLUSRounded1c-ExtraBold.ttf');
    expect(source).toContain("font-family: 'Utawakui Keifont'");
    expect(source).toContain('Keifont.ttf');
  });

  it('centers the lyric row against the complete gallery stage', () => {
    const source = readObsTemplateMockupSource();
    const stageRule = source.match(
      /\.obs-template-mockup__kinetic-stage\s*{([^}]*)}/,
    )?.[1];
    const lineRule = source.match(
      /\.obs-template-mockup__kinetic-line\s*{([^}]*)}/,
    )?.[1];
    const rowRule = source.match(
      /\.obs-template-mockup__kinetic-row\s*{([^}]*)}/,
    )?.[1];

    expect(stageRule).toContain('inline-size: 100%;');
    expect(lineRule).toContain('inline-size: 100%;');
    expect(rowRule).toContain('inline-size: 100%;');
    expect(rowRule).toContain('justify-content: center;');
  });
});
