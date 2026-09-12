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

function visibleText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}

describe('MusicStructureSummary', () => {
  it('renders a compact section summary without exposing internal tiers', async () => {
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

    expect(visibleText(html)).not.toContain('M2');
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
    expect(html).toContain('目前只顯示節拍');
    expect(visibleText(html)).not.toContain('M1');
  });

  it('explains missing results without exposing storage or fallback internals', async () => {
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

    expect(html).toContain('尚無分析結果');
    expect(html).toContain('安裝分析功能後，可從上方開始分析。');
    expect(html).not.toMatch(/sidecar|M0 fallback|analysis sidecar/iu);
  });

  it.each([
    ['invalid', '分析結果無法使用', '請重新分析'],
    ['stale', '分析結果需要更新', '歌曲音訊已變更'],
    ['unavailable-source', '來源音訊無法使用', '請確認檔案仍存在'],
    ['no-signal', '未找到節拍或段落', '可重新分析或改用其他音訊'],
  ])(
    'gives a user-facing recovery for %s results',
    async (reason, title, message) => {
      const html = await render({
        signals: {
          level: 'M0',
          reason,
          tempo: null,
          beats: [],
          sections: [],
        },
      });

      expect(html).toContain(title);
      expect(html).toContain(message);
      expect(html).not.toMatch(/sidecar|M0 fallback|狀態 API/iu);
    },
  );
});
