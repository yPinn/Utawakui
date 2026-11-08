'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { hasControlCharacters } = require('../textGuards');
const { hashAudioFile } = require('../works/trackBinding');
const { loadIndex } = require('./metadataIndex');
const { isBoundedTrackId, resolveTrackAudioPath } = require('./paths');

const maxBytes = 8 * 1024 * 1024;
const digest = /^[a-f0-9]{64}$/u;
const manualFile = 'style-tags.json';
const candidateFile = 'style-candidates.json';
const maxAdoptionTracks = 1000;

function invalid(code = 'invalid') {
  return Object.assign(new Error(`Invalid track style operation (${code})`), {
    styleStatus: code,
  });
}

function validId(id) {
  return (
    isBoundedTrackId(id) &&
    !['__proto__', 'prototype', 'constructor'].includes(id)
  );
}

function styleLabel(value) {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    hasControlCharacters(value) ||
    !value.trim()
  )
    throw invalid();
  return value.trim();
}

function labelKey(value) {
  return value.normalize('NFKC').toLowerCase();
}

function uniqueLabels(labels, max) {
  if (!Array.isArray(labels) || labels.length > max) throw invalid();
  return [
    ...new Map(
      labels.map((value) => {
        const label = styleLabel(value);
        return [labelKey(label), label];
      }),
    ).values(),
  ];
}

function readJson(file, limit = maxBytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw invalid();
    const data = Buffer.alloc(stat.size + 1);
    if (fs.readSync(fd, data, 0, data.length, 0) !== stat.size) throw invalid();
    return JSON.parse(
      data
        .subarray(0, stat.size)
        .toString('utf8')
        .replace(/^\uFEFF/u, ''),
    );
  } finally {
    fs.closeSync(fd);
  }
}

function readStore(dir, filename) {
  let doc;
  try {
    doc = readJson(path.join(dir, filename));
  } catch (error) {
    if (error.code === 'ENOENT') return Object.create(null);
    throw new Error('Unable to read the track style store', { cause: error });
  }
  if (
    doc?.version !== 1 ||
    !doc.tracks ||
    typeof doc.tracks !== 'object' ||
    Array.isArray(doc.tracks)
  )
    throw new Error('Invalid track style store');
  return Object.assign(Object.create(null), doc.tracks);
}

function writeStore(dir, filename, tracks) {
  const document = JSON.stringify({ version: 1, tracks }, null, 2);
  if (Buffer.byteLength(document) > maxBytes)
    throw new Error('Track style store exceeds size limit');
  const target = path.join(dir, filename);
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, document, { flag: 'wx' });
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function candidateList(value) {
  if (!Array.isArray(value) || !value.length || value.length > 12)
    throw invalid();
  const candidates = value.map((candidate) => {
    if (
      !Number.isFinite(candidate?.score) ||
      candidate.score < 0 ||
      candidate.score > 1
    )
      throw invalid();
    return { label: styleLabel(candidate.label), score: candidate.score };
  });
  if (
    uniqueLabels(
      candidates.map(({ label }) => label),
      12,
    ).length !== candidates.length
  )
    throw invalid();
  return candidates;
}

function adoptionCandidate(entry) {
  if (entry?.marketReview === true || !Array.isArray(entry?.candidates))
    return null;
  const [first, ...others] = candidateList(entry.candidates);
  if (
    others.length === 0 ||
    first.score < 0.5 ||
    first.score -
      Math.max(...others.map(({ score }) => score)) +
      Number.EPSILON <
      0.15 ||
    /^(?:j|k)[\s-]?pop$/u.test(labelKey(first.label))
  )
    return null;
  return first;
}

function readEdit(store, trackId) {
  const entry = store[trackId];
  if (entry === undefined) return null;
  if (typeof entry?.audioSha256 !== 'string' || !digest.test(entry.audioSha256))
    throw new Error('Invalid manual style entry');
  return {
    audioSha256: entry.audioSha256,
    tags: uniqueLabels(entry.tags, 24),
    dismissed: uniqueLabels(entry.dismissed, 128),
  };
}

function readImport(file) {
  let doc;
  try {
    doc = readJson(file, 2 * 1024 * 1024);
  } catch (error) {
    if (error instanceof SyntaxError) throw invalid();
    throw error;
  }
  if (
    doc?.version !== 1 ||
    typeof doc.profile !== 'string' ||
    !/^[\w.:-]{1,100}$/u.test(doc.profile) ||
    !Array.isArray(doc.tracks) ||
    !doc.tracks.length ||
    doc.tracks.length > 1000
  )
    throw invalid();
  const seen = new Set();
  const tracks = doc.tracks.map((entry) => {
    if (
      !validId(entry?.trackId) ||
      seen.has(entry.trackId) ||
      typeof entry.audioSha256 !== 'string' ||
      !digest.test(entry.audioSha256) ||
      (entry.marketReview !== undefined &&
        typeof entry.marketReview !== 'boolean')
    )
      throw invalid();
    seen.add(entry.trackId);
    return {
      trackId: entry.trackId,
      audioSha256: entry.audioSha256,
      candidates: candidateList(entry.candidates),
      ...(entry.marketReview === undefined
        ? {}
        : { marketReview: entry.marketReview }),
    };
  });
  return { profile: doc.profile, tracks };
}

function createTrackStyleTagsService({
  getLibraryContext,
  hashAudio = hashAudioFile,
  onCandidateReadError = () => {},
}) {
  const secret = randomBytes(32);
  let importing = false;
  let adoptionPreview = null;

  function checkScope(scope) {
    const current = getLibraryContext();
    if (scope.dir !== current.dir || scope.epoch !== current.epoch)
      throw invalid('stale');
  }

  async function audioBinding(scope, trackId) {
    if (!validId(trackId)) throw invalid();
    const file = resolveTrackAudioPath(scope.dir, trackId);
    if (!file) return null;
    try {
      const root = fs.realpathSync(scope.dir);
      const canonical = fs.realpathSync(file);
      if (path.relative(root, canonical) !== path.relative(scope.dir, file))
        return null;
      const { value } = await hashAudio(canonical, {
        check: () => checkScope(scope),
      });
      checkScope(scope);
      return value;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'WORKS_STALE') return null;
      throw error;
    }
  }

  function editToken(scope, trackId, audio, edit) {
    return createHmac('sha256', secret)
      .update(
        JSON.stringify([scope.epoch, scope.dir, trackId, audio, edit || null]),
      )
      .digest('hex');
  }

  function view(scope, trackId, audio, edit) {
    let candidates = [];
    let candidatesUnavailable = false;
    try {
      const candidate = readStore(scope.dir, candidateFile)[trackId];
      if (candidate?.audioSha256 === audio)
        candidates = candidateList(candidate.candidates);
    } catch (error) {
      onCandidateReadError(error);
      candidatesUnavailable = true;
    }
    return {
      editToken: editToken(scope, trackId, audio, edit),
      tags: edit?.tags ?? [],
      dismissed: edit?.dismissed ?? [],
      needsReview: Boolean(edit && edit.audioSha256 !== audio),
      candidates,
      candidatesUnavailable,
    };
  }

  async function get(trackId) {
    const scope = getLibraryContext();
    const audio = await audioBinding(scope, trackId);
    if (!audio) throw invalid('missing');
    checkScope(scope);
    return view(
      scope,
      trackId,
      audio,
      readEdit(readStore(scope.dir, manualFile), trackId),
    );
  }

  async function save({ trackId, token, tags, dismissed }) {
    if (typeof token !== 'string' || !digest.test(token)) throw invalid();
    const confirmed = uniqueLabels(tags, 24);
    const rejected = uniqueLabels(dismissed, 128);
    const scope = getLibraryContext();
    const audio = await audioBinding(scope, trackId);
    if (!audio) throw invalid('missing');
    checkScope(scope);
    const edits = readStore(scope.dir, manualFile);
    if (token !== editToken(scope, trackId, audio, readEdit(edits, trackId)))
      throw invalid('stale');
    const confirmedKeys = new Set(confirmed.map(labelKey));
    const edit = {
      audioSha256: audio,
      tags: confirmed,
      dismissed: rejected.filter(
        (label) => !confirmedKeys.has(labelKey(label)),
      ),
    };
    const result = view(scope, trackId, audio, edit);
    edits[trackId] = edit;
    writeStore(scope.dir, manualFile, edits);
    return result;
  }

  async function importCandidates(file, scope) {
    if (importing) throw invalid('busy');
    importing = true;
    try {
      checkScope(scope);
      const { profile, tracks } = readImport(file);
      const matched = [];
      for (const { trackId, ...candidate } of tracks) {
        const audio = await audioBinding(scope, trackId);
        if (audio === candidate.audioSha256)
          matched.push([trackId, { ...candidate, profile }]);
      }
      checkScope(scope);
      if (matched.length) {
        const stored = readStore(scope.dir, candidateFile);
        writeStore(
          scope.dir,
          candidateFile,
          Object.assign(stored, Object.fromEntries(matched)),
        );
      }
      return {
        imported: matched.length,
        skipped: tracks.length - matched.length,
      };
    } finally {
      importing = false;
    }
  }

  async function previewAdoption() {
    const scope = getLibraryContext();
    const plan = { id: randomUUID(), scope, entries: new Map() };
    adoptionPreview = plan;
    const stored = readStore(scope.dir, candidateFile);
    const existing = readStore(scope.dir, manualFile);
    const metadata = loadIndex(scope.dir).tracks;
    const rows = [];
    for (const [trackId, entry] of Object.entries(stored)) {
      if (!validId(trackId) || Object.hasOwn(existing, trackId)) continue;
      const candidate = adoptionCandidate(entry);
      if (
        !candidate ||
        (await audioBinding(scope, trackId)) !== entry.audioSha256
      )
        continue;
      plan.entries.set(trackId, { entry, candidate });
      const record = metadata[trackId];
      rows.push({
        trackId,
        title:
          typeof record?.title === 'string'
            ? record.title.slice(0, 200)
            : trackId,
        artist:
          typeof record?.artist === 'string' ? record.artist.slice(0, 200) : '',
        ...candidate,
      });
      if (rows.length === maxAdoptionTracks) break;
    }
    checkScope(scope);
    if (adoptionPreview !== plan) throw invalid('stale');
    return { previewId: plan.id, rows };
  }

  async function applyAdoption(previewId, trackIds) {
    const plan = adoptionPreview;
    if (!plan || plan.id !== previewId) throw invalid('stale');
    if (
      !Array.isArray(trackIds) ||
      !trackIds.length ||
      trackIds.length > maxAdoptionTracks ||
      new Set(trackIds).size !== trackIds.length ||
      trackIds.some((id) => !validId(id) || !plan.entries.has(id))
    )
      throw invalid();
    adoptionPreview = null;
    const { scope } = plan;
    checkScope(scope);
    const matchingAudio = [];
    for (const id of trackIds) {
      if (
        (await audioBinding(scope, id)) ===
        plan.entries.get(id).entry.audioSha256
      )
        matchingAudio.push(id);
    }
    checkScope(scope);
    const current = readStore(scope.dir, candidateFile);
    const edits = readStore(scope.dir, manualFile);
    let adopted = 0;
    for (const id of matchingAudio) {
      const { entry, candidate } = plan.entries.get(id);
      if (
        Object.hasOwn(edits, id) ||
        JSON.stringify(current[id]) !== JSON.stringify(entry)
      )
        continue;
      edits[id] = {
        audioSha256: entry.audioSha256,
        tags: [candidate.label],
        dismissed: [],
        adoptedFrom: entry.profile,
      };
      adopted += 1;
    }
    if (adopted) writeStore(scope.dir, manualFile, edits);
    return { adopted, skipped: trackIds.length - adopted };
  }

  return { get, save, importCandidates, previewAdoption, applyAdoption };
}

module.exports = { createTrackStyleTagsService };
