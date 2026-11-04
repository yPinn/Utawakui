import { t } from './i18n.js';
import {
  FEEDBACK_KINDS,
  MAX_TRACK_LABEL_LENGTH,
} from '../constants/feedback.js';

function singleLine(value, limit = 160) {
  if (typeof value !== 'string') return '';
  return Array.from(value.slice(0, limit * 2))
    .filter(
      (character) =>
        character.codePointAt(0) >= 32 && character.codePointAt(0) !== 127,
    )
    .join('')
    .trim()
    .slice(0, limit);
}

function identity(artist, title) {
  return [singleLine(artist), singleLine(title)].filter(Boolean).join(' - ');
}

// Only visible scalar context becomes user-editable text. No lyrics, filenames,
// URLs, fingerprints, timing documents or arbitrary object serialization.
export function buildLyricsIssueReport({
  track,
  candidate,
  source,
  tier,
  offsetMs,
} = {}) {
  const provider = candidate ? candidate.providerId : source?.kind;
  const names = {
    kugou: t('lyricsAcquisition.kugou'),
    lrclib: 'LRCLIB',
    netease: t('lyricsAcquisition.netease'),
    betterlyrics: 'Better Lyrics',
  };
  const name = Object.hasOwn(names, provider)
    ? names[provider]
    : candidate
      ? t('lyricsSource.issue.online')
      : t('lyricsSource.issue.local');
  const recordId = candidate ? candidate.id : source?.provider?.recordId;
  const id =
    ['lrclib', 'netease'].includes(provider) &&
    Number.isSafeInteger(recordId) &&
    recordId > 0
      ? ` #${recordId}`
      : '';
  const level = candidate ? candidate.capability?.level : tier;
  const capability = ['T0', 'T1', 'T2'].includes(level)
    ? candidate?.capability?.partial
      ? t('lyricsSource.issue.partial', { level })
      : level
    : t('lyricsSource.issue.unconfirmed');
  const lines = [
    t('lyricsSource.issue.heading'),
    t('lyricsSource.issue.location', {
      value: candidate
        ? t('lyricsSource.issue.candidate')
        : t('lyricsSource.issue.saved'),
    }),
    t('lyricsSource.issue.source', { value: `${name}${id}` }),
    ...(candidate
      ? [
          t('lyricsSource.issue.song', {
            value:
              identity(candidate.artistName, candidate.trackName) ||
              t('common.none'),
          }),
        ]
      : []),
    t('lyricsSource.issue.level', { value: capability }),
    ...(!candidate &&
    Number.isSafeInteger(offsetMs) &&
    Math.abs(offsetMs) <= 86400000
      ? [
          t('lyricsSource.issue.offset', {
            value: `${offsetMs > 0 ? '+' : ''}${offsetMs}`,
          }),
        ]
      : []),
    '',
    t('lyricsSource.issue.where'),
    t('lyricsSource.issue.actual'),
    t('lyricsSource.issue.expected'),
    t('lyricsSource.issue.steps'),
  ];
  return {
    kind: FEEDBACK_KINDS.CONTENT,
    trackLabel: identity(track?.artist, track?.title).slice(
      0,
      MAX_TRACK_LABEL_LENGTH,
    ),
    description: lines.join('\n'),
  };
}
