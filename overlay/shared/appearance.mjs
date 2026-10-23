import {
  isOutputLocalFont,
  normalizeOutputAppearance,
  normalizeOutputElementAppearance,
  OUTPUT_APPEARANCE_DEFAULTS,
  outputAppearanceOptionIds,
  outputElementFontWeight,
  outputLocalFontCssValue,
} from '../../shared/outputAppearance.mjs';
import { OUTPUT_TEMPLATE_ELEMENTS } from '../../shared/outputTemplateElements.mjs';

const ELEMENT_IDS = [
  ...new Set(
    Object.values(OUTPUT_TEMPLATE_ELEMENTS)
      .flat()
      .map(({ id }) => id),
  ),
];

function elementVisibleDatasetKey(elementId) {
  const name = elementId.replace(/(?:^|-)([a-z])/gu, (_, letter) =>
    letter.toUpperCase(),
  );
  return `ovlEl${name}Visible`;
}

function setOrRemoveProperty(root, name, value) {
  if (value === undefined) root.style?.removeProperty?.(name);
  else root.style?.setProperty?.(name, value);
}

// Element values follow the active template; undeclared elements are cleared.
function applyElementAppearance(root, templateId, settings) {
  const values = normalizeOutputElementAppearance(settings, { templateId });
  for (const id of ELEMENT_IDS) {
    const weight = outputElementFontWeight(values[`element.${id}.fontWeight`]);
    const scale = values[`element.${id}.fontSizeScale`];
    setOrRemoveProperty(
      root,
      `--ovl-el-${id}-font-weight`,
      weight === undefined ? undefined : String(weight),
    );
    setOrRemoveProperty(
      root,
      `--ovl-el-${id}-size-scale`,
      scale === undefined || scale === 100 ? undefined : String(scale / 100),
    );
    const datasetKey = elementVisibleDatasetKey(id);
    if (values[`element.${id}.visible`] === 'hidden') {
      root.dataset[datasetKey] = 'hidden';
    } else {
      delete root.dataset[datasetKey];
    }
  }
}

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
  const localFont = isOutputLocalFont(appearance.fontFamily);
  root.dataset.ovlFont = localFont ? 'local' : appearance.fontFamily;
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
  applyElementAppearance(root, templateId, slot?.settings);
  root.dataset.ovlReceiptDirection = appearance.receiptDirection;
  root.dataset.ovlReceiptReview = appearance.receiptReview;
  root.dataset.ovlReceiptReviewInterval = String(
    appearance.receiptReviewInterval,
  );

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
  if (localFont) {
    root.style?.setProperty?.(
      '--ovl-user-local-font-family',
      outputLocalFontCssValue(appearance.fontFamily),
    );
  } else {
    root.style?.removeProperty?.('--ovl-user-local-font-family');
  }
  root.style?.setProperty?.('--ovl-look-amount', `${appearance.lookAmount}%`);
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

// Observe the browser's existing font pipeline; never load files or delay first render.
export function createOverlayFontObserver(document, onSettled) {
  const fonts = document?.fonts;
  let disposed = false;
  const ready = () => {
    if (!disposed) onSettled('ready');
  };
  const fallback = () => {
    if (!disposed) onSettled('fallback');
  };
  if (!fonts) {
    fallback();
    return () => {
      disposed = true;
    };
  }
  fonts.addEventListener?.('loadingdone', ready);
  fonts.addEventListener?.('loadingerror', fallback);
  Promise.resolve(fonts.ready).then(ready, fallback);
  return () => {
    if (disposed) return;
    disposed = true;
    fonts.removeEventListener?.('loadingdone', ready);
    fonts.removeEventListener?.('loadingerror', fallback);
  };
}
