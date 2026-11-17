import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import TrackLanguagePanel from './TrackLanguagePanel.vue';

function editorFor(languages, needsReview = false) {
  return {
    snapshot: shallowRef({ languages, needsReview }),
    languages: shallowRef(languages),
    needsConfirmation: shallowRef(needsReview),
    pending: shallowRef(false),
    error: shallowRef(''),
  };
}

const render = (editor) =>
  renderToString(
    createSSRApp({ render: () => h(TrackLanguagePanel, { editor }) }),
  );

describe('TrackLanguagePanel', () => {
  it('offers the six broad language groups', async () => {
    const html = await render(editorFor(['ja', 'en']));
    for (const label of [
      '演唱語言',
      '中文',
      '日語',
      '韓語',
      '英語',
      '其他語言',
      '無人聲',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('主要語言');
    expect(html).not.toContain('trackLanguage.');
  });

  it('offers re-confirmation after the audio changes', async () => {
    const html = await render(editorFor(['ja'], true));
    expect(html).toContain('確認語言');
  });
});
