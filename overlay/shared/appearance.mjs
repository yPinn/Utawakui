import {
  normalizeOutputAppearance,
  OUTPUT_APPEARANCE_DEFAULTS,
  outputAppearanceOptionIds,
} from '../../shared/outputAppearance.mjs';

export const OVERLAY_APPEARANCE_DEFAULTS = OUTPUT_APPEARANCE_DEFAULTS;

export function normalizeOverlayAppearance(settings = {}, options = {}) {
  return normalizeOutputAppearance(settings, options);
}

export function applyOverlayAppearance(document, slot) {
  const root = document?.documentElement;
  if (!root) return;
  const templateId = slot?.templateId ?? '';
  const appearance = normalizeOverlayAppearance(slot?.settings, {
    templateId,
  });

  root.dataset.ovlPalette = appearance.paletteId;
  root.dataset.ovlFont = appearance.fontFamily;
  root.dataset.ovlScale = appearance.fontScale;
  root.dataset.ovlWeight = appearance.fontWeight;
  root.dataset.ovlAlign = appearance.alignment;
  root.dataset.ovlSurface = appearance.surface;
  root.dataset.ovlFurigana = appearance.furigana;
  root.dataset.ovlKineticMaterial = appearance.kineticMaterial;
  root.dataset.ovlKineticArrangement = appearance.kineticArrangement;
  root.dataset.ovlContrast = appearance.contrastStyle;
  root.dataset.ovlDensity = appearance.spacingDensity;
  root.dataset.ovlContentWidth = appearance.contentWidth;
  root.dataset.ovlPosition = appearance.positionAnchor;
  root.dataset.ovlTemplate = templateId;

  const usesOrnatePaletteDefaults =
    templateId === 'ornate-vertical' && appearance.paletteId !== 'original';
  const textColor =
    usesOrnatePaletteDefaults &&
    appearance.textColor === OUTPUT_APPEARANCE_DEFAULTS.textColor
      ? 'var(--ovl-color-ornate-paper)'
      : appearance.textColor;
  const accentColor =
    usesOrnatePaletteDefaults &&
    appearance.accentColor === OUTPUT_APPEARANCE_DEFAULTS.accentColor
      ? 'var(--ovl-color-ornate-echo)'
      : appearance.accentColor;

  root.style?.setProperty?.('--ovl-user-text-color', textColor);
  root.style?.setProperty?.('--ovl-user-accent-color', accentColor);
  root.style?.setProperty?.(
    '--ovl-user-position-x',
    `${appearance.positionOffsetX}%`,
  );
  root.style?.setProperty?.(
    '--ovl-user-position-y',
    `${appearance.positionOffsetY}%`,
  );
}

export function overlayAppearanceOptionIds() {
  return outputAppearanceOptionIds();
}
