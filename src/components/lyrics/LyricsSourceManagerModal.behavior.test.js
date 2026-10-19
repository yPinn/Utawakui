import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, reactive } from 'vue';
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';
import Modal from './LyricsSourceManagerModal.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const domain = vi.hoisted(() => ({}));
vi.mock('../../composables/useLyrics.js', () => ({ useLyrics: () => domain }));
vi.mock('../ui/UiModal.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['open', 'title', 'size', 'bodyMode', 'maxBlockSize'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h(
                'section',
                {
                  title: props.title,
                  'data-size': props.size,
                  'data-body-mode': props.bodyMode,
                  'data-cap': props.maxBlockSize,
                },
                [
                  h('header', null, slots['header-actions']?.()),
                  slots.default?.(),
                ],
              )
            : null,
    },
  };
});
vi.mock('./LyricsLrclibSearchWorkspace.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['providerId'],
      emits: ['back'],
      setup: (props) => () =>
        h('div', { 'data-provider': props.providerId }, '搜尋內容'),
    },
  };
});
vi.mock('./LyricsManualImportPanel.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      emits: ['cancel', 'saved'],
      setup:
        (_props, { emit }) =>
        () =>
          h('form', null, [
            h('button', { onClick: () => emit('saved') }, '完成匯入'),
            h('button', { onClick: () => emit('cancel') }, '取消匯入'),
          ]),
    },
  };
});

for (const [component, path] of [
  [Modal, './LyricsSourceManagerModal.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiSurface, '../ui/UiSurface.vue'],
  [UiOverflowTooltip, '../ui/UiOverflowTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, path, import.meta.url);

let app;
let sources;
beforeEach(() => {
  vi.stubGlobal('window', {});
  sources = reactive({ items: [] });
  Object.assign(domain, {
    state: reactive({
      selectedTrackId: 'track',
      selectedSourceFilename: null,
      offsetSeconds: 0,
    }),
    selectedLyrics: computed(() => ({ sources: sources.items })),
    selectedTrack: computed(() => ({
      id: 'track',
      title: 'Test song',
      artist: 'Artist',
    })),
    setSourceLabel: vi.fn(),
    deleteSource: vi.fn(),
    backfillSourceLabels: vi.fn(async () => {}),
  });
});
afterEach(() => {
  app?.unmount();
  useFeedbackReport().closeReport();
  vi.unstubAllGlobals();
});

function setup() {
  const props = reactive({ open: true });
  const mounted = mount(Modal, props);
  app = mounted.app;
  const button = (label) =>
    findAll(
      mounted.root,
      (n) => n.type === 'button' && textContent(n).trim() === label,
    )[0];
  return { ...mounted, props, button };
}

describe('local lyrics collection modal navigation', () => {
  it('opens a content draft for the reported source while preserving current selection and timing', async () => {
    sources.items = [
      { filename: 'active.lrc', kind: 'lrclib', offsetMs: 100 },
      { filename: 'other.lrc', kind: 'netease', offsetMs: 2300 },
    ];
    domain.state.selectedSourceFilename = 'active.lrc';
    domain.state.offsetSeconds = -1.4;
    domain.state.lyricsText = 'PRIVATE LYRICS';
    domain.state.timingDocument = { lines: ['PRIVATE TIMING'] };
    const before = JSON.stringify(domain.state);
    const { root, props } = setup();
    const feedback = useFeedbackReport();
    const reportButtons = findAll(
      root,
      (n) =>
        n.type === 'button' &&
        textContent(n).trim() === '回報這個歌詞來源的問題',
    );
    expect(reportButtons).toHaveLength(2);
    trigger(reportButtons[0], 'onClick');
    expect(feedback.state).toMatchObject({
      open: true,
      kind: 'content',
      trackLabel: 'Artist - Test song',
      step: 'compose',
      includeDiagnostics: false,
    });
    expect(feedback.state.description).toContain('-1400 ms');
    expect(feedback.state.description).not.toContain('PRIVATE');
    feedback.closeReport();
    trigger(reportButtons[1], 'onClick');
    expect(feedback.state.description).toContain('+2300 ms');
    feedback.closeReport();
    expect(JSON.stringify(domain.state)).toBe(before);
    expect(props.open).toBe(true);
    expect(domain.setSourceLabel).not.toHaveBeenCalled();
    expect(domain.deleteSource).not.toHaveBeenCalled();
  });
  it('keeps one search entry on the empty collection and returns focus after combined search', async () => {
    const { root, button } = setup();
    expect(
      findAll(root, (n) => n.props['data-size'] === 'notice'),
    ).toHaveLength(1);
    expect(textContent(root)).toContain('尚無可用歌詞');
    expect(
      findAll(
        root,
        (n) =>
          n.props['data-body-mode'] === 'scroll' &&
          n.props['data-cap'] === 'small',
      ),
    ).toHaveLength(1);
    expect(findAll(root, (n) => n.type === 'button').map(textContent)).toEqual([
      '手動匯入歌詞',
      '搜尋歌詞',
    ]);
    trigger(button('搜尋歌詞'), 'onClick');
    await nextTick();
    expect(
      findAll(root, (n) => n.props['data-provider'] === 'all'),
    ).toHaveLength(1);
    const back = button('返回可用歌詞');
    expect(back.props.class).toContain('ui-icon-btn');
    expect(back.parent.type).toBe('header');
    expect(findAll(root, (n) => n.props['data-size'] === 'wide')).toHaveLength(
      1,
    );
    expect(button('搜尋歌詞')).toBeUndefined();
    expect(
      findAll(
        root,
        (n) =>
          n.props['data-body-mode'] === 'workspace' &&
          n.props['data-cap'] === 'small',
      ),
    ).toHaveLength(1);
    trigger(back, 'onClick');
    await nextTick();
    await nextTick();
    expect(button('搜尋歌詞').focus).toHaveBeenCalledOnce();
    expect(
      findAll(root, (n) => n.props['data-size'] === 'notice'),
    ).toHaveLength(1);
  });

  it('projects import expansion through the toolbar and closes the panel after save or cancel', async () => {
    const { button } = setup();
    trigger(button('手動匯入歌詞'), 'onClick');
    await nextTick();
    expect(button('手動匯入歌詞').props['aria-expanded']).toBe(true);
    trigger(button('完成匯入'), 'onClick');
    await nextTick();
    expect(button('手動匯入歌詞').props['aria-expanded']).toBe(false);
    trigger(button('手動匯入歌詞'), 'onClick');
    await nextTick();
    trigger(button('取消匯入'), 'onClick');
    await nextTick();
    expect(button('取消匯入')).toBeUndefined();
  });

  it('preserves legacy label backfill without adding provider search entries', async () => {
    sources.items = [{ filename: 'one.lrc', kind: 'lrclib', label: '' }];
    const { button } = setup();
    let finish;
    domain.backfillSourceLabels.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    trigger(button('補齊標籤'), 'onClick');
    await nextTick();
    expect(button('補齊標籤中…').props.disabled).toBe(true);
    expect(domain.backfillSourceLabels).toHaveBeenCalledOnce();
    finish();
    await nextTick();
    await nextTick();
    sources.items[0].label = '已補齊';
    await nextTick();
    expect(button('補齊標籤')).toBeUndefined();
  });

  it('reopens the collection after an external close during search', async () => {
    const { props, button } = setup();
    trigger(button('搜尋歌詞'), 'onClick');
    await nextTick();
    props.open = false;
    await nextTick();
    props.open = true;
    await nextTick();
    expect(button('搜尋歌詞')).toBeDefined();
    expect(button('返回可用歌詞')).toBeUndefined();
  });
});
