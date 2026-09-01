const ALLOWED_VALUES = Object.freeze({
  fontFamily: new Set(['sans', 'serif', 'rounded']),
  fontScale: new Set(['small', 'medium', 'large']),
  fontWeight: new Set(['regular', 'semibold', 'bold']),
  alignment: new Set(['left', 'center', 'right']),
  surface: new Set(['transparent', 'soft', 'solid']),
  furigana: new Set(['auto', 'off']),
});

export const OVERLAY_APPEARANCE_DEFAULTS = Object.freeze({
  fontFamily: 'sans',
  fontScale: 'medium',
  fontWeight: 'semibold',
  alignment: 'left',
  surface: 'transparent',
  furigana: 'auto',
});

export function normalizeOverlayAppearance(settings = {}) {
  return Object.fromEntries(
    Object.entries(OVERLAY_APPEARANCE_DEFAULTS).map(([key, fallback]) => [
      key,
      ALLOWED_VALUES[key].has(settings[key]) ? settings[key] : fallback,
    ]),
  );
}

export function applyOverlayAppearance(document, slot) {
  const root = document?.documentElement;
  if (!root) return;
  const appearance = normalizeOverlayAppearance(slot?.settings);
  root.dataset.ovlFont = appearance.fontFamily;
  root.dataset.ovlScale = appearance.fontScale;
  root.dataset.ovlWeight = appearance.fontWeight;
  root.dataset.ovlAlign = appearance.alignment;
  root.dataset.ovlSurface = appearance.surface;
  root.dataset.ovlFurigana = appearance.furigana;
  root.dataset.ovlTemplate = slot?.templateId ?? '';
}

export function overlayAppearanceOptionIds() {
  return Object.fromEntries(
    Object.entries(ALLOWED_VALUES).map(([key, values]) => [key, [...values]]),
  );
}
