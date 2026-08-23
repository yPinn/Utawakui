import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisTrackPicker from './MusicAnalysisTrackPicker.vue';

describe('MusicAnalysisTrackPicker', () => {
  it('exposes selected and busy states to assistive technology', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisTrackPicker, {
        tracks: [{ id: 'track-1', title: 'Selected song' }],
        selectedTrackId: 'track-1',
        selectedLevel: 'M1',
        disabled: true,
      }),
    );

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('role="button"');
  });
});
