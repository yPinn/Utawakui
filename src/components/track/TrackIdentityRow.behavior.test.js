import { existsSync } from 'node:fs';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigationHarness = vi.hoisted(() => ({
  album: null,
  calls: [],
}));

vi.mock('../../composables/useAlbumNavigation.js', () => ({
  useAlbumNavigation: () => ({
    albumForTrack: () => navigationHarness.album,
    jumpToAlbum: (track) =>
      navigationHarness.calls.push(`jump:album:${track.id}`),
  }),
}));

vi.mock('../ui/UiTrackRow.vue', () => ({
  default: {
    name: 'UiTrackRowStub',
    inheritAttrs: false,
    props: {
      track: { type: Object, required: true },
      titleClickable: { type: Boolean, default: false },
      titleAriaLabel: { type: String, default: undefined },
    },
    emits: ['titleClick', 'rowClick'],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h('li', { class: 'track-row-stub' }, [
          props.titleClickable
            ? h(
                'button',
                {
                  class: 'album-link',
                  'aria-label': props.titleAriaLabel,
                  onClick: () => emit('titleClick'),
                },
                props.track.title,
              )
            : h('span', { class: 'plain-title' }, props.track.title),
          slots.artist
            ? slots.artist()
            : h('span', { class: 'plain-artist' }, props.track.artist),
          slots.trail?.(),
          h(
            'button',
            {
              class: 'row-action',
              onClick: () => emit('rowClick', props.track),
            },
            attrs['action-label'] ?? 'row',
          ),
        ]);
    },
  },
}));

vi.mock('./TrackArtistCredits.vue', () => ({
  default: {
    name: 'TrackArtistCreditsStub',
    props: { track: { type: Object, required: true } },
    emits: ['navigate'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            class: 'artist-link',
            onClick: () => emit('navigate', 'artist-1'),
          },
          props.track.artist,
        );
    },
  },
}));

const componentUrl = new URL('./TrackIdentityRow.vue', import.meta.url);
const { attachClientRender, findAll, mount, textContent, trigger } =
  await import('../ui/uiTestHost.js');
const TrackIdentityRow = existsSync(componentUrl)
  ? (await import('./TrackIdentityRow.vue')).default
  : null;

function mountRow(props = {}, slots = {}) {
  expect(TrackIdentityRow).not.toBeNull();
  attachClientRender(
    TrackIdentityRow,
    './TrackIdentityRow.vue',
    import.meta.url,
  );
  return mount(
    TrackIdentityRow,
    {
      track: { id: 'track-1', title: '群青', artist: 'YOASOBI' },
      ...props,
    },
    slots,
  );
}

function findByClass(root, className) {
  return findAll(root, (node) => node.props.class === className);
}

beforeEach(() => {
  navigationHarness.album = { id: 'album-1', name: 'THE BOOK' };
  navigationHarness.calls.length = 0;
});

describe('TrackIdentityRow navigation recipe', () => {
  it('keeps title and artist as plain identity when navigation is none', () => {
    const { app, root } = mountRow({ navigation: 'none' });

    expect(findByClass(root, 'album-link')).toHaveLength(0);
    expect(findByClass(root, 'artist-link')).toHaveLength(0);
    expect(findByClass(root, 'plain-title')).toHaveLength(1);
    expect(findByClass(root, 'plain-artist')).toHaveLength(1);
    app.unmount();
  });

  it.each([
    ['album', true, false],
    ['artist', false, true],
    ['identity', true, true],
  ])(
    'enables the expected identity destinations for %s navigation',
    (navigation, albumLinked, artistLinked) => {
      const { app, root } = mountRow({ navigation });

      expect(findByClass(root, 'album-link')).toHaveLength(albumLinked ? 1 : 0);
      expect(findByClass(root, 'artist-link')).toHaveLength(
        artistLinked ? 1 : 0,
      );
      app.unmount();
    },
  );

  it('falls back to a plain title when no album destination exists', () => {
    navigationHarness.album = null;
    const { app, root } = mountRow({ navigation: 'album' });

    expect(findByClass(root, 'album-link')).toHaveLength(0);
    expect(findByClass(root, 'plain-title')).toHaveLength(1);
    app.unmount();
  });

  it('announces album navigation before changing the destination', () => {
    const { app, root } = mountRow({
      navigation: 'album',
      onNavigate: ({ kind, id }) =>
        navigationHarness.calls.push(`navigate:${kind}:${id}`),
    });

    trigger(findByClass(root, 'album-link')[0], 'onClick');

    expect(navigationHarness.calls).toEqual([
      'navigate:album:album-1',
      'jump:album:track-1',
    ]);
    app.unmount();
  });

  it('forwards artist navigation, row events and row slots', () => {
    const calls = [];
    const { app, root } = mountRow(
      {
        navigation: 'artist',
        actionLabel: '選取群青',
        onNavigate: ({ kind, id }) => calls.push(`navigate:${kind}:${id}`),
        onRowClick: (track) => calls.push(`row:${track.id}`),
      },
      { trail: () => h('span', { class: 'caller-trail' }, '狀態') },
    );

    trigger(findByClass(root, 'artist-link')[0], 'onClick');
    trigger(findByClass(root, 'row-action')[0], 'onClick');

    expect(calls).toEqual(['navigate:artist:artist-1', 'row:track-1']);
    expect(textContent(findByClass(root, 'caller-trail')[0])).toBe('狀態');
    app.unmount();
  });
});
