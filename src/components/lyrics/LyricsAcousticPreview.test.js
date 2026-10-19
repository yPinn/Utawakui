import { reactive, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import LyricsAcousticPreview from './LyricsAcousticPreview.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  LyricsAcousticPreview,
  './LyricsAcousticPreview.vue',
  import.meta.url,
);
attachClientRender(UiButton, '../ui/UiButton.vue', import.meta.url);
attachClientRender(UiHint, '../ui/UiHint.vue', import.meta.url);
function fixture() {
  const document = {
    documentId: 'doc',
    normalizerProfileId: 'lyrics-source-v2',
    granularity: 'T1',
    source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
    lines: [{ lineId: 'line', text: '你好世界', startMs: 1000, endMs: 4000 }],
  };
  const estimate = {
    status: 'ready',
    preview: {
      estimateId: 'estimate',
      documentId: 'doc',
      sourceFilename: 'main.lrc',
      sourceFingerprint: 'a'.repeat(64),
      normalizerProfileId: 'lyrics-source-v2',
      offsetUsedMs: 0,
      methodKind: 'fixture',
      lines: [
        {
          ...document.lines[0],
          status: 'ready',
          reason: null,
          chunks: [
            { chunkId: 'c1', from: 0, to: 2, startMs: 1000 },
            { chunkId: 'c2', from: 2, to: 4, startMs: 2700 },
          ],
        },
      ],
    },
  };
  return reactive({
    document,
    estimate,
    sourceKey: 'track/main.lrc',
    positionMs: 2600,
    offsetMs: 0,
  });
}
describe('local lyric chunk preview', () => {
  it('identifies private model results separately from synthetic validation data', () => {
    const props = fixture();
    props.estimate.preview.methodKind = 'model';
    const view = mount(LyricsAcousticPreview, props);
    expect(textContent(view.root)).toContain('研究模型估計');
    expect(textContent(view.root)).not.toContain('合成驗證資料');
    view.app.unmount();
  });
  it('has an explicit reversible toggle and updates start emphasis from the existing clock', async () => {
    const props = fixture();
    const view = mount(LyricsAcousticPreview, props);
    const button = () =>
      findAll(view.root, (node) => node.type === 'button')[0];
    expect(button().props['aria-pressed']).toBe(false);
    expect(button().props.class).not.toContain('ui-btn--active');
    expect(textContent(view.root)).toContain('整句時間估算');
    trigger(button(), 'onClick');
    await nextTick();
    expect(button().props['aria-pressed']).toBe(true);
    expect(button().props.class).toContain('ui-btn--active');
    expect(textContent(view.root)).toContain('合成驗證資料');
    expect(
      findAll(view.root, (n) => n.props?.['data-chunk-state'] === 'active').map(
        textContent,
      ),
    ).toEqual(['你好']);
    props.positionMs = 2800;
    await nextTick();
    expect(
      findAll(view.root, (n) => n.props?.['data-chunk-state'] === 'active').map(
        textContent,
      ),
    ).toEqual(['世界']);
    trigger(button(), 'onClick');
    await nextTick();
    expect(textContent(view.root)).toContain('整句時間估算');
    expect(button().props.class).not.toContain('ui-btn--active');
    expect(props.document.granularity).toBe('T1');
    props.offsetMs = 100;
    await nextTick();
    expect(button().props.disabled).toBe(true);
    expect(textContent(view.root)).toContain('已過期');
    view.app.unmount();
  });

  it('keeps T2 text and emphasis authoritative while the visible toggle changes', async () => {
    const props = fixture();
    props.document.granularity = 'T2';
    props.document.lines[0].segments = [
      { segmentId: 's1', text: '你好', startMs: 1000, endMs: 2000 },
      { segmentId: 's2', text: '世界', startMs: 2000, endMs: 4000 },
    ];
    const view = mount(LyricsAcousticPreview, props);
    const button = () =>
      findAll(view.root, (node) => node.type === 'button')[0];
    const before = textContent(view.root);
    expect(before).toContain('正式逐詞時間');
    expect(button().props.class).not.toContain('ui-btn--active');
    trigger(button(), 'onClick');
    await nextTick();
    expect(button().props.class).toContain('ui-btn--active');
    expect(textContent(view.root)).toBe(before);
    expect(
      findAll(view.root, (n) => n.props?.['data-chunk-state'] === 'active').map(
        textContent,
      ),
    ).toEqual(['世界']);
    view.app.unmount();
  });

  it('explains stale data, retains canonical text, and prevents enabling it', () => {
    const props = fixture();
    props.estimate = { status: 'stale' };
    const view = mount(LyricsAcousticPreview, props);
    const button = findAll(view.root, (n) => n.type === 'button')[0];
    expect(button.props.disabled).toBe(true);
    expect(textContent(view.root)).toContain('已過期');
    expect(textContent(view.root)).toContain('你好世界');
    view.app.unmount();
  });
});
