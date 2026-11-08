import { t } from './i18n.js';
import { formatLyricsSourceLabel as formatSourceLabel } from './lyrics.js';

const CATALOG_KINDS = new Set(['kugou', 'netease', 'manual', 'authored']);
const TIER_KEYS = { T0: 't0', T1: 't1', 'T1+': 't1Plus', T2: 't2' };
const tierKey = (tier) =>
  Object.hasOwn(TIER_KEYS, tier) ? TIER_KEYS[tier] : 'unknown';

// Keep renderer locale dependencies outside the Main-consumed lyrics parser.
export function formatLyricsSourceLabel(source) {
  return formatSourceLabel(
    source,
    CATALOG_KINDS.has(source.kind)
      ? t(`lyricsAcquisition.${source.kind}`)
      : undefined,
  );
}

export function formatLyricsSourceTier(tier) {
  return t(`lyricsSource.tier.${tierKey(tier)}`);
}

export function describeLyricsSourceTier(tier) {
  return t(`lyricsSource.tierHelp.${tierKey(tier)}`);
}
