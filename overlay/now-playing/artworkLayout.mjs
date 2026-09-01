const ARTWORK_ACCENT_PROPERTY = '--ovl-color-artwork-accent';
const ARTWORK_SECONDARY_PROPERTY = '--ovl-color-artwork-secondary';
const ARTWORK_TERTIARY_PROPERTY = '--ovl-color-artwork-tertiary';
const ARTWORK_SHADOW_MASK_PROPERTY =
  '--ovl-template-artwork-record-shadow-mask';
const ARTWORK_HIGHLIGHT_MASK_PROPERTY =
  '--ovl-template-artwork-record-highlight-mask';
const ARTWORK_INK_PROPERTY = '--ovl-template-artwork-record-ink';
const MIN_ALPHA = 192;
const MIN_CHROMA = 0.12;
const MIN_LIGHTNESS = 0.08;
const MAX_LIGHTNESS = 0.92;
const MIN_OUTPUT_SATURATION = 0.38;
const MAX_OUTPUT_SATURATION = 0.72;
const MIN_OUTPUT_LIGHTNESS = 0.48;
const MAX_OUTPUT_LIGHTNESS = 0.62;
const COPY_SAMPLE_START = 0.55;
const DARK_COPY_LUMINANCE = 0.62;
const ARTWORK_LABEL_PROPERTY = '--ovl-color-artwork-label';
const MAX_PALETTE_COLORS = 3;
const MIN_PALETTE_HUE_DISTANCE = 28;
const MIN_PALETTE_LIGHTNESS_DISTANCE = 0.14;
const VINYL_PATTERN_COLORS = [
  'var(--ovl-color-artwork-accent)',
  'var(--ovl-color-artwork-secondary)',
  'var(--ovl-color-artwork-tertiary)',
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;

  if (chroma > 0) {
    if (maximum === red) hue = ((green - blue) / chroma) % 6;
    else if (maximum === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness, chroma };
}

function hslToRgb({ hue, saturation, lightness }) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = lightness - chroma / 2;
  let channels;

  if (hueSection < 1) channels = [chroma, secondary, 0];
  else if (hueSection < 2) channels = [secondary, chroma, 0];
  else if (hueSection < 3) channels = [0, chroma, secondary];
  else if (hueSection < 4) channels = [0, secondary, chroma];
  else if (hueSection < 5) channels = [secondary, 0, chroma];
  else channels = [chroma, 0, secondary];

  return {
    r: Math.round((channels[0] + match) * 255),
    g: Math.round((channels[1] + match) * 255),
    b: Math.round((channels[2] + match) * 255),
  };
}

function constrainAccent(color) {
  const hsl = rgbToHsl(color);
  return hslToRgb({
    hue: hsl.hue,
    saturation: clamp(
      hsl.saturation,
      MIN_OUTPUT_SATURATION,
      MAX_OUTPUT_SATURATION,
    ),
    lightness: clamp(hsl.lightness, MIN_OUTPUT_LIGHTNESS, MAX_OUTPUT_LIGHTNESS),
  });
}

function collectArtworkColorBuckets(pixelData) {
  if (!pixelData || pixelData.length < 4) return [];
  const buckets = new Map();
  for (let index = 0; index + 3 < pixelData.length; index += 4) {
    const alpha = pixelData[index + 3];
    if (alpha < MIN_ALPHA) continue;

    const color = {
      r: pixelData[index],
      g: pixelData[index + 1],
      b: pixelData[index + 2],
    };
    const hsl = rgbToHsl(color);
    if (
      hsl.chroma < MIN_CHROMA ||
      hsl.lightness < MIN_LIGHTNESS ||
      hsl.lightness > MAX_LIGHTNESS
    )
      continue;

    const key = `${color.r >> 4}:${color.g >> 4}:${color.b >> 4}`;
    const bucket = buckets.get(key) ?? {
      count: 0,
      red: 0,
      green: 0,
      blue: 0,
      saturation: 0,
      lightness: 0,
    };
    bucket.count += 1;
    bucket.red += color.r;
    bucket.green += color.g;
    bucket.blue += color.b;
    bucket.saturation += hsl.saturation;
    bucket.lightness += hsl.lightness;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const saturation = bucket.saturation / bucket.count;
      const lightness = bucket.lightness / bucket.count;
      const midpointWeight = 1 - Math.abs(lightness - 0.55) * 0.5;
      const score = bucket.count * (0.65 + saturation) * midpointWeight;
      const color = {
        r: bucket.red / bucket.count,
        g: bucket.green / bucket.count,
        b: bucket.blue / bucket.count,
      };
      return { color: constrainAccent(color), hsl: rgbToHsl(color), score };
    })
    .sort((left, right) => right.score - left.score);
}

function hueDistance(left, right) {
  const distance = Math.abs(left - right);
  return Math.min(distance, 360 - distance);
}

function paletteColorsAreDistinct(left, right) {
  return (
    hueDistance(left.hsl.hue, right.hsl.hue) >= MIN_PALETTE_HUE_DISTANCE ||
    Math.abs(left.hsl.lightness - right.hsl.lightness) >=
      MIN_PALETTE_LIGHTNESS_DISTANCE
  );
}

export function selectArtworkPalette(pixelData, { maxColors = 3 } = {}) {
  const limit = Math.round(clamp(maxColors, 1, MAX_PALETTE_COLORS));
  const selected = [];
  for (const candidate of collectArtworkColorBuckets(pixelData)) {
    if (!selected.every((color) => paletteColorsAreDistinct(color, candidate)))
      continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected.map(({ color }) => color);
}

export function selectArtworkAccent(pixelData) {
  return selectArtworkPalette(pixelData, { maxColors: 1 })[0] ?? null;
}

function hashTrackId(trackId) {
  const value = typeof trackId === 'string' ? trackId.trim() : '';
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function decimal(value) {
  return Number(value.toFixed(2));
}

function pointText(point) {
  return `${point.x} ${point.y}`;
}

function pointFromAngle(origin, distance, angleDegrees) {
  const angle = (angleDegrees * Math.PI) / 180;
  return {
    x: decimal(origin.x + Math.cos(angle) * distance),
    y: decimal(origin.y + Math.sin(angle) * distance),
  };
}

function createContourRibbon(random, role, index, count, phase) {
  const isShadow = role === 'shadow';
  const width = decimal(isShadow ? 8 + random() * 6 : 5 + random() * 5);
  const radius = decimal(isShadow ? 33 + random() * 10.5 : 32 + random() * 12);
  const startAngle = decimal(
    phase + (index / count) * 360 + (random() - 0.5) * 24,
  );
  const span = decimal(isShadow ? 48 + random() * 62 : 34 + random() * 54);
  const origin = {
    x: decimal(50 + (random() - 0.5) * 14),
    y: decimal(50 + (random() - 0.5) * 14),
  };
  const middleAngle = startAngle + span / 2;
  const firstControlAngle = startAngle + span / 4;
  const secondControlAngle = startAngle + (span * 3) / 4;
  const finishAngle = startAngle + span;
  const outerRadius = radius + width / 2;
  const innerRadius = Math.max(20, radius - width / 2);
  const outerBulge = decimal((random() - 0.35) * width * 0.72);
  const innerBulge = decimal((random() - 0.65) * width * 0.62);
  const outerStart = pointFromAngle(origin, outerRadius, startAngle);
  const outerFirstControl = pointFromAngle(
    origin,
    outerRadius + outerBulge * 0.45,
    firstControlAngle,
  );
  const outerMiddle = pointFromAngle(
    origin,
    outerRadius + outerBulge,
    middleAngle,
  );
  const outerSecondControl = pointFromAngle(
    origin,
    outerRadius + outerBulge * 0.6,
    secondControlAngle,
  );
  const outerFinish = pointFromAngle(origin, outerRadius, finishAngle);
  const innerFinish = pointFromAngle(origin, innerRadius, finishAngle);
  const innerSecondControl = pointFromAngle(
    origin,
    innerRadius + innerBulge * 0.6,
    secondControlAngle,
  );
  const innerMiddle = pointFromAngle(
    origin,
    innerRadius + innerBulge,
    middleAngle,
  );
  const innerFirstControl = pointFromAngle(
    origin,
    innerRadius + innerBulge * 0.45,
    firstControlAngle,
  );
  const innerStart = pointFromAngle(origin, innerRadius, startAngle);
  const opacity = decimal(
    isShadow ? 0.14 + random() * 0.13 : 0.1 + random() * 0.13,
  );

  return {
    width,
    span,
    opacity,
    path: `M ${pointText(outerStart)} Q ${pointText(outerFirstControl)} ${pointText(outerMiddle)} Q ${pointText(outerSecondControl)} ${pointText(outerFinish)} L ${pointText(innerFinish)} Q ${pointText(innerSecondControl)} ${pointText(innerMiddle)} Q ${pointText(innerFirstControl)} ${pointText(innerStart)} Z`,
  };
}

export function createVinylContourGeometry(trackId) {
  const random = seededRandom(hashTrackId(trackId));
  const shadowCount = 2 + Math.floor(random() * 2);
  const highlightCount = 2 + Math.floor(random() * 2);
  const shadowPhase = random() * 360;
  const highlightPhase = shadowPhase + 28 + random() * 42;
  return {
    shadowContours: Array.from({ length: shadowCount }, (_, index) =>
      createContourRibbon(random, 'shadow', index, shadowCount, shadowPhase),
    ),
    highlightContours: Array.from({ length: highlightCount }, (_, index) =>
      createContourRibbon(
        random,
        'highlight',
        index,
        highlightCount,
        highlightPhase,
      ),
    ),
  };
}

function createVinylInk(trackId) {
  const random = seededRandom(hashTrackId(`${trackId}:ink`));
  return VINYL_PATTERN_COLORS.map((color) => {
    const width = decimal(58 + random() * 28);
    const height = decimal(44 + random() * 30);
    const x = decimal(12 + random() * 76);
    const y = decimal(12 + random() * 76);
    const strength = Math.round(54 + random() * 22);
    const reach = decimal(68 + random() * 18);
    return `radial-gradient(ellipse ${width}% ${height}% at ${x}% ${y}%, color-mix(in srgb, ${color} ${strength}%, transparent) 0%, color-mix(in srgb, ${color} ${Math.max(30, strength - 20)}%, transparent) 44%, transparent ${reach}%)`;
  }).join(', ');
}

const VINYL_ANNULUS_CLIP =
  '<clipPath id="annulus"><path d="M50 2a48 48 0 1 0 0 96a48 48 0 1 0 0-96ZM50 19a31 31 0 1 1 0 62a31 31 0 1 1 0-62Z" fill-rule="evenodd" clip-rule="evenodd"/></clipPath>';

function encodeVinylMask(layer, definitions, content) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-layer="${layer}"><defs>${definitions}${VINYL_ANNULUS_CLIP}</defs><g clip-path="url(#annulus)">${content}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function createContourMask(layer, contours, blur) {
  const content = contours
    .map(
      ({ path, opacity }) =>
        `<path d="${path}" fill="white" opacity="${opacity}" filter="url(#contour-soft)"/>`,
    )
    .join('');
  const filter = `<filter id="contour-soft" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="${blur}"/></filter>`;
  return encodeVinylMask(layer, filter, content);
}

export function createVinylSurface(trackId) {
  const geometry = createVinylContourGeometry(trackId);
  return {
    ink: createVinylInk(trackId),
    shadowMask: createContourMask(
      'shadow-contours',
      geometry.shadowContours,
      3.2,
    ),
    highlightMask: createContourMask(
      'highlight-contours',
      geometry.highlightContours,
      2.6,
    ),
  };
}

function linearizeChannel(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function selectArtworkCopyTone(pixelData, { width, height }) {
  const normalizedWidth = Math.max(1, Math.floor(Number(width) || 0));
  const normalizedHeight = Math.max(1, Math.floor(Number(height) || 0));
  const expectedLength = normalizedWidth * normalizedHeight * 4;
  if (!pixelData || pixelData.length < expectedLength) return 'light';

  const firstRow = Math.floor(normalizedHeight * COPY_SAMPLE_START);
  let luminanceTotal = 0;
  let sampleCount = 0;
  for (let row = firstRow; row < normalizedHeight; row += 1) {
    for (let column = 0; column < normalizedWidth; column += 1) {
      const index = (row * normalizedWidth + column) * 4;
      if (pixelData[index + 3] < MIN_ALPHA) continue;
      luminanceTotal +=
        0.2126 * linearizeChannel(pixelData[index]) +
        0.7152 * linearizeChannel(pixelData[index + 1]) +
        0.0722 * linearizeChannel(pixelData[index + 2]);
      sampleCount += 1;
    }
  }

  if (!sampleCount) return 'light';
  return luminanceTotal / sampleCount >= DARK_COPY_LUMINANCE ? 'dark' : 'light';
}

export function analyzeArtworkPixels(pixelData, { width, height }) {
  const palette = selectArtworkPalette(pixelData);
  return {
    accent: palette[0] ?? null,
    copyTone: selectArtworkCopyTone(pixelData, { width, height }),
    palette,
  };
}

export function formatArtworkAccent(accent) {
  if (!accent) return '';
  const channels = ['r', 'g', 'b'].map((channel) =>
    Math.round(clamp(Number(accent[channel]) || 0, 0, 255)),
  );
  return `rgb(${channels.join(' ')})`;
}

export function readArtworkPresentation(
  image,
  { documentRef = globalThis.document, sampleSize = 24 } = {},
) {
  if (!image || !documentRef?.createElement) return null;
  const boundedSampleSize = Math.round(clamp(sampleSize, 1, 32));

  try {
    const canvas = documentRef.createElement('canvas');
    canvas.width = boundedSampleSize;
    canvas.height = boundedSampleSize;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, boundedSampleSize, boundedSampleSize);
    return analyzeArtworkPixels(
      context.getImageData(0, 0, boundedSampleSize, boundedSampleSize).data,
      { width: boundedSampleSize, height: boundedSampleSize },
    );
  } catch {
    return null;
  }
}

export function readArtworkAccent(image, options) {
  return readArtworkPresentation(image, options)?.accent ?? null;
}

function formatTime(valueMs) {
  const totalSeconds = Number.isFinite(valueMs)
    ? Math.max(0, Math.floor(valueMs / 1000))
    : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function artworkSource(trackId) {
  const normalizedTrackId = typeof trackId === 'string' ? trackId.trim() : '';
  return normalizedTrackId
    ? `/media/artwork/${encodeURIComponent(normalizedTrackId)}`
    : '';
}

function clearArtworkPalette(elements) {
  elements.root.style.removeProperty(ARTWORK_ACCENT_PROPERTY);
  elements.root.style.removeProperty(ARTWORK_SECONDARY_PROPERTY);
  elements.root.style.removeProperty(ARTWORK_TERTIARY_PROPERTY);
  elements.root.style.removeProperty(ARTWORK_LABEL_PROPERTY);
  elements.root.dataset.artworkCopyTone = 'light';
}

function applyArtworkPresentation(elements, presentation) {
  if (!presentation) return;
  elements.root.dataset.artworkCopyTone = presentation.copyTone;
  if (!presentation.accent) return;

  const [primary, secondary, tertiary] =
    presentation.palette.map(formatArtworkAccent);
  const accent = primary || formatArtworkAccent(presentation.accent);
  elements.root.style.setProperty(ARTWORK_ACCENT_PROPERTY, accent);
  elements.root.style.setProperty(ARTWORK_LABEL_PROPERTY, accent);
  if (secondary)
    elements.root.style.setProperty(ARTWORK_SECONDARY_PROPERTY, secondary);
  if (tertiary)
    elements.root.style.setProperty(ARTWORK_TERTIARY_PROPERTY, tertiary);
}

export function preloadArtworkSource(trackId, ImageCtor = globalThis.Image) {
  const source = artworkSource(trackId);
  if (!source || typeof ImageCtor !== 'function') return null;
  const image = new ImageCtor();
  image.src = source;
  return image;
}

function setArtworkSource(elements, trackId) {
  const normalizedTrackId = typeof trackId === 'string' ? trackId.trim() : '';
  if (elements.image.dataset.trackId === normalizedTrackId) return;

  elements.image.dataset.trackId = normalizedTrackId;
  clearArtworkPalette(elements);
  if (normalizedTrackId) {
    const surface = createVinylSurface(normalizedTrackId);
    elements.root.style.setProperty(
      ARTWORK_SHADOW_MASK_PROPERTY,
      surface.shadowMask,
    );
    elements.root.style.setProperty(
      ARTWORK_HIGHLIGHT_MASK_PROPERTY,
      surface.highlightMask,
    );
    elements.root.style.setProperty(ARTWORK_INK_PROPERTY, surface.ink);
  } else {
    elements.root.style.removeProperty(ARTWORK_SHADOW_MASK_PROPERTY);
    elements.root.style.removeProperty(ARTWORK_HIGHLIGHT_MASK_PROPERTY);
    elements.root.style.removeProperty(ARTWORK_INK_PROPERTY);
  }
  elements.image.hidden = true;
  elements.fallback.hidden = false;
  elements.image.onload = null;
  elements.image.onerror = null;
  elements.image.removeAttribute('src');
  if (!normalizedTrackId) return;

  const cachedPresentation = elements.presentationCache?.get(normalizedTrackId);
  applyArtworkPresentation(elements, cachedPresentation);

  elements.image.onload = () => {
    elements.image.hidden = false;
    elements.fallback.hidden = true;
    const presentation =
      elements.presentationCache?.get(normalizedTrackId) ??
      readArtworkPresentation(elements.image);
    if (presentation)
      elements.presentationCache?.set(normalizedTrackId, presentation);
    applyArtworkPresentation(elements, presentation);
  };
  elements.image.onerror = () => {
    elements.image.hidden = true;
    elements.fallback.hidden = false;
    clearArtworkPalette(elements);
  };
  elements.image.src = artworkSource(normalizedTrackId);
}

export function collectArtworkElements(document) {
  const presentationCache = new Map();
  return {
    root: document.querySelector('#artwork-overlay'),
    image: document.querySelector('#artwork-image'),
    fallback: document.querySelector('#artwork-fallback'),
    title: document.querySelector('#artwork-title'),
    artist: document.querySelector('#artwork-artist'),
    elapsed: document.querySelector('#artwork-elapsed'),
    remaining: document.querySelector('#artwork-remaining'),
    presentationCache,
    incoming: {
      root: document.querySelector('.artwork-overlay__incoming-sleeve'),
      image: document.querySelector('.artwork-overlay__incoming-image'),
      fallback: document.querySelector('.artwork-overlay__incoming-fallback'),
      title: document.querySelector('.artwork-overlay__incoming-title'),
      artist: document.querySelector('.artwork-overlay__incoming-artist'),
      presentationCache,
    },
  };
}

function renderSleeveContent(elements, frame) {
  const title = typeof frame?.title === 'string' ? frame.title : '';
  elements.title.textContent = title;
  elements.artist.textContent =
    typeof frame?.artist === 'string' ? frame.artist : '';
  elements.fallback.textContent = title.trim().slice(0, 1).toUpperCase();
  setArtworkSource(elements, frame?.trackId);
}

export function prepareArtworkSleeve(elements, frame) {
  if (!elements?.root) return;
  elements.root.hidden = true;
  renderSleeveContent(elements, frame);
}

export function clearArtworkSleeve(elements) {
  if (!elements?.root) return;
  elements.root.hidden = true;
  renderSleeveContent(elements, { trackId: '', title: '', artist: '' });
}

export function renderArtworkFrame(elements, frame) {
  const progress = Number.isFinite(frame.progress)
    ? Math.min(1, Math.max(0, frame.progress))
    : 0;
  const positionMs = Number.isFinite(frame.positionMs)
    ? Math.max(0, frame.positionMs)
    : 0;
  const durationMs = Number.isFinite(frame.durationMs)
    ? Math.max(0, frame.durationMs)
    : 0;

  elements.root.hidden = !frame.visible;
  elements.root.dataset.revision = String(frame.revision);
  elements.root.dataset.playbackStatus = ['playing', 'paused'].includes(
    frame.playbackStatus,
  )
    ? frame.playbackStatus
    : 'idle';
  elements.root.style.setProperty(
    '--ovl-artwork-progress',
    `${progress * 100}%`,
  );
  elements.root.style.setProperty('--ovl-artwork-progress-scale', progress);
  renderSleeveContent(elements, frame);
  elements.elapsed.textContent = formatTime(positionMs);
  elements.remaining.textContent = `-${formatTime(
    Math.max(0, durationMs - positionMs),
  )}`;
}
