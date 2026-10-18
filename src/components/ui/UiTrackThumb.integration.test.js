import { h, nextTick, reactive } from 'vue';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';
let Thumb, Row, Loading, Reveal;
beforeAll(async () => {
  for (const name of [
    'UiTrackThumb',
    'UiTrackRow',
    'TrackArtworkContent',
    'UiArtworkOverlay',
    'UiArtworkLoading',
    'UiArtworkReveal',
    'UiMarqueeText',
    'UiTextButton',
    'UiOverflowTooltip',
  ]) {
    const component = (await import('./' + name + '.vue')).default;
    attachClientRender(component, './' + name + '.vue', import.meta.url, {
      cacheHandlers: name === 'TrackArtworkContent',
    });
    if (name === 'UiTrackThumb') Thumb = component;
    if (name === 'UiTrackRow') Row = component;
    if (name === 'UiArtworkLoading') Loading = component;
    if (name === 'UiArtworkReveal') Reveal = component;
  }
});
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('document', {});
});
afterEach(() => vi.unstubAllGlobals());
const has = (node, name) =>
  String(node.props.class ?? '')
    .split(' ')
    .includes(name);
const images = (root) => findAll(root, (n) => n.type === 'img');
describe('Track thumb formal artwork composition', () => {
  it.each(['thumb', 'row'])(
    '%s keeps one overlay plane as caller loading completes, source fails and recovers',
    async (host) => {
      const state = reactive({
        phase: 'loading',
        track: { id: 'a', title: '曲目', thumbnailUrl: '/a.jpg' },
      });
      const overlay = () =>
        state.phase === 'loading'
          ? h(Loading, { label: '封面載入中' })
          : h(Reveal, () => h('span', '播放'));
      const component = {
        render: () =>
          host === 'thumb'
            ? h(
                Thumb,
                { track: state.track, size: 64, decorative: false },
                { overlay },
              )
            : h(
                Row,
                {
                  track: state.track,
                  artworkClickable: true,
                  artworkLabel: '播放曲目',
                },
                { artworkOverlay: overlay },
              ),
      };
      const m = mount(component);
      const layers = findAll(m.root, (n) =>
        has(n, 'ui-track-thumb__layers'),
      )[0];
      expect(findAll(layers, (n) => has(n, 'ui-artwork-overlay'))).toHaveLength(
        1,
      );
      expect(findAll(layers, (n) => n.props.role === 'status')).toHaveLength(1);
      if (host === 'thumb')
        expect(
          findAll(m.root, (n) => has(n, 'ui-track-thumb'))[0].props[
            'aria-hidden'
          ],
        ).toBeUndefined();
      const old = images(m.root)[0];
      state.phase = 'ready';
      state.track.thumbnailUrl = '/b.jpg';
      await nextTick();
      expect(findAll(layers, (n) => n.props.role === 'status')).toHaveLength(0);
      expect(findAll(layers, (n) => has(n, 'ui-artwork-reveal'))).toHaveLength(
        1,
      );
      expect(textContent(layers)).toContain('播放');
      trigger(old, 'onError');
      await nextTick();
      expect(images(m.root)[0].props.src).toBe('/b.jpg');
      trigger(images(m.root)[0], 'onError');
      await nextTick();
      expect(images(m.root)[0].props['data-track-artwork-kind']).toBe(
        'fallback',
      );
      trigger(images(m.root)[0], 'onError');
      await nextTick();
      expect(images(m.root)).toHaveLength(0);
      state.track.thumbnailUrl = '/c.jpg';
      await nextTick();
      expect(images(m.root)[0].props.src).toBe('/c.jpg');
      expect(findAll(layers, (n) => has(n, 'ui-artwork-overlay'))).toHaveLength(
        1,
      );
      m.app.unmount();
    },
  );
});
