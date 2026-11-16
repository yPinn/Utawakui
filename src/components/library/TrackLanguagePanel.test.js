import { computed, createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import TrackLanguagePanel from './TrackLanguagePanel.vue';
import { TRACK_LANGUAGE_OPTIONS } from '../../composables/useTrackLanguageEditor.js';

function editorFor(languages, { needsReview = false, extra = [] } = {}) {
  const selected = shallowRef(languages);
  return {
    snapshot: shallowRef({ languages, primary: null, needsReview }),
    languages: selected,
    primary: shallowRef(null),
    choices: shallowRef([...TRACK_LANGUAGE_OPTIONS, ...extra]),
    needsPrimary: computed(() => selected.value.length > 1),
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
  it('offers the eight language choices without a main-language select', async () => {
    const html = await render(editorFor(['ja']));
    for (const label of [
      '演唱語言',
      '華語',
      '粵語',
      '臺語',
      '日語',
      '韓語',
      '英語',
      '中文（未細分）',
      '無人聲',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('主要語言');
    expect(html).not.toContain('trackLanguage.');
  });

  it('shows the main-language select once two languages are ticked', async () => {
    const html = await render(editorFor(['ko', 'en']));
    expect(html).toContain('主要語言');
    expect(html).toContain('未設定');
  });

  it('names a saved code outside the offered list and offers re-confirmation', async () => {
    const html = await render(
      editorFor(['es'], { needsReview: true, extra: ['es'] }),
    );
    expect(html).toContain('西班牙文');
    expect(html).toContain('確認語言');
  });
});
