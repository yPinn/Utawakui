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
    'youtube-official-mv': 'Official MV',
    'youtube-live': '現場演出',
    'youtube-other': '影片',
  };
  return labels[kind] || '來源';
}

export function confidenceLabel(confidence) {
  const labels = {
    high: '吻合度高',
    medium: '吻合度中',
    low: '吻合度低',
  };
  return labels[confidence] || '一般吻合';
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

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = String(rounded % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}
