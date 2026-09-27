'use strict';

const { normalizeText } = require('./text.js');

const VERSION_WORD_PATTERN = String.raw`\b(?:live|remix|acoustic|cover|karaoke|instrumental|sped|slowed|demo|edit|version|session|first\s+take)\b`;

function versionTerms(value) {
  const normalized = normalizeText(value).normalize('NFKC');
  return new Set(
    [...normalized.matchAll(new RegExp(VERSION_WORD_PATTERN, 'giu'))].map(
      (match) => match[0].toLocaleLowerCase(),
    ),
  );
}

function collectVersionTerms(values) {
  const terms = new Set();
  for (const value of Array.isArray(values) ? values : [values]) {
    for (const term of versionTerms(value)) terms.add(term);
  }
  return terms;
}

// Reports asymmetric evidence only. The consuming feature owns any numeric
// penalty, rejection rule, or confidence band derived from this observation.
function candidateIntroducesVersion(sourceValues, candidateValues) {
  const sourceTerms = collectVersionTerms(sourceValues);
  const candidateTerms = collectVersionTerms(candidateValues);
  for (const term of candidateTerms) {
    if (!sourceTerms.has(term)) return true;
  }
  return false;
}

module.exports = {
  candidateIntroducesVersion,
  collectVersionTerms,
  versionTerms,
};
