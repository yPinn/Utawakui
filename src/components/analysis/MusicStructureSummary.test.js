import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicStructureSummary from './MusicStructureSummary.vue';

async function render(result) {
  return renderToString(
    createSSRApp(MusicStructureSummary, {
      result,
    }),
  );
}

describe('MusicStructureSummary', () => {
  it('renders a compact M2 summary and section order', async () => {
    const html = await render({
      trackId: 'track-1',
      sourceRevision: 'abcdef1234567890'.repeat(4),
      sourceDurationMs: 180000,
      signals: {
        level: 'M2',
        reason: 'current',
        tempo: { bpm: 120, confidence: 0.91 },
        beats: [
          { timeMs: 0, downbeat: true },
          { timeMs: 500, downbeat: false },
        ],
        sections: [
          {
            sectionId: 'section-1',
            startMs: 0,
            endMs: 180000,
            role: 'chorus',
            confidence: 0.84,
          },
        ],
      },
    });

    expect(html).toContain('M2');
    expect(html).toContain('約 120 BPM');
    expect(html).toContain('2');
    expect(html).toContain('1');
    expect(html).toContain('副歌');
    expect(html).toContain('節拍信心 91%');
    expect(html).toContain('分析結果');
    expect(html).toContain('查看來源資訊');
    expect(html).not.toContain('abcdef123456');
    expect(html).toContain('速度');
    expect(html).toContain('節拍');
    expect(html).toContain('強拍');
    expect(html).toContain('段落');
    expect(html).not.toContain('Sidecar result');
  });

  it('does not expose analyzer precision beyond one decimal place', async () => {
    const html = await render({
      sourceRevision: 'abcdef1234567890'.repeat(4),
      sourceDurationMs: 225000,
      signals: {
        level: 'M1',
        reason: 'current',
        sectionStatus: 'low-confidence',
        tempo: { bpm: 91.94, confidence: 0.952124 },
        beats: [],
        sections: [],
      },
    });

    expect(html).toContain('約 91.9 BPM');
    expect(html).toContain('節拍信心 95%');
    expect(html).not.toContain('91.94 BPM');
    expect(html).toContain('段落信心不足');
    expect(html).toContain('保留 M1');
  });

  it('teaches the missing-sidecar state instead of showing an empty panel', async () => {
    const html = await render({
      trackId: 'track-1',
      sourceRevision: null,
      sourceDurationMs: null,
      signals: {
        level: 'M0',
        reason: 'missing',
        tempo: null,
        beats: [],
        sections: [],
      },
    });

    expect(html).toContain('尚未找到 analysis sidecar');
    expect(html).toContain('M0 fallback');
  });
});
