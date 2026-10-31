import { t } from './i18n.js';
import { formatLyricsSourceLabel as formatSourceLabel } from './lyrics.js';

// Keep renderer locale dependencies outside the Main-consumed lyrics parser.
export function formatLyricsSourceLabel(source) {
  return formatSourceLabel(
    source,
    source.kind === 'kugou' ? t('lyricsAcquisition.kugou') : undefined,
  );
}
