import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

describe('Live Stage gallery mockup', () => {
  it('shows independent top branding, lower-left lyrics, and a lower-right track card', () => {
    const source = readObsTemplateMockupSource();

    const branch = source.slice(
      source.indexOf("preset?.id === 'live-stage'"),
      source.indexOf("preset?.id === 'manga-frame'"),
    );

    expect(branch).toContain('obs-template-mockup__live-stage-brand');
    expect(branch).toContain('obs-template-mockup__live-stage-channel');
    expect(branch).toContain('obs-template-mockup__live-stage-caption');
    expect(branch).toContain('obs-template-mockup__live-stage-card');
    expect(branch).toContain('track.title');
    expect(branch).toContain('track.artist');
    expect(branch).toContain('liveStageLines');
    expect(source).toContain('adaptLiveStageLyricsPresentation');
    expect(source).toContain('inline-size: 20%');
    expect(source).toContain("[data-template-id='live-stage']");
  });
});
