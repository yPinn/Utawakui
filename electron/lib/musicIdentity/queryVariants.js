'use strict';

const OpenCCSimplified = require('opencc-js/t2cn');
const OpenCCTraditional = require('opencc-js/cn2t');
const { normalizeForCompare, normalizeText } = require('./text.js');

const toSimplified = OpenCCSimplified.Converter({ from: 'tw', to: 'cn' });
const toTraditional = OpenCCTraditional.Converter({ from: 'cn', to: 'tw' });
const EAST_ASIAN_SCRIPT_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LATIN_SCRIPT_RE = /\p{Script=Latin}/u;
const CONFIDENCE_RANK = { none: 0, low: 1, medium: 2, high: 3 };
const MAX_IDENTITY_QUERIES = 12;

function hasCrossScriptIdentity(first, second) {
  const firstHasEastAsian = EAST_ASIAN_SCRIPT_RE.test(first);
  const secondHasEastAsian = EAST_ASIAN_SCRIPT_RE.test(second);
  const firstHasLatin = LATIN_SCRIPT_RE.test(first);
  const secondHasLatin = LATIN_SCRIPT_RE.test(second);
  return (
    (firstHasEastAsian && secondHasLatin && !secondHasEastAsian) ||
    (secondHasEastAsian && firstHasLatin && !firstHasEastAsian)
  );
}

function addUniqueDerivedVariant(variants, value) {
  const text = normalizeText(value);
  const key = normalizeForCompare(text);
  if (!key || variants.some((variant) => variant.key === key)) return;
  variants.push({
    key,
    value: text,
    kind: 'script-normalized',
    source: 'derived:cross-script',
    confidence: 'medium',
  });
}

function publicVariant(variant) {
  return {
    value: variant.value,
    kind: variant.kind,
    source: variant.source,
    confidence: variant.confidence,
  };
}

function crossScriptTitleVariants(value) {
  const title = normalizeText(value);
  const variants = [];
  const dashMatch = /^(.+?)\s[-\u2013\u2014]\s(.+)$/u.exec(title);
  if (dashMatch && hasCrossScriptIdentity(dashMatch[1], dashMatch[2])) {
    addUniqueDerivedVariant(variants, dashMatch[1]);
    addUniqueDerivedVariant(variants, dashMatch[2]);
  }
  const parentheticalMatch =
    /^(.+?)\s*[(\uFF08]([^()\uFF08\uFF09]+)[)\uFF09]\s*$/u.exec(title);
  if (
    parentheticalMatch &&
    hasCrossScriptIdentity(parentheticalMatch[1], parentheticalMatch[2])
  ) {
    addUniqueDerivedVariant(variants, parentheticalMatch[1]);
    addUniqueDerivedVariant(variants, parentheticalMatch[2]);
  }
  return variants.map(publicVariant);
}

function chineseScriptForms(value) {
  const original = normalizeText(value);
  return {
    original,
    simplified: normalizeText(toSimplified(original)),
    traditional: normalizeText(toTraditional(original)),
  };
}

function variantAllowed(variant, options) {
  if (variant.kind === 'romanization')
    return options.allowRomanization === true;
  if (variant.kind === 'fuzzy') return options.allowFuzzy === true;
  if (variant.kind === 'script-normalized') {
    return options.includeGeneratedScriptVariants !== false;
  }
  return true;
}

function originalVariant(value, source, confidence) {
  const text = normalizeText(value);
  return text ? { value: text, kind: 'original', source, confidence } : null;
}

function addFieldVariant(variants, variant) {
  if (!variant) return;
  const key = normalizeForCompare(variant.value);
  if (!key || variants.some((existing) => existing.key === key)) return;
  variants.push({ key, ...variant });
}

function fieldVariants(profile, field, options) {
  const source =
    profile.source?.provider || profile.source?.platform || 'observation';
  const primary = field === 'title' ? profile.title : profile.artistCredit;
  const confidence =
    field === 'title' ? profile.confidence?.title : profile.confidence?.artist;
  const variants = [];
  addFieldVariant(
    variants,
    originalVariant(primary, source, confidence || 'none'),
  );
  for (const alias of profile.aliases?.[field] || []) {
    if (variantAllowed(alias, options)) addFieldVariant(variants, alias);
  }
  if (field === 'artist') {
    for (const value of profile.artistHints || []) {
      addFieldVariant(variants, {
        value,
        kind: 'catalog-alias',
        source: 'adapter-hint',
        confidence: confidence || 'none',
      });
    }
  }
  if (field === 'title' && options.includeGeneratedScriptVariants !== false) {
    for (const variant of crossScriptTitleVariants(primary)) {
      addFieldVariant(variants, variant);
    }
    if (options.includeChineseScriptVariants === true) {
      const forms = chineseScriptForms(primary);
      for (const [form, value] of Object.entries(forms)) {
        if (form === 'original') continue;
        addFieldVariant(variants, {
          value,
          kind: 'script-normalized',
          source: `derived:opencc-${form}`,
          confidence: 'medium',
        });
      }
    }
  }
  return variants.map(publicVariant);
}

function minimumConfidence(first, second) {
  if (!second) return first || 'none';
  return (CONFIDENCE_RANK[first] || 0) <= (CONFIDENCE_RANK[second] || 0)
    ? first
    : second;
}

function boundedQueryLimit(value) {
  if (!Number.isInteger(value)) return 6;
  return Math.min(MAX_IDENTITY_QUERIES, Math.max(1, value));
}

function pushQuery(queries, seen, title, artist, reason, limit) {
  if (!title || queries.length >= limit) return;
  const key = `${normalizeForCompare(title.value)}|${normalizeForCompare(artist?.value)}`;
  if (!key.split('|')[0] || seen.has(key)) return;
  seen.add(key);
  queries.push({
    key,
    title,
    artist: artist || null,
    reason,
    confidence: minimumConfidence(title.confidence, artist?.confidence),
  });
}

function buildIdentityQueryVariants(profile, options = {}) {
  if (!profile?.title) return [];
  const limit = boundedQueryLimit(options.maxQueries);
  const titles = fieldVariants(profile, 'title', options);
  const artists = fieldVariants(profile, 'artist', options);
  const originalTitle = titles[0];
  const originalArtist = artists[0] || null;
  const queries = [];
  const seen = new Set();

  pushQuery(
    queries,
    seen,
    originalTitle,
    originalArtist,
    originalArtist ? 'original' : 'title-only',
    limit,
  );
  for (const title of titles.slice(1)) {
    pushQuery(queries, seen, title, originalArtist, 'title-variant', limit);
  }
  for (const artist of artists.slice(1)) {
    pushQuery(queries, seen, originalTitle, artist, 'artist-variant', limit);
  }
  if (options.allowTitleOnly !== false) {
    for (const title of titles) {
      pushQuery(queries, seen, title, null, 'title-only', limit);
    }
  }
  return queries;
}

module.exports = {
  MAX_IDENTITY_QUERIES,
  buildIdentityQueryVariants,
  chineseScriptForms,
  crossScriptTitleVariants,
};
