import { cutoutPortraitTone } from '../../../shared/outputAppearance.mjs';

const portraitColorTokens = {
  indigo: '--ui-output-portrait-indigo',
  plum: '--ui-output-portrait-plum',
  red: '--ui-output-portrait-red',
  amber: '--ui-output-portrait-amber',
};

export function cutoutPortraitColorToken(artist, trackId) {
  return portraitColorTokens[cutoutPortraitTone(artist, trackId)];
}
