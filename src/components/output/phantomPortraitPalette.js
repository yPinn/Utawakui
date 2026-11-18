import { phantomPortraitTone } from '../../../shared/outputAppearance.mjs';

const portraitColorTokens = {
  indigo: '--ui-output-portrait-indigo',
  plum: '--ui-output-portrait-plum',
  red: '--ui-output-portrait-red',
  amber: '--ui-output-portrait-amber',
};

export function phantomPortraitColorToken(artist, trackId) {
  return portraitColorTokens[phantomPortraitTone(artist, trackId)];
}
