export function candidateId(candidate) {
  return candidate?.playbackVideoId || candidate?.id || '';
}

export function playbackKindLabel(kind) {
  const labels = {
    'yt-music-song': '音樂版',
    'youtube-topic-audio': '官方音源',
    'youtube-official-audio': '官方音源',
    'yt-music-source': 'YT Music 來源',
    'youtube-lyric-video': '歌詞影片',
    'youtube-official-mv': 'MV',
    'youtube-live': 'Live',
    'youtube-variant': '其他版本',
    'youtube-other': '影片',
  };
  return labels[kind] || '來源';
}

const INTEGER_FORMATTER = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 0,
});
const COMPACT_FORMATTER = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 1,
});

export function formatViewCount(value) {
  if (!Number.isFinite(value) || value < 0) return '';
  const count = Math.floor(value);
  if (count >= 100_000_000) {
    return `${COMPACT_FORMATTER.format(count / 100_000_000)} 億次觀看`;
  }
  if (count >= 10_000) {
    return `${COMPACT_FORMATTER.format(count / 10_000)} 萬次觀看`;
  }
  return `${INTEGER_FORMATTER.format(count)} 次觀看`;
}

export function platformLabel(candidate) {
  if (candidate?.isSource) return '貼上的來源';
  if (candidate?.availableProviders?.includes('yt-music')) return 'YT Music';
  if (candidate?.searchProvider === 'yt-music') return 'YT Music';
  if (candidate?.searchProvider === 'youtube') return 'YouTube';
  if (candidate?.playbackKind?.startsWith('yt-music')) return 'YT Music';
  return 'YouTube';
}

export { platformLabel as candidateSourceLabel };

export function identityTitle(identity, fallback = '') {
  return identity?.title || fallback || '';
}

export function identityArtistLabel(identity, fallback = '') {
  if (Array.isArray(identity?.artists) && identity.artists.length > 0) {
    return identity.artists.join(', ');
  }
  return identity?.artist || fallback || '';
}

export function identityStatusLabel(identity) {
  if (!identity) return '待辨識';
  return identity.confidence === 'low' ? '需確認' : '已辨識';
}

export function identityStatusClass(identity) {
  if (!identity) return 'pending';
  return identity.confidence === 'low' ? 'review' : 'identified';
}
