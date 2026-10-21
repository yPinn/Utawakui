import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlaybackTrackIdentity from './PlaybackTrackIdentity.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const navigation = vi.hoisted(() => ({ album: null, jump: vi.fn() }));
vi.mock('../../composables/useAlbumNavigation.js', () => ({
  useAlbumNavigation: () => ({
    albumForTrack: () => navigation.album,
    jumpToAlbum: navigation.jump,
  }),
}));
vi.mock('../ui/UiTooltip.vue', () => ({
  default: {
    setup(_, { slots }) {
      return () => slots.trigger?.({ triggerProps: {} });
    },
  },
}));
vi.mock('../ui/UiMarqueeText.vue', () => ({
  default: {
    props: ['text'],
    setup(props) {
      return () => h('span', props.text);
    },
  },
}));
vi.mock('../ui/UiTrackThumb.vue', () => ({
  default: {
    props: ['track', 'size'],
    setup(props) {
      return () => h('span', { 'data-artwork-size': props.size });
    },
  },
}));
vi.mock('./TrackArtistCredits.vue', () => ({
  default: {
    props: ['track'],
    setup(props) {
      return () =>
        h('span', { 'data-artist-owner': props.track.id }, props.track.artist);
    },
  },
}));
attachClientRender(
  PlaybackTrackIdentity,
  './PlaybackTrackIdentity.vue',
  import.meta.url,
);
beforeEach(() => {
  navigation.album = null;
  navigation.jump.mockClear();
});
const track = {
  id: 'local-song',
  title: '非常長的曲名 · 日本語の歌詞 · Long English title',
  artist: '歌手 A, Artist B',
};

describe('shared transport track identity', () => {
  it('shows complete canonical title and artist data through the same copy and artwork composition', () => {
    const view = mount(PlaybackTrackIdentity, { track, artworkSize: 40 });
    expect(textContent(view.root)).toContain(track.title);
    expect(textContent(view.root)).toContain(track.artist);
    expect(
      findAll(view.root, (n) => n.props['data-artist-owner'] === track.id),
    ).toHaveLength(1);
    expect(
      findAll(view.root, (n) => n.props['data-artwork-size'] === 40),
    ).toHaveLength(1);
    expect(findAll(view.root, (n) => n.type === 'button')).toHaveLength(0);
    view.app.unmount();
  });
  it('enables the existing album destination without treating the title as playback', () => {
    navigation.album = { id: 'album', name: '本機專輯' };
    const view = mount(PlaybackTrackIdentity, { track });
    const title = findAll(view.root, (n) => n.type === 'button')[0];
    expect(title.props['aria-label']).toContain('前往專輯：本機專輯');
    trigger(title, 'onClick');
    expect(navigation.jump).toHaveBeenCalledWith(track);
    view.app.unmount();
  });
  it('keeps caller-owned artwork interaction without accepting a feature status inside track copy', () => {
    const view = mount(
      PlaybackTrackIdentity,
      { track },
      {
        artwork: () => h('button', { 'aria-label': '展開目前歌曲資料' }),
        status: () => h('span', { role: 'status' }, 'BGM 待命'),
      },
    );
    expect(
      findAll(view.root, (n) => n.props['data-artwork-size']),
    ).toHaveLength(0);
    expect(
      findAll(view.root, (n) => n.props['aria-label'] === '展開目前歌曲資料'),
    ).toHaveLength(1);
    expect(findAll(view.root, (n) => n.props.role === 'status')).toHaveLength(
      0,
    );
    view.app.unmount();
  });
  it('renders an unavailable-source label without an album action', () => {
    const view = mount(PlaybackTrackIdentity, { emptyLabel: '尚未選擇 BGM' });
    expect(textContent(view.root)).toContain('尚未選擇 BGM');
    expect(findAll(view.root, (n) => n.type === 'button')).toHaveLength(0);
    view.app.unmount();
  });
});
