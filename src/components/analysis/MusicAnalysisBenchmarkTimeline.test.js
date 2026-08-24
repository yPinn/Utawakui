import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisBenchmarkTimeline from './MusicAnalysisBenchmarkTimeline.vue';

describe('MusicAnalysisBenchmarkTimeline', () => {
  it('renders a proportional, labeled timeline and visible M2 gate state', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisBenchmarkTimeline, {
        durationMs: 120000,
        currentTimeMs: 30000,
        m2Status: 'low-confidence',
        sections: [
          {
            startMs: 0,
            endMs: 30000,
            role: 'intro',
            confidence: 0.8,
          },
          {
            startMs: 30000,
            endMs: 120000,
            role: 'chorus',
            confidence: 0.49,
          },
        ],
      }),
    );

    expect(html).toContain('M1 降級');
    expect(html).toContain('段落信心不足');
    expect(html).toContain('前奏，0:00 到 0:30，信心 80%');
    expect(html).toContain('副歌，0:30 到 2:00，信心 49%，低於 M2 門檻');
    expect(html).toContain('width:25%');
    expect(html).toContain('left:25%');
    expect(html).toContain('低信心');
  });
});
