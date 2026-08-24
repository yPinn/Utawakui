import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('Live Stage gallery mockup', () => {
  it('shows independent top branding, lower-left lyrics, and a lower-right track card', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.join(directory, 'ObsTemplateMockup.vue'),
      'utf8',
    );

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
