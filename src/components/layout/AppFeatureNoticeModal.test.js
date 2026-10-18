import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { FEATURE_GATES } from '../../constants/featureGates.js';
import { useFeatureGates } from '../../composables/useFeatureGates.js';
import AppFeatureNoticeModal from './AppFeatureNoticeModal.vue';

const renderModal = () => renderToString(createSSRApp(AppFeatureNoticeModal));

afterEach(() => {
  useFeatureGates().cancelPendingFeature();
  vi.unstubAllGlobals();
});

async function openGate(id, confirmFeatureGate = vi.fn()) {
  vi.stubGlobal('window', {
    Utawakui: {
      getFeatureConfirmations: vi.fn().mockResolvedValue({}),
      confirmFeatureGate,
    },
  });
  const gate = useFeatureGates();
  const result = gate.ensureFeatureGate(id);
  await vi.waitFor(() => expect(gate.pendingFeature.value?.id).toBe(id));
  return { gate, result };
}

describe('AppFeatureNoticeModal document', () => {
  it.each(Object.values(FEATURE_GATES))(
    'retains every disclosure and its section title for $id',
    async (feature) => {
      const { gate, result } = await openGate(feature.id);
      const html = await renderModal();
      expect(html).toContain('ui-modal--document');
      expect(html).toContain(feature.documentTitle);
      expect(html).toContain(feature.summary);
      expect(feature.bodyTitles).toHaveLength(feature.body.length);
      for (const [index, line] of feature.body.entries()) {
        expect(html).toContain(feature.bodyTitles[index]);
        expect(html).toContain(line);
      }
      expect(html).toContain('<ol');
      expect(html).toContain('ui-separator');
      expect(html).toContain('ui-modal__footer');
      expect(html).toContain('暫不啟用');
      expect(html).toContain('確認並啟用');
      gate.cancelPendingFeature();
      await expect(result).resolves.toBe(false);
    },
  );

  it('keeps disclosure and recovery visible after a save failure', async () => {
    const { gate, result } = await openGate(
      'lyrics-flow',
      vi.fn().mockRejectedValue(new Error('private failure')),
    );
    await gate.confirmPendingFeature();
    const html = await renderModal();
    expect(html).toContain('功能未啟用');
    expect(html).toContain('目前無法啟用這項功能，請再試一次。');
    expect(html).not.toContain('private failure');
    expect(html).toContain(FEATURE_GATES['lyrics-flow'].body.at(-1));
    expect(html).toContain('確認並啟用');
    gate.cancelPendingFeature();
    await expect(result).resolves.toBe(false);
  });

  it('disables all dismissal and action buttons while saving', async () => {
    let finish;
    const feature = FEATURE_GATES['lyrics-flow'];
    const { gate, result } = await openGate(
      feature.id,
      vi.fn(() => new Promise((resolve) => (finish = resolve))),
    );
    const saving = gate.confirmPendingFeature();
    const html = await renderModal();
    expect(html).toContain('啟用中…');
    expect(html.match(/<button[^>]*disabled/gu)).toHaveLength(3);
    gate.cancelPendingFeature();
    expect(gate.pendingFeature.value.id).toBe(feature.id);
    finish({
      enabled: true,
      noticeVersion: feature.noticeVersion,
      confirmedAt: '2026-10-18T00:00:00.000Z',
    });
    await saving;
    await expect(result).resolves.toBe(true);
  });
});
