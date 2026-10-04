import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

describe('Live Stage gallery mockup', () => {
  it('mirrors the balanced runtime lanes and display-first broadcast hierarchy', () => {
    const source = readObsTemplateMockupSource();

    const branch = source.slice(
      source.indexOf("preset?.id === 'live-stage'"),
      source.indexOf("preset?.id === 'manga-frame'"),
    );

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
    expect(source).toContain('grid-template-columns: 20% minmax(0, 1fr)');
    expect(source).toMatch(
      /--ui-live-stage-type-label:\s*var\(\s*--ui-output-template-thumb-caption-font-size\s*\);/u,
    );
    expect(source).toMatch(
      /--ui-live-stage-type-support:\s*var\(\s*--ui-output-template-thumb-title-font-size\s*\);/u,
    );
    expect(source).toContain(
      '--ui-live-stage-type-title: var(--ui-font-size-md)',
    );
    expect(source).toContain(
      '--ui-live-stage-type-caption: var(--ui-font-size-lg)',
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-brand-copy\s*\{[\s\S]*?font-size:\s*var\(--ui-live-stage-type-label\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-brand-copy\s*> strong\s*\{[\s\S]*?font-size:\s*var\(--ui-live-stage-type-support\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-brand > strong\s*\{[\s\S]*?width:\s*var\(--ui-space-5\);/u,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__live-stage-channel\s*\{[\s\S]*?font-size:\s*var\(--ui-font-size-lg\);/u,
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
