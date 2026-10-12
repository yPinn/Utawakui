'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson, backupCorrupted } = require('../atomicWrite');
const { normalizeForCompare } = require('../musicIdentity/text');
const { MBID_RE } = require('../musicbrainz/identifiers');

const ARTIST_ORGANIZATION_FILENAME = 'artists.json';
const ARTIST_ORGANIZATION_VERSION = 1;
const ARTIST_NORMALIZER_VERSION = 1;
const MAX_ARTISTS = 512;
const MAX_CREDITS_PER_ARTIST = 64;
const MAX_DISPLAY_NAME_CHARS = 200;
const MAX_HISTORY = 20;
const MAX_REDIRECTS = 512;
const MAX_DISMISSED = 1024;
const MAX_DOCUMENT_BYTES = 1024 * 1024;
const CREDIT_KEY_MAX_CHARS = 300;
const RAW_CREDIT_MAX_CHARS = 200;
const STABLE_ARTIST_ID_RE =
  /^artist-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CREDIT_ID_RE = /^credit-[a-z0-9-]{1,64}$/iu;
const CREDIT_SOURCES = new Set(['auto', 'musicbrainz', 'user']);
const HISTORY_KINDS = new Set(['catalog', 'merge', 'split', 'display-name']);
const MAX_CATALOG_ALIASES = 32;

function emptyOrganization() {
  return {
    version: ARTIST_ORGANIZATION_VERSION,
    revision: 0,
    artists: [],
    redirects: [],
    trackLinks: [],
    dismissed: [],
    history: [],
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value, maxChars) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxChars);
}

function creditIdForKey(key) {
  return `credit-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

function isCreditId(value) {
  return typeof value === 'string' && CREDIT_ID_RE.test(value);
}

function sanitizeCredit(value) {
  if (!isPlainObject(value)) return null;
  const raw = boundedText(value.raw, RAW_CREDIT_MAX_CHARS);
  const key = boundedText(value.key, CREDIT_KEY_MAX_CHARS);
  if (!raw || !key || normalizeForCompare(raw) !== key) return null;
  const id = CREDIT_ID_RE.test(value.id)
    ? value.id.toLowerCase()
    : creditIdForKey(key);
  return {
    id,
    key,
    raw,
    normalizerVersion: ARTIST_NORMALIZER_VERSION,
    source: CREDIT_SOURCES.has(value.source) ? value.source : 'user',
  };
}

function optionalBoundedText(value, maxChars) {
  const text = boundedText(value, maxChars);
  return text || undefined;
}

function sanitizeCatalogAlias(value) {
  if (!isPlainObject(value)) return null;
  const name = boundedText(value.name, 200);
  if (!name) return null;
  return {
    name,
    ...(optionalBoundedText(value.sortName, 200)
      ? { sortName: optionalBoundedText(value.sortName, 200) }
      : {}),
    ...(optionalBoundedText(value.locale, 20)
      ? { locale: optionalBoundedText(value.locale, 20) }
      : {}),
    primary: value.primary === true,
    ...(optionalBoundedText(value.type, 100)
      ? { type: optionalBoundedText(value.type, 100) }
      : {}),
  };
}

function sanitizeCatalog(value) {
  if (!isPlainObject(value) || !MBID_RE.test(value.mbid ?? '')) return null;
  const name = boundedText(value.name, 200);
  if (!name) return null;
  const aliases = [];
  for (const rawAlias of Array.isArray(value.aliases) ? value.aliases : []) {
    const alias = sanitizeCatalogAlias(rawAlias);
    if (!alias || aliases.some((entry) => entry.name === alias.name)) continue;
    aliases.push(alias);
    if (aliases.length >= MAX_CATALOG_ALIASES) break;
  }
  const fetchedAt =
    typeof value.fetchedAt === 'string' &&
    !Number.isNaN(Date.parse(value.fetchedAt))
      ? value.fetchedAt
      : new Date(0).toISOString();
  return {
    mbid: value.mbid.toLowerCase(),
    name,
    ...(optionalBoundedText(value.sortName, 200)
      ? { sortName: optionalBoundedText(value.sortName, 200) }
      : {}),
    ...(optionalBoundedText(value.type, 100)
      ? { type: optionalBoundedText(value.type, 100) }
      : {}),
    ...(optionalBoundedText(value.disambiguation, 200)
      ? { disambiguation: optionalBoundedText(value.disambiguation, 200) }
      : {}),
    aliases,
    fetchedAt,
  };
}

function sanitizeCreditKey(value) {
  const key = boundedText(value, CREDIT_KEY_MAX_CHARS);
  return key && normalizeForCompare(key) === key ? key : '';
}

function sanitizeDismissed(value) {
  const dismissed = [];
  const seen = new Set();
  for (const rawEntry of Array.isArray(value) ? value : []) {
    if (!isPlainObject(rawEntry)) continue;
    let entry = null;
    if (rawEntry.kind === 'credit-mbid') {
      const creditKey = sanitizeCreditKey(rawEntry.creditKey);
      const mbid = MBID_RE.test(rawEntry.mbid ?? '')
        ? rawEntry.mbid.toLowerCase()
        : '';
      if (creditKey && mbid) entry = { kind: 'credit-mbid', creditKey, mbid };
    } else if (rawEntry.kind === 'credit-pair') {
      const left = sanitizeCreditKey(rawEntry.leftKey);
      const right = sanitizeCreditKey(rawEntry.rightKey);
      if (left && right && left !== right) {
        const [leftKey, rightKey] = [left, right].sort();
        entry = { kind: 'credit-pair', leftKey, rightKey };
      }
    }
    if (!entry) continue;
    const identity = JSON.stringify(entry);
    if (seen.has(identity)) continue;
    seen.add(identity);
    dismissed.push(entry);
    if (dismissed.length >= MAX_DISMISSED) break;
  }
  return dismissed;
}

function sanitizeArtist(value, claimedCreditKeys) {
  if (!isPlainObject(value) || !STABLE_ARTIST_ID_RE.test(value.id)) return null;
  const credits = [];
  for (const rawCredit of Array.isArray(value.credits) ? value.credits : []) {
    const credit = sanitizeCredit(rawCredit);
    if (!credit || claimedCreditKeys.has(credit.key)) continue;
    claimedCreditKeys.add(credit.key);
    credits.push(credit);
    if (credits.length >= MAX_CREDITS_PER_ARTIST) break;
  }
  if (credits.length === 0) return null;
  const displayNameOverride = boundedText(
    value.displayNameOverride,
    MAX_DISPLAY_NAME_CHARS,
  );
  const catalog = sanitizeCatalog(value.catalog);
  return {
    id: value.id.toLowerCase(),
    ...(displayNameOverride ? { displayNameOverride } : {}),
    ...(catalog ? { catalog } : {}),
    credits,
  };
}

function sanitizeRedirects(value, artistIds) {
  const direct = new Map();
  for (const entry of Array.isArray(value) ? value : []) {
    const from =
      typeof entry?.from === 'string' ? entry.from.toLowerCase() : '';
    const to = typeof entry?.to === 'string' ? entry.to.toLowerCase() : '';
    if (
      !STABLE_ARTIST_ID_RE.test(from) ||
      !STABLE_ARTIST_ID_RE.test(to) ||
      from === to ||
      artistIds.has(from) ||
      direct.has(from)
    ) {
      continue;
    }
    direct.set(from, to);
    if (direct.size >= MAX_REDIRECTS) break;
  }

  const redirects = [];
  for (const [from, firstTarget] of direct) {
    const seen = new Set([from]);
    let target = firstTarget;
    while (direct.has(target) && !seen.has(target)) {
      seen.add(target);
      target = direct.get(target);
    }
    if (!seen.has(target) && artistIds.has(target)) {
      redirects.push({ from, to: target });
    }
  }
  return redirects;
}

function sanitizeSnapshot(value) {
  if (!isPlainObject(value)) return null;
  const claimedCreditKeys = new Set();
  const artists = [];
  for (const rawArtist of Array.isArray(value.artists) ? value.artists : []) {
    const artist = sanitizeArtist(rawArtist, claimedCreditKeys);
    if (!artist || artists.some((entry) => entry.id === artist.id)) continue;
    artists.push(artist);
    if (artists.length >= MAX_ARTISTS) break;
  }
  const artistIds = new Set(artists.map((artist) => artist.id));
  return {
    artists,
    redirects: sanitizeRedirects(value.redirects, artistIds),
    trackLinks: [],
    dismissed: sanitizeDismissed(value.dismissed),
  };
}

function sanitizeHistoryEntry(value) {
  if (!isPlainObject(value) || !HISTORY_KINDS.has(value.kind)) return null;
  const snapshot = sanitizeSnapshot(value.snapshot);
  if (!snapshot) return null;
  const at =
    typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at))
      ? value.at
      : new Date(0).toISOString();
  return { kind: value.kind, at, snapshot };
}

function sanitizeOrganization(value) {
  if (
    !isPlainObject(value) ||
    value.version !== ARTIST_ORGANIZATION_VERSION ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.artists) ||
    !Array.isArray(value.trackLinks) ||
    !Array.isArray(value.dismissed) ||
    !Array.isArray(value.history)
  ) {
    return null;
  }
  const snapshot = sanitizeSnapshot(value);
  const history = value.history
    .map(sanitizeHistoryEntry)
    .filter(Boolean)
    .slice(-MAX_HISTORY);
  return {
    version: ARTIST_ORGANIZATION_VERSION,
    revision: value.revision,
    ...snapshot,
    history,
  };
}

function loadArtistOrganization(directory) {
  const filePath = path.join(directory, ARTIST_ORGANIZATION_FILENAME);
  let raw;
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > MAX_DOCUMENT_BYTES) {
      backupCorrupted(filePath);
      return emptyOrganization();
    }
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyOrganization();
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    backupCorrupted(filePath);
    return emptyOrganization();
  }
  const organization = sanitizeOrganization(parsed);
  if (organization) return organization;
  backupCorrupted(filePath);
  return emptyOrganization();
}

function snapshotOf(organization) {
  return {
    artists: structuredClone(organization.artists),
    redirects: structuredClone(organization.redirects),
    trackLinks: structuredClone(organization.trackLinks),
    dismissed: structuredClone(organization.dismissed),
  };
}

function appendHistory(organization, kind, now) {
  return [
    ...organization.history,
    { kind, at: now.toISOString(), snapshot: snapshotOf(organization) },
  ].slice(-MAX_HISTORY);
}

function writeArtistOrganization(directory, organization) {
  fs.mkdirSync(directory, { recursive: true });
  const next = structuredClone(organization);
  while (
    next.history.length > 0 &&
    Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_DOCUMENT_BYTES
  ) {
    next.history.shift();
  }
  if (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new Error('artist organization document exceeds size limit');
  }
  atomicWriteJson(path.join(directory, ARTIST_ORGANIZATION_FILENAME), next);
  return next;
}

function revisionConflict(organization, expectedRevision) {
  return Number.isSafeInteger(expectedRevision) &&
    expectedRevision === organization.revision
    ? null
    : { status: 'conflict', revision: organization.revision };
}

function creditFromProjection(value) {
  const raw = boundedText(value?.name, RAW_CREDIT_MAX_CHARS);
  const key = normalizeForCompare(raw);
  if (!raw || !key) return null;
  return {
    id: CREDIT_ID_RE.test(value?.id)
      ? value.id.toLowerCase()
      : creditIdForKey(key),
    key,
    raw,
    normalizerVersion: ARTIST_NORMALIZER_VERSION,
    source: 'user',
  };
}

function creditsFromArtists(artists) {
  const byKey = new Map();
  for (const artist of artists) {
    for (const value of Array.isArray(artist?.credits) ? artist.credits : []) {
      const credit = creditFromProjection(value);
      if (credit && !byKey.has(credit.key)) byKey.set(credit.key, credit);
    }
  }
  return [...byKey.values()].slice(0, MAX_CREDITS_PER_ARTIST);
}

function createStableArtistId(randomUUID = crypto.randomUUID) {
  const uuid = randomUUID();
  const id = `artist-${uuid}`.toLowerCase();
  if (!STABLE_ARTIST_ID_RE.test(id))
    throw new Error('invalid stable artist id');
  return id;
}

function currentArtists(index, artistIds) {
  if (
    !Array.isArray(artistIds) ||
    artistIds.length < 2 ||
    artistIds.length > 8
  ) {
    return null;
  }
  const unique = [...new Set(artistIds)];
  if (unique.length !== artistIds.length) return null;
  const artists = unique.map((id) =>
    index?.artists?.find((artist) => artist.id === id),
  );
  return artists.every(Boolean) ? artists : null;
}

function commitMutation(
  directory,
  organization,
  kind,
  nextArtists,
  options,
  nextRedirects = organization.redirects,
  nextDismissed = organization.dismissed,
) {
  const now = options.now instanceof Date ? options.now : new Date();
  const next = {
    ...organization,
    revision: organization.revision + 1,
    artists: nextArtists,
    redirects: nextRedirects,
    dismissed: nextDismissed,
    history: appendHistory(organization, kind, now),
  };
  return writeArtistOrganization(directory, next);
}

function creditKeys(credits) {
  return new Set((credits ?? []).map((credit) => credit.key).filter(Boolean));
}

function pairIsBetween(entry, leftKeys, rightKeys) {
  return (
    (leftKeys.has(entry.leftKey) && rightKeys.has(entry.rightKey)) ||
    (leftKeys.has(entry.rightKey) && rightKeys.has(entry.leftKey))
  );
}

function hasDismissedPair(dismissed, leftCredits, rightCredits) {
  const leftKeys = creditKeys(leftCredits);
  const rightKeys = creditKeys(rightCredits);
  return dismissed.some(
    (entry) =>
      entry.kind === 'credit-pair' && pairIsBetween(entry, leftKeys, rightKeys),
  );
}

function hasDismissedMbid(dismissed, credits, mbid) {
  const keys = creditKeys(credits);
  return dismissed.some(
    (entry) =>
      entry.kind === 'credit-mbid' &&
      entry.mbid === mbid &&
      keys.has(entry.creditKey),
  );
}

function clearDismissedLinks(dismissed, leftCredits, rightCredits, mbid) {
  const leftKeys = creditKeys(leftCredits);
  const rightKeys = creditKeys(rightCredits);
  return dismissed.filter((entry) => {
    if (
      entry.kind === 'credit-mbid' &&
      entry.mbid === mbid &&
      leftKeys.has(entry.creditKey)
    ) {
      return false;
    }
    return !(
      entry.kind === 'credit-pair' && pairIsBetween(entry, leftKeys, rightKeys)
    );
  });
}

function appendDismissed(dismissed, additions) {
  return sanitizeDismissed([...dismissed, ...additions]);
}

function redirectMergedArtists(redirects, absorbedArtistIds, targetArtistId) {
  const absorbed = new Set(
    [...absorbedArtistIds].filter(
      (artistId) =>
        artistId !== targetArtistId && STABLE_ARTIST_ID_RE.test(artistId),
    ),
  );
  const next = new Map();
  for (const redirect of redirects) {
    if (absorbed.has(redirect.from) || redirect.from === targetArtistId)
      continue;
    next.set(
      redirect.from,
      absorbed.has(redirect.to) ? targetArtistId : redirect.to,
    );
  }
  for (const artistId of absorbed) next.set(artistId, targetArtistId);
  return [...next].slice(0, MAX_REDIRECTS).map(([from, to]) => ({ from, to }));
}

function mergeArtistOrganizations(directory, index, artistIds, options = {}) {
  const organization = loadArtistOrganization(directory);
  const conflict = revisionConflict(organization, options.expectedRevision);
  if (conflict) return conflict;
  const selected = currentArtists(index, artistIds);
  if (!selected) return { status: 'error', reason: 'artist-unavailable' };
  const credits = creditsFromArtists(selected);
  if (credits.length < 2)
    return { status: 'error', reason: 'credit-unavailable' };

  const selectedIds = new Set(selected.map((artist) => artist.id));
  const persisted = organization.artists.filter((artist) =>
    selectedIds.has(artist.id),
  );
  const artistId = persisted[0]?.id ?? createStableArtistId(options.randomUUID);
  const displayNameOverride = persisted.find(
    (artist) => artist.displayNameOverride,
  )?.displayNameOverride;
  const catalogs = persisted.map((artist) => artist.catalog).filter(Boolean);
  const catalog =
    catalogs.length > 0 &&
    catalogs.every((entry) => entry.mbid === catalogs[0].mbid)
      ? catalogs[0]
      : undefined;
  const merged = {
    id: artistId,
    ...(displayNameOverride ? { displayNameOverride } : {}),
    ...(catalog ? { catalog } : {}),
    credits,
  };
  const nextArtists = [
    ...organization.artists.filter((artist) => !selectedIds.has(artist.id)),
    merged,
  ];
  const nextRedirects = redirectMergedArtists(
    organization.redirects,
    selectedIds,
    artistId,
  );
  const selectedCreditSets = selected.map((artist) =>
    creditsFromArtists([artist]),
  );
  const selectedCreditKeys = new Set(
    selectedCreditSets.flatMap((credits) => [...creditKeys(credits)]),
  );
  const selectedCatalogMbids = new Set(
    persisted.map((artist) => artist.catalog?.mbid).filter(Boolean),
  );
  const nextDismissed = organization.dismissed.filter((entry) => {
    if (
      entry.kind === 'credit-mbid' &&
      selectedCreditKeys.has(entry.creditKey) &&
      selectedCatalogMbids.has(entry.mbid)
    ) {
      return false;
    }
    return (
      entry.kind !== 'credit-pair' ||
      !selectedCreditSets.some((left, leftIndex) =>
        selectedCreditSets
          .slice(leftIndex + 1)
          .some((right) => hasDismissedPair([entry], left, right)),
      )
    );
  });
  const saved = commitMutation(
    directory,
    organization,
    'merge',
    nextArtists,
    options,
    nextRedirects,
    nextDismissed,
  );
  return {
    status: 'ok',
    changed: true,
    artistId,
    revision: saved.revision,
  };
}

function setArtistDisplayName(
  directory,
  index,
  artistId,
  displayName,
  options = {},
) {
  const organization = loadArtistOrganization(directory);
  const conflict = revisionConflict(organization, options.expectedRevision);
  if (conflict) return conflict;
  const current = index?.artists?.find((artist) => artist.id === artistId);
  if (!current) return { status: 'error', reason: 'artist-unavailable' };
  const override = boundedText(displayName, MAX_DISPLAY_NAME_CHARS);
  const existing = organization.artists.find(
    (artist) => artist.id === artistId,
  );
  if (existing?.displayNameOverride === override) {
    return {
      status: 'ok',
      changed: false,
      artistId: existing.id,
      revision: organization.revision,
    };
  }
  const stableId = existing?.id ?? createStableArtistId(options.randomUUID);
  const credits = existing?.credits ?? creditsFromArtists([current]);
  if (credits.length === 0) {
    return { status: 'error', reason: 'credit-unavailable' };
  }
  const updated = {
    id: stableId,
    ...(override ? { displayNameOverride: override } : {}),
    ...(existing?.catalog ? { catalog: existing.catalog } : {}),
    credits,
  };
  const nextArtists = existing
    ? organization.artists.map((artist) =>
        artist.id === existing.id ? updated : artist,
      )
    : [...organization.artists, updated];
  const saved = commitMutation(
    directory,
    organization,
    'display-name',
    nextArtists,
    options,
  );
  return {
    status: 'ok',
    changed: true,
    artistId: stableId,
    revision: saved.revision,
  };
}

function applyArtistCatalog(
  directory,
  index,
  artistId,
  catalogValue,
  options = {},
) {
  const organization = loadArtistOrganization(directory);
  const conflict = revisionConflict(organization, options.expectedRevision);
  if (conflict) return conflict;
  const current = index?.artists?.find((artist) => artist.id === artistId);
  const catalog = sanitizeCatalog(catalogValue);
  if (!current) return { status: 'error', reason: 'artist-unavailable' };
  if (!catalog) return { status: 'error', reason: 'catalog-unavailable' };
  const currentCredits = creditsFromArtists([current]);
  if (
    options.automatic === true &&
    hasDismissedMbid(organization.dismissed, currentCredits, catalog.mbid)
  ) {
    return {
      status: 'skipped',
      reason: 'user-dismissed',
      revision: organization.revision,
    };
  }

  const existing = organization.artists.find(
    (artist) => artist.id === artistId,
  );
  const sameMbid = organization.artists
    .filter(
      (artist) =>
        artist.id !== existing?.id && artist.catalog?.mbid === catalog.mbid,
    )
    .find(
      (artist) =>
        options.automatic !== true ||
        !hasDismissedPair(
          organization.dismissed,
          currentCredits,
          artist.credits,
        ),
    );
  const target = sameMbid ?? existing;
  const stableId = target?.id ?? createStableArtistId(options.randomUUID);
  const byKey = new Map();
  for (const credit of [
    ...(target?.credits ?? []),
    ...(existing?.credits ?? []),
  ]) {
    if (!byKey.has(credit.key)) byKey.set(credit.key, credit);
  }
  for (const credit of currentCredits) {
    byKey.set(credit.key, { ...credit, source: 'musicbrainz' });
  }
  const credits = [...byKey.values()].slice(0, MAX_CREDITS_PER_ARTIST);
  if (credits.length === 0) {
    return { status: 'error', reason: 'credit-unavailable' };
  }
  const updated = {
    id: stableId,
    ...(target?.displayNameOverride || existing?.displayNameOverride
      ? {
          displayNameOverride:
            target?.displayNameOverride ?? existing.displayNameOverride,
        }
      : {}),
    catalog,
    credits,
  };
  const replacedIds = new Set([target?.id, existing?.id].filter(Boolean));
  const nextArtists = [
    ...organization.artists.filter((artist) => !replacedIds.has(artist.id)),
    updated,
  ];
  const nextRedirects = redirectMergedArtists(
    organization.redirects,
    replacedIds,
    stableId,
  );
  const nextDismissed =
    options.automatic === true
      ? organization.dismissed
      : clearDismissedLinks(
          organization.dismissed,
          currentCredits,
          sameMbid?.credits ?? [],
          catalog.mbid,
        );
  const saved = commitMutation(
    directory,
    organization,
    'catalog',
    nextArtists,
    options,
    nextRedirects,
    nextDismissed,
  );
  return {
    status: 'ok',
    changed: true,
    artistId: stableId,
    autoMerged: Boolean(sameMbid),
    revision: saved.revision,
  };
}

function splitArtistOrganization(
  directory,
  index,
  artistId,
  creditId,
  options = {},
) {
  const organization = loadArtistOrganization(directory);
  const conflict = revisionConflict(organization, options.expectedRevision);
  if (conflict) return conflict;
  const current = index?.artists?.find((artist) => artist.id === artistId);
  const stored = organization.artists.find((artist) => artist.id === artistId);
  if (!current || !stored) {
    return { status: 'error', reason: 'artist-unavailable' };
  }
  if (stored.credits.length < 2) {
    return { status: 'error', reason: 'split-unavailable' };
  }
  const nextCredits = stored.credits.filter((credit) => credit.id !== creditId);
  if (nextCredits.length === stored.credits.length) {
    return { status: 'error', reason: 'credit-unavailable' };
  }
  const nextArtists = organization.artists.map((artist) =>
    artist.id === stored.id ? { ...artist, credits: nextCredits } : artist,
  );
  const removedCredit = stored.credits.find((credit) => credit.id === creditId);
  const dismissedAdditions = nextCredits.map((credit) => ({
    kind: 'credit-pair',
    leftKey: removedCredit.key,
    rightKey: credit.key,
  }));
  if (stored.catalog?.mbid) {
    dismissedAdditions.push({
      kind: 'credit-mbid',
      creditKey: removedCredit.key,
      mbid: stored.catalog.mbid,
    });
  }
  const nextDismissed = appendDismissed(
    organization.dismissed,
    dismissedAdditions,
  );
  const saved = commitMutation(
    directory,
    organization,
    'split',
    nextArtists,
    options,
    organization.redirects,
    nextDismissed,
  );
  return {
    status: 'ok',
    changed: true,
    artistId: stored.id,
    revision: saved.revision,
  };
}

function undoArtistOrganization(directory, options = {}) {
  const organization = loadArtistOrganization(directory);
  const conflict = revisionConflict(organization, options.expectedRevision);
  if (conflict) return conflict;
  const last = organization.history.at(-1);
  if (!last) {
    return {
      status: 'ok',
      changed: false,
      revision: organization.revision,
    };
  }
  const restored = {
    version: ARTIST_ORGANIZATION_VERSION,
    revision: organization.revision + 1,
    ...structuredClone(last.snapshot),
    history: organization.history.slice(0, -1),
  };
  const saved = writeArtistOrganization(directory, restored);
  return { status: 'ok', changed: true, revision: saved.revision };
}

module.exports = {
  ARTIST_NORMALIZER_VERSION,
  ARTIST_ORGANIZATION_FILENAME,
  ARTIST_ORGANIZATION_VERSION,
  STABLE_ARTIST_ID_RE,
  applyArtistCatalog,
  creditIdForKey,
  emptyOrganization,
  loadArtistOrganization,
  isCreditId,
  mergeArtistOrganizations,
  setArtistDisplayName,
  splitArtistOrganization,
  undoArtistOrganization,
};
