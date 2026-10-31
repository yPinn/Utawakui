'use strict';

const {
  crossScriptTitleVariants,
  chineseScriptForms,
} = require('../musicIdentity/queryVariants.js');
const { normalizeForCompare } = require('../musicIdentity/text.js');
const { collectVersionTerms } = require('../musicIdentity/recordingSignals.js');
const { looksLikeChannelArtist } = require('../musicTitle.js');

const EAST =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LATIN = /\p{Script=Latin}/u;
const FEATURE = /\s*[(（](?:feat\.?|ft\.?|featuring)\s+([^()（）]+)[)）]/giu;
const CREDIT_SEPARATOR = /\s*(?:[,，、;；]|\s[&/]\s)\s*/u;
const VERSIONS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);
const LOCAL_VERSION_SIGNALS = [
  ['live', /現場|现场|ライブ|라이브/u],
  ['cover', /翻唱|カバー|커버/u],
  ['remix', /混音|リミックス|리믹스/u],
  ['acoustic', /不插電|不插电|アコースティック|어쿠스틱/u],
  ['instrumental', /伴奏|純音樂|纯音乐|インスト|반주/u],
  ['remaster', /重製|重制|リマスター|리마스터/u],
  ['duet', /合唱版|デュエット|듀엣/u],
];
function validText(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    ![...value].some((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || code === 127;
    })
  );
}
function versions(title, intent = 'studio') {
  const terms = collectVersionTerms(title);
  for (const [term, pattern] of LOCAL_VERSION_SIGNALS)
    if (pattern.test(title)) terms.add(term);
  if (/\bremaster(?:ed)?\b/iu.test(title)) terms.add('remaster');
  for (const match of title.matchAll(/\b(?:part|pt|vol(?:ume)?)[.\s]*\d+\b/giu))
    terms.add(match[0].toLowerCase().replace(/\W/gu, ''));
  if (intent !== 'studio') terms.add(intent);
  return [...terms].sort().join('|');
}
function keys(value) {
  return Object.values(chineseScriptForms(value))
    .map(normalizeForCompare)
    .filter(Boolean);
}
function same(first, second) {
  return keys(first).some((key) => keys(second).includes(key));
}
function explicitVariants(value) {
  const text = value.trim();
  const result = [text];
  const bracket = /^(.+?)\s*[(（]([^()（）]+)[)）](.*)$/u.exec(text);
  const variants = bracket
    ? crossScriptTitleVariants(`${bracket[1]} (${bracket[2]})`).map(
        ({ value }) => `${value}${bracket[3]}`.trim(),
      )
    : crossScriptTitleVariants(text).map(({ value }) => value);
  for (const variant of variants) {
    if (
      versions(variant) !== versions(text) ||
      looksLikeChannelArtist(variant) ||
      /^(?:live|remix|version|cover|acoustic)$/iu.test(variant)
    )
      continue;
    if (!result.some((existing) => same(existing, variant)))
      result.push(variant);
  }
  return result;
}
function creditGroups(value) {
  return value.split(CREDIT_SEPARATOR).filter(Boolean).map(explicitVariants);
}
function groupMatches(first, second) {
  return first.some((a) => second.some((b) => same(a, b)));
}
function featureGroups(value) {
  return [...value.matchAll(FEATURE)].flatMap((match) =>
    creditGroups(match[1]),
  );
}
function withoutFeatures(value) {
  return value.replace(FEATURE, '').trim() || value.trim();
}
function checked(input) {
  const ref = input?.reference;
  if (
    !ref ||
    !validText(ref.title) ||
    !validText(ref.artist) ||
    !Number.isFinite(ref.durationSeconds) ||
    ref.durationSeconds <= 0 ||
    ref.durationSeconds > 86400 ||
    !VERSIONS.has(ref.version)
  )
    throw new TypeError('invalid isolated Kugou identity');
  const aliases = input.aliases ?? {};
  if (
    !aliases ||
    typeof aliases !== 'object' ||
    Array.isArray(aliases) ||
    Object.keys(aliases).some((key) => !['title', 'artist'].includes(key))
  )
    throw new TypeError('invalid isolated Kugou aliases');
  for (const field of ['title', 'artist']) {
    if (
      aliases[field] !== undefined &&
      (!Array.isArray(aliases[field]) ||
        aliases[field].length > 4 ||
        aliases[field].some((value) => !validText(value)))
    )
      throw new TypeError('invalid isolated Kugou alias values');
  }
  return { ref, aliases };
}
function policy(input) {
  const { ref, aliases } = checked(input);
  const titles = [ref.title, ...(aliases.title || [])].flatMap((title) =>
    explicitVariants(withoutFeatures(title)),
  );
  const artists = creditGroups(ref.artist);
  for (const alias of aliases.artist || []) {
    if (creditGroups(alias).length !== 1)
      throw new TypeError('lead alias cannot replace composite credits');
    artists[0].push(...explicitVariants(alias));
  }
  const required = [...artists];
  for (const group of featureGroups(ref.title))
    if (!required.some((existing) => groupMatches(existing, group)))
      required.push(group);
  return { ref, titles, artists, required };
}
function preferred(values, east = false) {
  return (
    values.find((value) =>
      east
        ? EAST.test(value) && !LATIN.test(value)
        : LATIN.test(value) && !EAST.test(value),
    ) || values.at(-1)
  );
}
function buildKugouLineQueryPlan(input) {
  const p = policy(input);
  const result = [
    { reason: 'original', title: p.ref.title, artist: p.ref.artist },
  ];
  const title = preferred(p.titles, true);
  const credits = p.artists.map((group) => preferred(group));
  function push(reason, nextTitle, artist) {
    if (
      !result.some(
        (query) => query.title === nextTitle && query.artist === artist,
      ) &&
      result.length < 3
    )
      result.push({ reason, title: nextTitle, artist });
  }
  push('canonical-credit', title, credits.join(', '));
  if (credits.length > 1) push('lead-credit', title, credits[0]);
  for (const alias of p.titles) push('title-alias', alias, credits[0]);
  return result;
}
function evaluateKugouLineIdentity(input, candidate) {
  try {
    const p = policy(input);
    if (
      !validText(candidate?.title) ||
      !validText(candidate?.artist) ||
      !Number.isFinite(candidate.durationSeconds)
    )
      return { accepted: false };
    const delta = Math.abs(
      Math.round(candidate.durationSeconds) - Math.round(p.ref.durationSeconds),
    );
    const actualTitle = withoutFeatures(candidate.title);
    const titleMatch = p.titles.some((title) =>
      explicitVariants(actualTitle).some((actual) => same(title, actual)),
    );
    const actualArtists = creditGroups(candidate.artist);
    const actual = [...actualArtists, ...featureGroups(candidate.title)];
    const allCredits = p.required.every((group) =>
      actual.some((a) => groupMatches(group, a)),
    );
    const noUnknownCredits = actual.every((group) =>
      p.required.some((expected) => groupMatches(expected, group)),
    );
    const lead = groupMatches(p.artists[0], actualArtists[0]);
    const completeReordered =
      p.required.length > 1 &&
      allCredits &&
      p.required.some((group) => groupMatches(group, actualArtists[0]));
    const accepted =
      titleMatch &&
      allCredits &&
      noUnknownCredits &&
      (lead || completeReordered) &&
      delta <= 4 &&
      versions(p.ref.title, p.ref.version) === versions(candidate.title);
    return {
      accepted,
      durationDelta: delta,
      matchBand: accepted
        ? same(p.ref.title, candidate.title) &&
          same(p.ref.artist, candidate.artist)
          ? 'exact'
          : 'strong'
        : null,
    };
  } catch {
    return { accepted: false };
  }
}
function evaluateKugouLineLyricsIdentity(input, tags, catalog) {
  const p = policy(input);
  const provenCredits = [
    ...creditGroups(catalog.artist),
    ...featureGroups(catalog.title),
  ];
  if (
    featureGroups(tags.ti || '').some(
      (group) => !provenCredits.some((actual) => groupMatches(group, actual)),
    )
  )
    return false;
  if (tags.ar) {
    let credits = creditGroups(tags.ar);
    const catalogCredits = [
      ...creditGroups(catalog.artist),
      ...featureGroups(catalog.title),
    ];
    if (catalogCredits.length > 1 && tags.ar.includes('/')) {
      const separated = tags.ar.split('/').flatMap(creditGroups);
      if (
        separated.length > 1 &&
        separated.every((group) =>
          catalogCredits.some((actual) => groupMatches(group, actual)),
        )
      )
        credits = separated;
    }
    if (
      !groupMatches(p.artists[0], credits[0]) ||
      !credits.every((group) =>
        catalogCredits.some((a) => groupMatches(group, a)),
      )
    )
      return false;
  }
  if (tags.ti) {
    if (versions(p.ref.title, p.ref.version) !== versions(tags.ti))
      return false;
    const title = withoutFeatures(tags.ti);
    if (
      !p.titles.some((expected) =>
        explicitVariants(title).some((actual) => same(expected, actual)),
      )
    ) {
      // Catalog identity was already proved. Some native LRC tags append an
      // East-Asian translation or film description, never a recording version.
      const annotations = [...title.matchAll(/[(（]([^()（）]+)[)）]/gu)];
      if (
        !annotations.length ||
        annotations.some((match) => !EAST.test(match[1])) ||
        !same(
          title.replace(/\s*[(（][^()（）]+[)）]/gu, '').trim(),
          withoutFeatures(catalog.title),
        )
      )
        return false;
    }
  }
  return true;
}

module.exports = {
  buildKugouLineQueryPlan,
  evaluateKugouLineIdentity,
  evaluateKugouLineLyricsIdentity,
};
