import { formatGroupedInteger } from './format.js';
import { catalogKey, t } from './i18n.js';
import { UI_LOCALE } from './uiLocale.js';

export function candidateId(candidate) {
  return candidate?.playbackVideoId || candidate?.id || '';
}

const PLAYBACK_KINDS = new Set([
  'yt-music-song',
  'youtube-topic-audio',
  'youtube-official-audio',
  'yt-music-source',
  'youtube-lyric-video',
  'youtube-official-mv',
  'youtube-live',
  'youtube-variant',
  'youtube-other',
]);

export function playbackKindLabel(kind) {
  return PLAYBACK_KINDS.has(kind)
    ? t(`import.candidate.kinds.${catalogKey(kind)}`)
    : t('import.candidate.kindFallback');
}

// Compact notation gives each locale its own units (萬／億, K／M).
const COMPACT_FORMATTER = new Intl.NumberFormat(UI_LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatViewCount(value) {
  if (!Number.isFinite(value) || value < 0) return '';
  const count = Math.floor(value);
  if (count >= 10_000) {
    return t('import.candidate.viewsCompact', {
      count: COMPACT_FORMATTER.format(count),
    });
  }
  return t(
    'import.candidate.views',
    { count: formatGroupedInteger(count, '') },
    count,
  );
}

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
  if (!identity) return t('import.candidate.identity.pending');
  return identity.confidence === 'low'
    ? t('import.candidate.identity.review')
    : t('import.candidate.identity.identified');
}

export function identityStatusClass(identity) {
  if (!identity) return 'pending';
  return identity.confidence === 'low' ? 'review' : 'identified';
}
