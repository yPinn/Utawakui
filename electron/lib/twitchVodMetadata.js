'use strict';

function createTwitchVodMetadata({ clientId, accessToken, fetchImpl = fetch }) {
  const configured =
    /^[a-zA-Z0-9]{1,128}$/u.test(clientId ?? '') &&
    /^[a-zA-Z0-9_-]{1,1024}$/u.test(accessToken ?? '');
  return async function getTwitchVod(videoId) {
    if (!configured) return { metadataStatus: 'unconfigured' };
    if (typeof videoId !== 'string' || !/^\d{1,20}$/u.test(videoId))
      return { metadataStatus: 'unavailable' };
    const url = new URL('https://api.twitch.tv/helix/videos');
    url.searchParams.set('id', videoId);
    try {
      const response = await fetchImpl(url, {
        headers: {
          'Client-Id': clientId,
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return { metadataStatus: 'unavailable' };
      const { data } = await response.json();
      if (!Array.isArray(data)) return { metadataStatus: 'unavailable' };
      const video = data.find((entry) => entry?.id === videoId);
      if (!video) return { metadataStatus: 'notFound' };
      const clock = /^(?:(\d+)h)?(?:(\d+)m)?(\d+)s$/u.exec(video.duration);
      return {
        metadataStatus: 'ready',
        title: video.title,
        channelName: video.user_name,
        videoDate: video.created_at,
        durationSeconds: clock
          ? Number(clock[1] ?? 0) * 3600 +
            Number(clock[2] ?? 0) * 60 +
            Number(clock[3])
          : null,
      };
    } catch {
      return { metadataStatus: 'unavailable' };
    }
  };
}

module.exports = { createTwitchVodMetadata };
