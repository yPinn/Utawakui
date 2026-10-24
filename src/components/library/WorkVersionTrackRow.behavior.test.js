import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const deps = vi.hoisted(() => ({ open: vi.fn(), rowProps: null }));
vi.mock('../ui/UiTrackRow.vue', () => ({
  default: {
    props: [
      'track',
      'artist',
      'artworkLabel',
      'artworkClickable',
      'stateSurfaceActive',
    ],
    emits: ['artworkClick'],
    setup:
      (props, { attrs, slots, emit }) =>
      () => {
        deps.rowProps = props;
        return h('li', attrs, [
          props.track.title,
          props.artist,
          h(
            'button',
            {
              'aria-label': props.artworkLabel,
              onClick: () => emit('artworkClick'),
            },
            '封面',
          ),
          slots.trail?.(),
        ]);
      },
  },
}));
vi.mock('../playback/context/TrackContextActions.vue', () => ({
  default: {
    props: ['track', 'context', 'trigger'],
    emits: ['openChange'],
    setup: (props, { expose, emit }) => {
      const open = (event) => {
        deps.open(event);
        emit('openChange', true);
      };
      expose({ open });
      return () =>
        h(
          'button',
          { 'aria-label': `${props.track.title}的更多選項`, onClick: open },
          '⋯',
        );
    },
  },
}));
import WorkVersionTrackRow from './WorkVersionTrackRow.vue';
attachClientRender(
  WorkVersionTrackRow,
  './WorkVersionTrackRow.vue',
  import.meta.url,
);
let mounted;
afterEach(() => {
  mounted?.app.unmount();
  vi.clearAllMocks();
});
const button = (label) =>
  findAll(
    mounted.root,
    (node) => node.type === 'button' && node.props['aria-label'] === label,
  )[0];

describe('WorkVersionTrackRow', () => {
  it('uses the shared row identity and only artwork playback plus an overflow trigger', () => {
    const play = vi.fn();
    const track = { id: 'a', title: '夜航', artist: '另一位歌手' };
    mounted = mount(WorkVersionTrackRow, {
      track,
      versionLabel: 'Acoustic · 翻唱',
      onPlay: play,
    });
    expect(textContent(mounted.root)).toContain('另一位歌手 · Acoustic · 翻唱');
    expect(
      findAll(mounted.root, (node) => node.type === 'button'),
    ).toHaveLength(2);
    expect(textContent(mounted.root)).not.toContain('一般佇列');
    expect(play).not.toHaveBeenCalled();
    trigger(button('播放 夜航'), 'onClick');
    expect(play).toHaveBeenCalledWith(track);
  });
  it('routes both ellipsis and right click through the existing action controller', async () => {
    mounted = mount(WorkVersionTrackRow, {
      track: { id: 'a', title: '夜航', artist: '歌手' },
    });
    const event = {
      type: 'contextmenu',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 20,
      clientY: 30,
    };
    trigger(
      findAll(mounted.root, (node) => node.type === 'li')[0],
      'onContextmenu',
      event,
    );
    await nextTick();
    expect(deps.open).toHaveBeenCalledWith(event);
    expect(deps.rowProps.stateSurfaceActive).toBe(true);
    trigger(button('夜航的更多選項'), 'onClick', { type: 'click' });
    expect(deps.open).toHaveBeenCalledTimes(2);
  });
});
