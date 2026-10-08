import { sanitizeOutputLocalFont } from '../../shared/outputAppearance.mjs';

export const MAX_OUTPUT_LOCAL_FONT_FAMILIES = 500;

const familyCollator = new Intl.Collator(['zh-Hant', 'ja', 'ko', 'en'], {
  numeric: true,
  sensitivity: 'base',
});

function facePreference(font) {
  const style = font.style.toLocaleLowerCase();
  if (style === 'regular' || style === 'normal') return 0;
  if (style === 'book' || style === 'roman') return 1;
  return 2;
}

export function normalizeOutputLocalFonts(value) {
  if (!Array.isArray(value)) return [];
  const families = new Map();

  for (const candidate of value) {
    const font = sanitizeOutputLocalFont({
      source: 'local',
      family: candidate?.family,
      postscriptName: candidate?.postscriptName,
      style: candidate?.style,
    });
    if (!font) continue;
    const key = font.family.toLocaleLowerCase();
    const current = families.get(key);
    if (!current || facePreference(font) < facePreference(current)) {
      families.set(key, font);
    }
  }

  return [...families.values()]
    .sort((left, right) => familyCollator.compare(left.family, right.family))
    .slice(0, MAX_OUTPUT_LOCAL_FONT_FAMILIES);
}

export function isOutputLocalFontAvailable(catalog, value) {
  const font = sanitizeOutputLocalFont(value);
  if (!font || !Array.isArray(catalog)) return false;
  const postscriptName = font.postscriptName.toLocaleLowerCase();
  const family = font.family.toLocaleLowerCase();
  return catalog.some(
    (candidate) =>
      candidate.postscriptName.toLocaleLowerCase() === postscriptName ||
      candidate.family.toLocaleLowerCase() === family,
  );
}
