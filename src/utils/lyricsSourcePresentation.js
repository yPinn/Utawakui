import { t } from './i18n.js';
import {
  formatLyricsSourceLabel as formatSourceLabel,
  lyricsSourceDisplayTier,
} from './lyrics.js';

const LOCAL_KINDS = new Set(['manual', 'authored']);
const TIER_KEYS = { T0: 't0', T1: 't1', 'T1+': 't1Plus', T2: 't2' };
const tierKey = (tier) =>
  Object.hasOwn(TIER_KEYS, tier) ? TIER_KEYS[tier] : 'unknown';
const SOURCE_CODES = new Map([
  ['lrclib', 'A'],
  ['netease', 'B'],
  ['kugou', 'C'],
  ['betterlyrics', 'D'],
  ['youtube-cc', 'E'],
  ['manual', 'L'],
  ['authored', 'M'],
]);
const LEGACY_LABELS = new Map([
  ['lrclib', /^LRCLIB(?:\s*\/\s*|$)/iu],
  ['netease', /^(?:NetEase Cloud Music|網易雲音樂|网易云音乐)(?:\s*\/\s*|$)/iu],
  ['kugou', /^(?:Kugou Music|酷狗音樂|酷狗音乐)(?:\s*\/\s*|$)/iu],
  ['betterlyrics', /^Better Lyrics(?:\s*\/\s*|$)/iu],
  ['youtube-cc', /^YouTube CC(?:\s*\/\s*|$)/iu],
]);

function formatSourceCode(code) {
  return t('lyricsSource.control.sourceCode', { code });
}

export function lyricsProviderAlias(providerId) {
  return formatSourceCode(SOURCE_CODES.get(providerId) ?? 'X');
}

export function lyricsSourceVersionName(source) {
  const label = source.label?.trim() ?? '';
  const legacy = LEGACY_LABELS.get(source.kind);
  return legacy ? label.replace(legacy, '').trim() : label;
}

export function formatLyricsSourceName(source) {
  const name =
    lyricsSourceVersionName(source) ||
    (source.kind === 'manual'
      ? t('lyricsAcquisition.manual')
      : source.kind === 'authored'
        ? t('lyricsAcquisition.authored')
        : t('lyricsSource.control.unnamed'));
  return source.language && source.language !== 'und'
    ? t('lyricsSource.control.languageChoice', {
        name,
        language: source.language.toUpperCase(),
      })
    : name;
}

export function describePlaybackLyricsSources(sources) {
  const groups = new Map();
  const choices = new Map();
  for (const source of sources) {
    const local = LOCAL_KINDS.has(source.kind);
    const name = formatLyricsSourceName(source);
    const timing = t(
      `lyricsSource.compactTier.${tierKey(lyricsSourceDisplayTier(source))}`,
    );
    const base = t('lyricsSource.control.playbackChoice', { name, timing });
    const code = SOURCE_CODES.get(source.kind) ?? 'X';
    const entry = { filename: source.filename, base, code, local };
    const group = groups.get(base) ?? [];
    group.push(entry);
    groups.set(base, group);
  }
  for (const group of groups.values()) {
    const codeCounts = new Map();
    for (const { code } of group)
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    const occurrences = new Map();
    const ordered = [...group].sort((a, b) =>
      a.filename.localeCompare(b.filename, 'en'),
    );
    for (const { filename, base, code, local } of ordered) {
      const ordinal = (occurrences.get(code) ?? 0) + 1;
      occurrences.set(code, ordinal);
      const alias = formatSourceCode(
        codeCounts.get(code) > 1 ? `${code}${ordinal}` : code,
      );
      choices.set(filename, {
        label:
          group.length > 1
            ? t('lyricsSource.control.withSourceCode', {
                name: base,
                alias,
              })
            : base,
        alias: !local || group.length > 1 ? alias : '',
      });
    }
  }
  return choices;
}

// Keep renderer locale dependencies outside the Main-consumed lyrics parser.
export function formatLyricsSourceLabel(source, alias) {
  if (LOCAL_KINDS.has(source.kind) && !alias) {
    const kind =
      source.kind === 'manual'
        ? t('lyricsAcquisition.manual')
        : t('lyricsAcquisition.authored');
    return formatSourceLabel(source, kind);
  }
  return t('lyricsSource.control.withSourceCode', {
    name: formatLyricsSourceName(source),
    alias: alias || lyricsProviderAlias(source.kind),
  });
}

export function formatLyricsSourceTier(tier) {
  return t(`lyricsSource.tier.${tierKey(tier)}`);
}

export function describeLyricsSourceTier(tier) {
  return t(`lyricsSource.tierHelp.${tierKey(tier)}`);
}
