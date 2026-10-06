import { describe, expect, it, vi } from 'vitest';
import {
  fetchChannelAvatarUrl,
  isAllowedChannelAvatarUrl,
  isChannelId,
  isTopicChannelName,
  selectAvatarUrl,
} from './channelAvatar.js';

const CHANNEL_ID = 'UC5DHwv9N4OQ9AWtKr8YSefw';
const AVATAR_900 = 'https://yt3.googleusercontent.com/avatar=s900-c-k';

const channelInfo = {
  thumbnails: [
    {
      id: '0',
      width: 1060,
      height: 175,
      url: 'https://yt3.googleusercontent.com/banner=w1060',
    },
    {
      id: 'banner_uncropped',
      url: 'https://yt3.googleusercontent.com/banner=s0',
    },
    { id: '7', width: 900, height: 900, url: AVATAR_900 },
    {
      id: 'avatar_uncropped',
      url: 'https://yt3.googleusercontent.com/avatar=s0',
    },
  ],
};

describe('channel avatar helpers', () => {
  it('validates channel ids and Topic channel names', () => {
    expect(isChannelId(CHANNEL_ID)).toBe(true);
    expect(isChannelId('UC../../etc')).toBe(false);
    expect(isChannelId('https://www.youtube.com/channel/x')).toBe(false);
    expect(isTopicChannelName('Yitai Wang - Topic')).toBe(true);
    expect(isTopicChannelName('周杰倫 Jay Chou')).toBe(false);
    expect(isTopicChannelName('Topic Records')).toBe(false);
  });

  it('allows only HTTPS YouTube avatar hosts', () => {
    expect(isAllowedChannelAvatarUrl(AVATAR_900)).toBe(true);
    expect(isAllowedChannelAvatarUrl('https://yt3.ggpht.com/a')).toBe(true);
    expect(
      isAllowedChannelAvatarUrl('http://yt3.googleusercontent.com/a'),
    ).toBe(false);
    expect(isAllowedChannelAvatarUrl('https://i.ytimg.com/vi/x/hq.jpg')).toBe(
      false,
    );
    expect(isAllowedChannelAvatarUrl('not a url')).toBe(false);
  });

  it('prefers the square sized avatar over banners and the uncropped original', () => {
    expect(selectAvatarUrl(channelInfo)).toBe(AVATAR_900);
    expect(
      selectAvatarUrl({ thumbnails: channelInfo.thumbnails.slice(0, 2) }),
    ).toBe(null);
    expect(
      selectAvatarUrl({
        thumbnails: [
          {
            id: 'avatar_uncropped',
            url: 'https://yt3.googleusercontent.com/avatar=s0',
          },
        ],
      }),
    ).toBe('https://yt3.googleusercontent.com/avatar=s0');
  });
});

describe('fetchChannelAvatarUrl', () => {
  it('reads the fixed featured tab with bounded flat-playlist options', async () => {
    const runner = vi.fn().mockResolvedValue(channelInfo);
    await expect(
      fetchChannelAvatarUrl(CHANNEL_ID, { runner }),
    ).resolves.toEqual({ status: 'ok', url: AVATAR_900 });
    const [url, options] = runner.mock.calls[0];
    expect(url).toBe(`https://www.youtube.com/channel/${CHANNEL_ID}/featured`);
    expect(options).toMatchObject({
      flatPlaylist: true,
      dumpSingleJson: true,
      playlistEnd: 1,
    });
  });

  it('rejects invalid channel ids without running yt-dlp', async () => {
    const runner = vi.fn();
    await expect(
      fetchChannelAvatarUrl('../channel', { runner }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-channel' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('maps provider failures and missing avatars to bounded reasons', async () => {
    await expect(
      fetchChannelAvatarUrl(CHANNEL_ID, {
        runner: vi.fn().mockRejectedValue(new Error('stderr /private/path')),
      }),
    ).resolves.toEqual({ status: 'error', reason: 'provider-unavailable' });
    await expect(
      fetchChannelAvatarUrl(CHANNEL_ID, {
        runner: vi.fn().mockResolvedValue({ thumbnails: [] }),
      }),
    ).resolves.toEqual({ status: 'error', reason: 'avatar-unavailable' });
    await expect(fetchChannelAvatarUrl(CHANNEL_ID)).resolves.toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
  });
});
