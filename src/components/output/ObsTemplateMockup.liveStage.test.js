import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  readObsTemplateMockupSource,
  readObsTemplatePreviewSource,
} from './obsTemplateMockupSource.mjs';

describe('Live Stage gallery mockup', () => {
  it('mirrors the balanced runtime lanes and display-first broadcast hierarchy', () => {
    const source = readObsTemplateMockupSource();

    const branch = readObsTemplatePreviewSource('LiveStage');

    expect(branch).toContain('obs-template-mockup__live-stage-brand');
    expect(branch).toContain('obs-template-mockup__live-stage-brand-copy');
    expect(branch).toContain('obs-template-mockup__live-stage-channel');
    expect(branch).toContain('obs-template-mockup__live-stage-caption');
    expect(branch).toContain('obs-template-mockup__live-stage-card');
    expect(branch).toContain('track.title');
    expect(branch).toContain('track.artist');
    expect(branch).toContain('liveStageLines');
    expect(source).toContain('adaptLiveStageLyricsPresentation');
    expect(source).toContain('inset-block-start: 5.556%');
    expect(source).toContain('inline-size: 34%');
    expect(source).toContain('inline-size: 32%');
    // Runtime rem values reappear as canvas rem, so the preview keeps scale.
    const runtimeCss = readFileSync(
      fileURLToPath(
        new URL('../../../overlay/lyrics/lyrics.css', import.meta.url),
      ),
      'utf8',
    )
      .replace(/\s+/gu, ' ')
      .replace(/\(\s+/gu, '(')
      .replace(/\s+\)/gu, ')');
    for (const [runtimeVar, previewVar] of [
      ['--ovl-live-stage-type-label', '--ui-live-stage-type-label'],
      ['--ovl-live-stage-type-support', '--ui-live-stage-type-support'],
      ['--ovl-live-stage-type-title', '--ui-live-stage-type-title'],
      ['--ovl-live-stage-type-caption', '--ui-live-stage-type-caption'],
    ]) {
      const value = runtimeCss.match(
        new RegExp(
          `${runtimeVar}: (?:calc\\()?([0-9.]+)r?em(?: \\* var\\(--ovl-live-stage-scale\\)\\))?;`,
          'u',
        ),
      )?.[1];
      expect(value, runtimeVar).toBeDefined();
      expect(source).toContain(
        `${previewVar}: calc(${value} * var(--obs-canvas-rem));`,
      );
    }
    expect(runtimeCss).toContain(
      '--ovl-live-stage-card-mark-inline-size: calc(9rem * var(--ovl-live-stage-scale));',
    );
    expect(source).toContain(
      'grid-template-columns: calc(9 * var(--obs-canvas-rem)) minmax(0, 1fr);',
    );
    expect(runtimeCss).toContain(
      '--ovl-live-stage-brand-mark-size: calc(4.5rem * var(--ovl-live-stage-scale));',
    );
    expect(source).toContain('width: calc(4.5 * var(--obs-canvas-rem));');
    expect(runtimeCss).toContain(
      '--ovl-live-stage-channel-size: calc(4rem * var(--ovl-live-stage-scale));',
    );
    expect(source).toContain('font-size: calc(4 * var(--obs-canvas-rem));');
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-brand-copy\s*\{[\s\S]*?font-size:\s*var\(--ui-live-stage-type-label\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-brand-copy\s*> strong\s*\{[\s\S]*?font-size:\s*var\(--ui-live-stage-type-support\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-caption\s*\{[\s\S]*?font-size:\s*var\(--ui-live-stage-type-caption\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-card-copy\s*> strong\s*\{[\s\S]*?font-size:\s*var\(--ui-live-stage-type-title\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-card-copy\s*> span\s*\{[\s\S]*?font-size:\s*var\(--ui-live-stage-type-support\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-card-copy\s*\{[\s\S]*?display: grid;/u,
    );
    expect(source).not.toContain('inline-size: 20%');
    expect(source).not.toContain('inline-size: 38%');
    expect(source).toContain("[data-template-id='live-stage']");
  });
});
