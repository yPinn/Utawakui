// These values mirror CSS sizing tokens for places where Vue component props
// need numbers instead of CSS lengths.
export const ICON_SIZE = 16;
// Pixel mirror of the --ui-artwork-size-* ramp in src/styles/tokens.css.
export const ARTWORK_SIZE = Object.freeze({
  '2xs': 36,
  xs: 40,
  sm: 48,
  md: 64,
  lg: 80,
  xl: 136,
  '2xl': 160,
  '3xl': 224,
  hero: 320,
});
export const PLAYLIST_ROW_THUMB_SIZE = ARTWORK_SIZE.xs;
export const PLAYER_BAR_ARTWORK_SIZE = ARTWORK_SIZE.sm;
export const FOLDER_DOSSIER_ARTWORK_SIZE = ARTWORK_SIZE.xl;
