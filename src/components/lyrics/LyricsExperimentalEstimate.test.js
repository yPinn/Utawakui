import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
const { owner } = vi.hoisted(() => ({ owner: {} }));
vi.mock('../../composables/useLyrics.js', () => ({
  useLyrics: () => ({ experimentalLyrics: owner }),
}));
import Component from './LyricsExperimentalEstimate.vue';
describe('compact experimental estimate provenance', () => {
  it('identifies read-only reuse without automatically applying it', async () => {
    Object.assign(owner, {
      needsReanalysis: shallowRef(false),
      applied: shallowRef(false),
      estimate: shallowRef({
        status: 'ready',
        compatibility: { rule: 'normalizer-v2-v3-exact-v1' },
      }),
      prepared: shallowRef({
        status: 'ready',
        lines: [{ status: 'ready', fineTiming: { units: [{}] } }],
      }),
      setApplied: vi.fn(),
    });
    const html = await renderToString(
      createSSRApp({ render: () => h(Component) }),
    );
    expect(html).toContain('沿用既有分析，時間未變');
    expect(html).toContain('分析未套用');
    expect(html).toContain('套用分析');
    expect(owner.setApplied).not.toHaveBeenCalled();
  });
});
