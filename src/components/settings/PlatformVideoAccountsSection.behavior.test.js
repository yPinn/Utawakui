import { h } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { t } from '../../utils/i18n.js';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import AccountsSection from './PlatformVideoAccountsSection.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsSection from './SettingsSection.vue';

vi.mock('../../composables/useAppConfirmation.js', () => ({
  useAppConfirmation: () => ({ confirm: async () => true }),
}));
vi.mock('./YoutubeLoginRow.vue', () => ({ default: () => null }));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('button', slots.default?.()),
  },
}));
vi.mock('../ui/UiChip.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('span', slots.default?.()),
  },
}));
vi.mock('../ui/UiOverflowTooltip.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));

for (const [component, file] of [
  [AccountsSection, './PlatformVideoAccountsSection.vue'],
  [SettingsDocumentItem, './SettingsDocumentItem.vue'],
  [SettingsSection, './SettingsSection.vue'],
]) {
  attachClientRender(component, file, import.meta.url);
}

afterEach(() => vi.unstubAllGlobals());

it('starts and removes a Spotify binding directly in Settings', async () => {
  const status = {
    configured: true,
    secure: true,
    bound: false,
    profile: null,
  };
  const api = {
    getPlatformVideoAccount: async () => ({
      ok: true,
      value: { configured: false },
    }),
    getSpotifyPlaylistImportStatus: async () => status,
    bindSpotifyAccount: vi.fn(async () => ({
      ok: true,
      value: {
        ...status,
        bound: true,
        profile: { name: 'Linked listener' },
        savedAt: 1_700_000_000_000,
      },
    })),
    unbindSpotifyAccount: vi.fn(async () => ({ ok: true, value: status })),
    getYoutubeLoginSource: async () => 'none',
    getYoutubeLoginStatus: async () => ({ imported: false }),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const mounted = mount(AccountsSection);
  const byLabel = (key) =>
    findAll(
      mounted.root,
      (node) => node.type === 'button' && node.props['aria-label'] === t(key),
    )[0];
  try {
    await vi.waitFor(() =>
      expect(byLabel('platformVideo.bindSpotify')?.props.disabled).toBe(false),
    );
    trigger(byLabel('platformVideo.bindSpotify'), 'onClick');
    await vi.waitFor(() =>
      expect(textContent(mounted.root)).toContain('Linked listener'),
    );
    const [unbind] = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' &&
        textContent(node) === t('platformVideo.unbindAccount'),
    );
    trigger(unbind, 'onClick');
    await vi.waitFor(() =>
      expect(textContent(mounted.root)).not.toContain('Linked listener'),
    );
    expect(api.bindSpotifyAccount).toHaveBeenCalledOnce();
    expect(api.unbindSpotifyAccount).toHaveBeenCalledOnce();
  } finally {
    mounted.app.unmount();
  }
});

it('renders both provider avatars and clears only the displayed Spotify profile', async () => {
  const savedAt = 1_700_000_000_000;
  const youtubeAvatar = 'https://yt3.googleusercontent.com/yt-avatar';
  const spotifyAvatar = 'https://i.scdn.co/image/abcd';
  const api = {
    getPlatformVideoAccount: async () => ({
      ok: true,
      value: {
        configured: true,
        secure: true,
        savedAt,
        retainedUntil: savedAt + 30 * 86_400_000,
        channel: {
          name: 'Studio Channel',
          handle: '@studio',
          avatarUrl: youtubeAvatar,
        },
      },
    }),
    getSpotifyPlaylistImportStatus: async () => ({
      configured: true,
      lastAuthorizedAt: savedAt,
      profile: { name: 'Studio Listener', avatarUrl: spotifyAvatar },
    }),
    clearSpotifyPlaylistProfile: vi.fn(async () => {}),
    getYoutubeLoginSource: async () => 'none',
    getYoutubeLoginStatus: async () => ({ imported: false }),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const mounted = mount(AccountsSection);
  try {
    const avatars = () =>
      findAll(mounted.root, (node) => node.type === 'img').map(
        (node) => node.props.src,
      );
    await vi.waitFor(() =>
      expect(avatars()).toEqual([youtubeAvatar, spotifyAvatar]),
    );
    expect(textContent(mounted.root)).toContain('Studio Channel · @studio');
    expect(textContent(mounted.root)).toContain('Studio Listener');
    const [clear] = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' &&
        textContent(node) === t('platformVideo.clearSpotifyProfile'),
    );
    trigger(clear, 'onClick');
    await vi.waitFor(() => expect(avatars()).toEqual([youtubeAvatar]));
    expect(api.clearSpotifyPlaylistProfile).toHaveBeenCalledOnce();
    expect(textContent(mounted.root)).not.toContain('Studio Listener');
    expect(textContent(mounted.root)).toContain('最近授權於');
  } finally {
    mounted.app.unmount();
  }
});
