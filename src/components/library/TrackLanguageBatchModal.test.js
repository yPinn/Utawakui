import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import TrackLanguageBatchModal from './TrackLanguageBatchModal.vue';
import { useTrackLanguageIndex } from '../../composables/useTrackLanguageIndex.js';

const tracks = [
  { id: 'a', title: 'Yoru ni Kakeru', artist: 'YOASOBI' },
  { id: 'b', title: 'Gunjou', artist: 'YOASOBI' },
];

describe('TrackLanguageBatchModal', () => {
  it('ticks unannotated tracks and shows saved languages on the others', async () => {
    useTrackLanguageIndex().records.value = {
      b: { languages: ['en'], primary: 'en' },
    };
    const html = await renderToString(
      createSSRApp({
        render: () => h(TrackLanguageBatchModal, { open: true, tracks }),
      }),
    );
    expect(html).toContain('設定演唱語言');
    expect(html).toContain('選擇語言');
    expect(html).toContain('Yoru ni Kakeru · YOASOBI');
    expect(html).toContain('Gunjou · YOASOBI（已設定：英語）');
    expect(html).toContain('已勾選 1 / 2 首');
    expect(html).toContain('套用到 1 首');
    expect(html).not.toContain('trackLanguage.');
  });
});
