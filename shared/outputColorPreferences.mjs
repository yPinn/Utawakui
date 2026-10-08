export const MAX_OUTPUT_RECENT_COLORS = 8;
export const MAX_OUTPUT_SAVED_COLORS = 8;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const MAX_OUTPUT_COLOR_CANDIDATES =
  Math.max(MAX_OUTPUT_RECENT_COLORS, MAX_OUTPUT_SAVED_COLORS) * 4;

function normalizeOutputColor(value) {
  if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function normalizeOutputColors(value, maxColors) {
  if (!Array.isArray(value)) return [];

  const normalized = [];
  const seen = new Set();
  for (const candidate of value.slice(0, MAX_OUTPUT_COLOR_CANDIDATES)) {
    const color = normalizeOutputColor(candidate);
    if (!color || seen.has(color)) continue;
    seen.add(color);
    normalized.push(color);
    if (normalized.length >= maxColors) break;
  }
  return normalized;
}

export function normalizeOutputRecentColors(value) {
  return normalizeOutputColors(value, MAX_OUTPUT_RECENT_COLORS);
}

export function normalizeOutputSavedColors(value) {
  return normalizeOutputColors(value, MAX_OUTPUT_SAVED_COLORS);
}

export function prependOutputRecentColor(history, color) {
  const normalizedColor = normalizeOutputColor(color);
  if (!normalizedColor) return normalizeOutputRecentColors(history);
  return normalizeOutputRecentColors([normalizedColor, ...(history ?? [])]);
}

export function toggleOutputSavedColor(savedColors, color) {
  const normalizedSavedColors = normalizeOutputSavedColors(savedColors);
  const normalizedColor = normalizeOutputColor(color);
  if (!normalizedColor) return normalizedSavedColors;

  const existingIndex = normalizedSavedColors.indexOf(normalizedColor);
  if (existingIndex >= 0) {
    return normalizedSavedColors.filter((_, index) => index !== existingIndex);
  }
  if (normalizedSavedColors.length >= MAX_OUTPUT_SAVED_COLORS) {
    return normalizedSavedColors;
  }
  return [...normalizedSavedColors, normalizedColor];
}
