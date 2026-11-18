import {
  isOutputLocalFont,
  normalizeOutputAppearance,
  normalizeOutputElementAppearance,
  ornateSectionAccentColor,
  OUTPUT_APPEARANCE_DEFAULTS,
  OUTPUT_LOOK_PRESETS,
  outputArtworkGradeMatrix,
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
const LOOK_COLOR_ROLES = [
  ...new Set(
    Object.values(OUTPUT_LOOK_PRESETS).flatMap(({ colors }) =>
      Object.keys(colors ?? {}),
    ),
  ),
];
const GRAIN_FREQUENCY = Object.freeze({
  fine: 0.72,
  medium: 0.46,
  coarse: 0.24,
});
const SVG_NS = 'http://www.w3.org/2000/svg';
const GRAIN_FILTER_IDS = {
  look: 'output-look-grain',
  material: 'output-film-grain',
};
const filterNodesByDocument = new WeakMap();
const COMPOSITION_GRADE_TEMPLATES = new Set([
  'centered-vertical',
  'chalkboard-vertical',
  'phantom-thieves',
  'fisheye-lens',
  'receipt-setlist',
]);

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

function applyLook(document, root, templateId, lookId, strength) {
  const { colors } = OUTPUT_LOOK_PRESETS[lookId];
  root.dataset.ovlPalette = lookId;
  for (const role of LOOK_COLOR_ROLES) {
    setOrRemoveProperty(root, `--ovl-look-color-${role}`, colors?.[role]);
  }
  root.style?.setProperty?.('--ovl-look-amount', `${strength}%`);

  const gradeComposition = COMPOSITION_GRADE_TEMPLATES.has(templateId);
  const compositionGrade = gradeComposition
    ? outputArtworkGradeMatrix(lookId, strength, { composition: true })
    : undefined;
  const compositionMatrix =
    compositionGrade && compositionGradeMatrix(document);
  if (compositionMatrix) {
    compositionMatrix.setAttribute('values', compositionGrade.join(' '));
    root.dataset.ovlCompositionGrade = 'on';
  } else {
    delete root.dataset.ovlCompositionGrade;
  }

  const artworkMatrix = document.getElementById?.(
    'output-artwork-grade-matrix',
  );
  if (!artworkMatrix) return;
  const grade = outputArtworkGradeMatrix(lookId, strength);
  if (grade) {
    artworkMatrix.setAttribute('values', grade.join(' '));
    root.dataset.ovlArtworkGrade = 'on';
  } else {
    delete root.dataset.ovlArtworkGrade;
  }
}

function svgElement(document, tag, attributes) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

function filterNodes(document) {
  if (!document.createElementNS || !document.body) return;
  let nodes = filterNodesByDocument.get(document);
  if (!nodes) {
    const svg = svgElement(document, 'svg', {
      'aria-hidden': 'true',
      width: '0',
      height: '0',
      class: 'output-filter-definitions',
    });
    document.body.append(svg);
    nodes = { svg };
    filterNodesByDocument.set(document, nodes);
  }
  return nodes;
}

function compositionGradeMatrix(document) {
  const nodes = filterNodes(document);
  if (!nodes) return;
  if (!nodes.grade) {
    const filter = svgElement(document, 'filter', {
      id: 'output-composition-grade',
      'color-interpolation-filters': 'sRGB',
    });
    nodes.grade = svgElement(document, 'feColorMatrix', { type: 'matrix' });
    filter.append(nodes.grade);
    nodes.svg.append(filter);
  }
  return nodes.grade;
}

function grainFilter(document, layer) {
  const nodes = filterNodes(document);
  if (!nodes) return;
  if (nodes[layer]) return nodes[layer];

  const id = GRAIN_FILTER_IDS[layer];
  const filter = svgElement(document, 'filter', {
    id,
    'color-interpolation-filters': 'sRGB',
    x: '0%',
    y: '0%',
    width: '100%',
    height: '100%',
  });
  const noise = svgElement(document, 'feTurbulence', {
    type: 'fractalNoise',
    numOctaves: '1',
    seed: layer === 'look' ? '31' : '17',
  });
  const levels = svgElement(document, 'feColorMatrix', {
    type: 'matrix',
    result: 'noise',
  });
  const source = svgElement(document, 'feColorMatrix', {
    in: 'SourceGraphic',
    type: 'matrix',
    result: 'opaque',
  });
  filter.append(
    noise,
    levels,
    source,
    svgElement(document, 'feBlend', {
      in: 'noise',
      in2: 'opaque',
      mode: 'soft-light',
      result: 'textured',
    }),
    svgElement(document, 'feComposite', {
      in: 'textured',
      in2: 'SourceAlpha',
      operator: 'in',
    }),
  );
  nodes.svg.append(filter);
  nodes[layer] = { id, noise, levels, source };
  return nodes[layer];
}

function applyGrainLayer(document, layer, amount, size) {
  if (!amount) return;
  const filter = grainFilter(document, layer);
  if (!filter) return;
  const { id, noise, levels, source } = filter;
  const reference = `url('#${id}')`;
  if (filter.amount === amount && filter.size === size) return reference;
  filter.amount = amount;
  filter.size = size;
  const weight = amount / 3;
  const channel = [weight, weight, weight, 0, (1 - amount) / 2];
  // Give white and black a little room for grain. The last primitive restores alpha.
  const edge = amount * 0.065;
  const gain = 1 - edge * 2;
  noise.setAttribute('baseFrequency', String(GRAIN_FREQUENCY[size]));
  levels.setAttribute(
    'values',
    [...channel, ...channel, ...channel, 0, 0, 0, 0, 1].join(' '),
  );
  source.setAttribute(
    'values',
    [
      gain,
      0,
      0,
      0,
      edge,
      0,
      gain,
      0,
      0,
      edge,
      0,
      0,
      gain,
      0,
      edge,
      0,
      0,
      0,
      0,
      1,
    ].join(' '),
  );
  return reference;
}

function applyGrains(document, root, lookId, appearance) {
  const preset = OUTPUT_LOOK_PRESETS[lookId].grain;
  const look =
    preset &&
    applyGrainLayer(
      document,
      'look',
      (preset.amount * appearance.lookAmount) / 10000,
      preset.size,
    );
  const material = applyGrainLayer(
    document,
    'material',
    appearance.filmGrainAmount / 100,
    appearance.filmGrainSize,
  );
  const filters = [look, material].filter(Boolean).join(' ');
  setOrRemoveProperty(root, '--ovl-grain-filters', filters || undefined);
  if (filters) root.dataset.ovlGrain = 'on';
  else delete root.dataset.ovlGrain;
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

  const lookId =
    appearance.lookAmount === 0 ? 'original' : appearance.paletteId;
  applyLook(document, root, templateId, lookId, appearance.lookAmount);
  applyGrains(document, root, lookId, appearance);
  const localFont = isOutputLocalFont(appearance.fontFamily);
  root.dataset.ovlFont = localFont ? 'local' : appearance.fontFamily;
  root.dataset.ovlScale = appearance.fontScale;
  root.dataset.ovlWeight = appearance.fontWeight;
  root.dataset.ovlAlign = appearance.alignment;
  root.dataset.ovlSurface = appearance.surface;
  if (templateId === 'art-card')
    root.dataset.vinylSurfaceLight = appearance.vinylSurfaceLight;
  else delete root.dataset.vinylSurfaceLight;
  root.dataset.ovlFurigana = appearance.furigana;
  root.dataset.ovlKineticMaterial = appearance.kineticMaterial;
  root.dataset.ovlKineticArrangement = appearance.kineticArrangement;
  root.dataset.ovlContrast = appearance.contrastStyle;
  root.dataset.ovlTextShadow = appearance.textShadow;
  root.dataset.ovlSectionAccent = appearance.sectionAccent;
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
    templateId === 'ornate-vertical' && lookId !== 'original';
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
    '--ovl-ornate-section-accent',
    ornateSectionAccentColor(appearance),
  );
  root.style?.setProperty?.(
    '--ovl-user-chalkboard-rule-color',
    appearance.chalkboardRuleColor,
  );
  const localFontFamily = outputLocalFontCssValue(appearance.fontFamily);
  setOrRemoveProperty(root, '--ovl-user-local-font-family', localFontFamily);
  setOrRemoveProperty(
    root,
    '--ovl-local-font-prefix',
    localFontFamily === undefined ? undefined : `${localFontFamily},`,
  );
  root.style?.setProperty?.(
    '--ovl-user-position-x',
    `${appearance.positionOffsetX}%`,
  );
  root.style?.setProperty?.(
    '--ovl-user-position-x-viewport',
    `${appearance.positionOffsetX}vw`,
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
