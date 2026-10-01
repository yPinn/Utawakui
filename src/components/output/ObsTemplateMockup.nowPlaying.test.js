import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

const mockupSource = readObsTemplateMockupSource();
const templateRegistrySource = readFileSync(
  fileURLToPath(new URL('../../constants/outputTemplates.js', import.meta.url)),
  'utf8',
);

describe('Now Playing template mockup', () => {
  it('mirrors the public 3／1／6 CD player composition', () => {
    expect(mockupSource).toContain('obs-template-mockup__now-player');
    expect(mockupSource).toContain('obs-template-mockup__now-player-shell');
    expect(mockupSource).toContain('obs-template-mockup__now-disc');
    expect(mockupSource).toContain('obs-template-mockup__now-information');
    expect(mockupSource).toContain(
      'grid-template-columns: repeat(10, minmax(0, 1fr));',
    );
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__now-player\s*{[^}]*grid-column:\s*1\s*\/\s*span 3;/s,
    );
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__now-information\s*{[^}]*grid-column:\s*5\s*\/\s*span 6;/s,
    );
  });

  it('describes the composition with concise Chinese gallery copy', () => {
    const nowPlayingStart = templateRegistrySource.indexOf("id: 'now-next'");
    const setlistStart = templateRegistrySource.indexOf("id: 'queue-board'");
    const nowPlayingDefinition = templateRegistrySource.slice(
      nowPlayingStart,
      setlistStart,
    );

    expect(nowPlayingDefinition).toContain("name: '浮光光碟'");
    expect(nowPlayingDefinition).toContain("layoutLabel: '光碟＋曲目'");
    expect(nowPlayingDefinition).toContain("tags: ['透明光碟'");
  });

  it('mirrors the 50／50 黑膠主題 hierarchy in the Workbench preview', () => {
    for (const className of [
      'obs-template-mockup__vinyl-stage',
      'obs-template-mockup__vinyl-album',
      'obs-template-mockup__vinyl-turntable',
      'obs-template-mockup__vinyl-platter',
      'obs-template-mockup__vinyl-record',
      'obs-template-mockup__vinyl-record-grooves',
      'obs-template-mockup__vinyl-label',
      'obs-template-mockup__vinyl-sleeve',
      'obs-template-mockup__vinyl-artwork',
      'obs-template-mockup__vinyl-copy',
      'obs-template-mockup__vinyl-spindle',
      'obs-template-mockup__vinyl-tonearm',
      'obs-template-mockup__vinyl-tonearm-assembly',
      'obs-template-mockup__vinyl-tonearm-pivot',
      'obs-template-mockup__vinyl-tonearm-rail',
      'obs-template-mockup__vinyl-tonearm-head',
      'obs-template-mockup__vinyl-tonearm-counterweight',
      'obs-template-mockup__vinyl-stylus',
    ]) {
      expect(mockupSource).toContain(className);
    }
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__vinyl-stage\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__vinyl-turntable\s*{[^}]*width:\s*100%;[^}]*aspect-ratio:\s*1;/s,
    );
    expect(mockupSource).toContain('viewBox="0 0 100 240"');
    expect(mockupSource).toContain('var(--ui-output-preview-vinyl-deck-metal)');
    expect(mockupSource).toContain(
      'var(--ui-output-preview-vinyl-platter-rim)',
    );
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__vinyl-sleeve::before,[\s\S]*\.obs-template-mockup__vinyl-sleeve::after/,
    );
    expect(mockupSource).toContain(
      'var(--ui-output-preview-vinyl-neutral-accent)',
    );
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__vinyl-copy \.obs-template-mockup__title\s*{[^}]*color:\s*var\(--ui-output-preview-vinyl-copy-ink\);/s,
    );
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__vinyl-label\s*{[^}]*background:\s*var\(--ui-output-preview-vinyl-sleeve-paper\);/s,
    );
  });

  it('mirrors the subtle platter machining rings in the Workbench preview', () => {
    const platterStart = mockupSource.indexOf(
      '.obs-template-mockup__vinyl-platter {',
    );
    const recordStart = mockupSource.indexOf(
      '.obs-template-mockup__vinyl-record {',
      platterStart,
    );
    const platterRule = mockupSource.slice(platterStart, recordStart);

    expect(platterRule).toContain('repeating-radial-gradient(');
    expect(platterRule).toContain('var(--ui-output-preview-vinyl-dark) 22%');
    expect(platterRule).toContain(
      'var(--ui-output-preview-vinyl-highlight) 12%',
    );
    expect(platterRule).toContain('transparent 11.5% 14%');
    expect(platterRule).toContain('var(--ui-output-preview-vinyl-platter-rim)');
  });

  it('keeps the preview vinyl playhead attached while motion is paused', () => {
    expect(mockupSource).toMatch(
      /\.obs-template-mockup__vinyl-record\s*{[^}]*animation:\s*obs-preview-vinyl-spin 18s linear infinite;[^}]*animation-play-state:\s*paused;/s,
    );
    expect(mockupSource).toMatch(
      /\.obs-template-mockup\[data-motion='playing'\][^{]*\.obs-template-mockup__vinyl-record\s*{[^}]*animation-play-state:\s*running;/s,
    );
  });
});
