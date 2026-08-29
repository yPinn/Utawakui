import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisReferenceEditor from './MusicAnalysisReferenceEditor.vue';

describe('MusicAnalysisReferenceEditor', () => {
  it('renders only authored references with compact playback editing controls', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisReferenceEditor, {
        annotationCase: {
          id: 'case-01',
          trackId: 'track-01',
          durationMs: 120000,
          referenceBpm: 128,
          referenceSections: [
            { startMs: 0, endMs: 30000, role: 'intro' },
            { startMs: 30000, endMs: 120000, role: null },
          ],
          complete: false,
        },
        allowedRoles: ['intro', 'verse', 'chorus'],
        currentTimeMs: 30000,
        isCurrentTrack: true,
        beats: [
          { timeMs: 29500, downbeat: false },
          { timeMs: 30000, downbeat: true },
        ],
        snapToDownbeats: true,
      }),
    );

    expect(html).toContain('128');
    expect(html).toContain('在 0:30 新增邊界');
    expect(html).toContain('前奏');
    expect(html).toContain('未標註');
    expect(html).toContain('width:25%');
    expect(html).toContain('強拍吸附');
    expect(html).toContain('B 新增邊界');
    expect(html).toContain('reference-editor__section--active');
    expect(html).not.toMatch(/confidence|prediction|模型預測/i);
  });
});
