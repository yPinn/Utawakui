import { afterEach, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import ObsSessionExportModal from './ObsSessionExportModal.vue';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';

afterEach(() => {
  useObsSessionExport().close();
  vi.unstubAllGlobals();
});
const render = () => renderToString(createSSRApp(ObsSessionExportModal));

it('groups chapter issues once and exposes selectable readonly text', async () => {
  const entries = [12, 14, 16].map((seconds, index) => ({
    type: 'track',
    title: `曲目 ${index}`,
    stream: { timecode: `00:00:${seconds}.000` },
  }));
  vi.stubGlobal('window', {
    Utawakui: { getObsLatestSession: async () => ({ entries }) },
  });
  await useObsSessionExport().open();
  const html = await render();
  expect(html).toContain('章節有 3 項需確認');
  expect(html).toMatch(/<textarea[^>]*readonly/);
  expect(html).not.toMatch(/<textarea[^>]*disabled/);
  expect(html).toContain('0:12 曲目 0');
  expect(html).toContain('Ctrl+C');
  expect(html.match(/class="ui-notice /g)).toBeNull();
});

it.each(['empty', 'failure'])(
  'offers reload for a %s session',
  async (mode) => {
    vi.stubGlobal('window', {
      Utawakui: {
        getObsLatestSession: async () => {
          if (mode === 'failure') throw Error('private');
          return null;
        },
      },
    });
    await useObsSessionExport().open();
    const html = await render();
    expect(html).toContain('重新讀取場次');
    expect(html).not.toContain('id="obs-session-export-text"');
    expect(html).not.toContain('private');
  },
);
