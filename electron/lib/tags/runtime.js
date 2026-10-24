'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createWorkOrganizationService } = require('../works/service');
const { loadCatalogCollections } = require('../playlists');
const { validateWorksDocument } = require('../works/organization');
const { assertNoTransaction } = require('../reconciliation/transaction');
const {
  failure,
  record,
  identifier,
  digest,
  readSnapshot,
  readDocument,
} = require('../reconciliation/documents');
const { validDate } = require('../reconciliation/metadata');
const { inspectFlac, editFlacComments } = require('./flac');
const {
  managedPath,
  backupPath,
  stageTagFile,
  commitStagedTagFile,
  discardStagedTagFile,
  recoverTagFile,
  readTagAudio,
} = require('./transaction');
const {
  transitionReferences,
  eligibleTagReleases,
  tagValues,
} = require('./transition');
const { hashAudioFile } = require('../works/trackBinding');
const { stamp } = require('../reconciliation/scan');
const { hasControlCharacters } = require('../textGuards');
const { parseBuffer } = require('music-metadata');

const { KEYS, readTagLedger, essence } = require('./ledger');
async function semanticTags(bytes) {
  const { common, format } = await parseBuffer(
    bytes,
    { mimeType: 'audio/flac' },
    { skipCovers: true, duration: false },
  );
  if (
    format.container !== 'FLAC' ||
    format.codec !== 'FLAC' ||
    !format.sampleRate ||
    !format.numberOfChannels
  )
    throw failure('TAGS_UNSUPPORTED');
  return {
    title: common.title ?? '',
    artist: common.artist ?? '',
    album: common.album ?? '',
    albumArtist: common.albumartist ?? '',
    releaseDate: common.date ?? '',
    trackNumber: common.track?.no ?? null,
    trackTotal: common.track?.of ?? null,
    discNumber: common.disk?.no ?? null,
    discTotal: common.disk?.of ?? null,
  };
}
function validateFields(fields, values) {
  if (
    !Array.isArray(fields) ||
    !fields.length ||
    fields.length > 9 ||
    new Set(fields).size !== fields.length
  )
    throw failure();
  for (const field of fields) {
    if (!Object.hasOwn(KEYS, field) || !Object.hasOwn(values, field))
      throw failure();
    const value = values[field];
    if (typeof value === 'string') {
      if (
        value.length > 200 ||
        hasControlCharacters(value) ||
        (field === 'title' && !value.trim()) ||
        (field === 'releaseDate' && value && !validDate(value))
      )
        throw failure();
    } else if (!Number.isSafeInteger(value) || value < 1 || value > 5000)
      throw failure();
  }
  for (const [number, total] of [
    ['trackNumber', 'trackTotal'],
    ['discNumber', 'discTotal'],
  ])
    if (
      fields.some((f) => f === number || f === total) &&
      values[number] &&
      values[total] &&
      values[number] > values[total]
    )
      throw failure();
}
function createTagWritebackService({
  getDirectory,
  notifyChanged = () => {},
  isBusy = () => false,
  onProgress = () => {},
  now = Date.now,
}) {
  const lane = createWorkOrganizationService({
    getLibraryContext: getDirectory,
    resolveTrack: async () => null,
  });
  const previews = new Map();
  let generation = 0,
    activityIds = null,
    committing = false,
    job = null,
    cancellationRevision = 0;
  const capture = () => ({ ...getDirectory(), generation });
  function current(scope) {
    const next = capture();
    if (
      path.resolve(scope.dir) !== path.resolve(next.dir) ||
      scope.epoch !== next.epoch ||
      scope.generation !== next.generation
    )
      throw failure('RECONCILIATION_STALE');
  }
  function activity(input) {
    record(input, ['trackIds']);
    if (!Array.isArray(input.trackIds) || input.trackIds.length > 32)
      throw failure();
    input.trackIds.forEach(identifier);
    activityIds = new Set(input.trackIds);
    return { status: 'ready' };
  }
  function assertIdle(id) {
    if (activityIds === null || activityIds.has(id) || isBusy(id))
      throw failure('TAGS_BUSY');
  }
  function report(phase) {
    if (job && job.phase !== phase)
      try {
        job.phase = phase;
        onProgress({
          libraryEpoch: job.scope.epoch,
          trackId: job.trackId,
          phase,
        });
      } catch {
        /* Progress cannot change a file result. */
      }
  }
  function checkJob() {
    if (job?.cancelled) throw failure('RECONCILIATION_CANCELLED');
    if (job) current(job.scope);
  }
  async function waitIdle() {
    while (
      activityIds === null ||
      activityIds.has(job.trackId) ||
      isBusy(job.trackId)
    ) {
      checkJob();
      if (now() - job.created > 10 * 60 * 1000)
        throw failure('RECONCILIATION_EXPIRED');
      report('waiting');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    checkJob();
  }
  function cancel() {
    cancellationRevision++;
    if (job) job.cancelled = true;
    return { status: 'cancelling' };
  }
  function snapshots(scope) {
    assertNoTransaction(scope.dir);
    const base = readSnapshot(scope.dir),
      works = readDocument(scope.dir, 'works.json'),
      ledger = readTagLedger(scope.dir);
    if (works.data) validateWorksDocument(works.data);
    return { ...base, works, ledger };
  }
  function same(scope, docs) {
    current(scope);
    const fresh = snapshots(scope);
    for (const key of Object.keys(docs))
      if (docs[key].fingerprint !== fresh[key].fingerprint)
        throw failure('RECONCILIATION_CONFLICT');
  }
  async function load(input) {
    record(input, ['trackId', 'collectionId', 'position', 'fields']);
    identifier(input.trackId);
    const scope = capture(),
      docs = snapshots(scope);
    const entry = docs.index.data.tracks[input.trackId];
    if (!entry) throw failure('RECONCILIATION_CONFLICT');
    let file;
    try {
      file = managedPath(scope.dir, input.trackId);
    } catch (error) {
      if (error.code === 'ENOENT') throw failure('TAGS_UNSUPPORTED');
      throw error;
    }
    const stat = fs.statSync(file);
    if (!stat.size || stat.size > 256 * 1024 ** 2) throw failure('TAGS_LIMIT');
    const beforeStamp = stamp(stat),
      binding = await hashAudioFile(file, { maxBytes: 256 * 1024 ** 2 });
    const bytes = await readTagAudio(file);
    if (
      digest(bytes) !== binding.value ||
      stamp(fs.statSync(file)) !== beforeStamp
    )
      throw failure('RECONCILIATION_CONFLICT');
    const parsed = inspectFlac(bytes);
    const semantic = await semanticTags(bytes);
    same(scope, docs);
    const releases = eligibleTagReleases(
      loadCatalogCollections(scope.dir).filter((c) =>
        docs.playlists.data.playlists.some((p) => p.id === c.id),
      ),
      input.trackId,
      binding.value,
    );
    let release = null;
    if (input.collectionId !== undefined || input.position !== undefined) {
      identifier(input.collectionId);
      release = releases.find(
        (r) =>
          r.collectionId === input.collectionId &&
          r.position === input.position,
      );
      if (!release) throw failure('RECONCILIATION_CONFLICT');
    }
    const values = tagValues(entry, release);
    return {
      scope,
      docs,
      file,
      bytes,
      parsed,
      semantic,
      binding,
      beforeStamp,
      releases,
      values,
      release,
      trackId: input.trackId,
    };
  }
  async function options(input) {
    record(input, ['trackId', 'collectionId', 'position']);
    try {
      const v = await load(input);
      return {
        status: 'ready',
        supported: true,
        format: 'FLAC',
        libraryEpoch: v.scope.epoch,
        trackId: v.trackId,
        title: v.docs.index.data.tracks[v.trackId].title ?? v.trackId,
        releases: v.releases,
        values: v.values,
        current: v.semantic,
        history: v.docs.ledger.data.receipts
          .filter((r) => r.trackId === v.trackId)
          .reverse()
          .map((r) => ({
            receiptId: r.id,
            createdAt: r.createdAt,
            fields: r.fields,
            canRestore:
              r.afterHash === v.binding.value &&
              !r.restoredFrom &&
              !v.docs.ledger.data.receipts.some(
                (other) => other.restoredFrom === r.id,
              ),
          }))
          .sort(
            (left, right) => Number(right.canRestore) - Number(left.canRestore),
          )
          .slice(0, 10),
      };
    } catch (error) {
      if (error.code === 'TAGS_UNSUPPORTED')
        return {
          status: 'ready',
          supported: false,
          trackId: input.trackId,
          libraryEpoch: capture().epoch,
        };
      throw error;
    }
  }
  async function preview(input) {
    const v = await load(input);
    validateFields(input.fields, v.values);
    const changes = {};
    for (const field of input.fields)
      changes[KEYS[field]] =
        v.values[field] === '' ? [] : [String(v.values[field])];
    // Remove alternative total aliases only when that total is explicitly chosen.
    if (input.fields.includes('trackTotal')) changes.TOTALTRACKS = [];
    if (input.fields.includes('discTotal')) changes.TOTALDISCS = [];
    if (input.fields.includes('albumArtist')) changes['ALBUM ARTIST'] = [];
    for (const [number, total] of [
      ['trackNumber', 'trackTotal'],
      ['discNumber', 'discTotal'],
    ]) {
      if (
        input.fields.includes(number) &&
        !input.fields.includes(total) &&
        v.semantic[total]
      )
        changes[KEYS[number]] = [`${v.values[number]}/${v.semantic[total]}`];
      if (
        input.fields.includes(total) &&
        !input.fields.includes(number) &&
        v.semantic[number]
      )
        changes[KEYS[number]] = [String(v.semantic[number])];
    }
    const output = editFlacComments(v.bytes, changes);
    if (essence(output) !== essence(v.bytes))
      throw failure('TAGS_VERIFICATION_FAILED');
    const roundtrip = await semanticTags(output);
    for (const [number, total] of [
      ['trackNumber', 'trackTotal'],
      ['discNumber', 'discTotal'],
    ])
      if (
        roundtrip[number] &&
        roundtrip[total] &&
        roundtrip[number] > roundtrip[total]
      )
        throw failure('TAGS_VERIFICATION_FAILED');
    for (const field of Object.keys(KEYS))
      if (
        roundtrip[field] !==
        (input.fields.includes(field) ? v.values[field] : v.semantic[field])
      )
        throw failure('TAGS_VERIFICATION_FAILED');
    const id = crypto.randomUUID();
    while (previews.size >= 4) previews.delete(previews.keys().next().value);
    const before = v.semantic;
    previews.set(id, {
      scope: v.scope,
      docs: v.docs,
      beforeHash: v.binding.value,
      beforeStamp: v.beforeStamp,
      trackId: v.trackId,
      changes,
      fields: input.fields,
      release: v.release,
      created: now(),
      afterHash: digest(output),
      essence: essence(v.bytes),
    });
    return {
      status: 'ready',
      libraryEpoch: v.scope.epoch,
      previewId: id,
      trackId: v.trackId,
      format: 'FLAC',
      release: v.release,
      fields: input.fields.map((field) => ({
        field,
        before:
          before[field] === null || before[field] === ''
            ? []
            : [String(before[field])],
        after: v.values[field],
      })),
      unchanged: digest(output) === v.binding.value,
    };
  }
  async function install(p, output, restoredFrom) {
    if (committing) throw failure('TAGS_BUSY');
    committing = true;
    job = {
      scope: p.scope,
      trackId: p.trackId,
      created: p.created ?? now(),
      cancelled: false,
    };
    let staged,
      installed = false;
    try {
      same(p.scope, p.docs);
      await waitIdle();
      same(p.scope, p.docs);
      const id = crypto.randomUUID(),
        nextHash = digest(output);
      const migrated = transitionReferences(
        {
          playlists: p.docs.playlists.data,
          index: p.docs.index.data,
          works: p.docs.works.data,
        },
        p.trackId,
        p.beforeHash,
        nextHash,
      );
      const receipt = {
        id,
        backupId: id,
        trackId: p.trackId,
        beforeHash: p.beforeHash,
        afterHash: nextHash,
        essence: p.essence,
        createdAt: new Date(now()).toISOString(),
        fields: p.fields,
        collectionId: p.release?.collectionId ?? null,
        position: p.release?.position ?? null,
        ...(restoredFrom ? { restoredFrom } : {}),
      };
      const ledger = {
        version: 1,
        receipts: [...p.docs.ledger.data.receipts, receipt],
      };
      if (
        ledger.receipts.length > 200 ||
        (!restoredFrom &&
          ledger.receipts.filter((r) => !r.restoredFrom).length > 100)
      )
        throw failure('TAGS_LIMIT');
      const changes = [];
      for (const [key, filename] of [
        ['playlists', 'playlists.json'],
        ['index', 'library.json'],
        ['works', 'works.json'],
      ])
        if (JSON.stringify(migrated[key]) !== JSON.stringify(p.docs[key].data))
          changes.push({
            filename,
            before: p.docs[key].raw,
            after: JSON.stringify(migrated[key], null, 2),
          });
      changes.push({
        filename: 'tag-writebacks.json',
        before: p.docs.ledger.raw,
        after: JSON.stringify(ledger, null, 2),
      });
      report('staging');
      staged = await stageTagFile(p.scope.dir, {
        id,
        trackId: p.trackId,
        beforeHash: p.beforeHash,
        output,
        changes,
        restore: Boolean(restoredFrom),
      });
      await waitIdle();
      return await lane.runInLibrary(async () => {
        checkJob();
        same(p.scope, p.docs);
        assertIdle(p.trackId);
        const file = managedPath(p.scope.dir, p.trackId),
          beforeStamp = stamp(fs.statSync(file));
        const fresh = await hashAudioFile(file, { maxBytes: 256 * 1024 ** 2 });
        same(p.scope, p.docs);
        assertIdle(p.trackId);
        if (
          fresh.value !== p.beforeHash ||
          beforeStamp !== stamp(fs.statSync(file))
        )
          throw failure('RECONCILIATION_CONFLICT');
        checkJob();
        report('committing');
        commitStagedTagFile(p.scope.dir, staged);
        installed = true;
        previews.clear();
        try {
          notifyChanged({
            libraryEpoch: p.scope.epoch,
            collectionIds: migrated.playlists.playlists
              .filter((c) => c.trackIds.includes(p.trackId))
              .map((c) => c.id),
          });
        } catch {
          /* A closed window cannot undo a durable commit. */
        }
        return { status: 'saved', libraryEpoch: p.scope.epoch, receiptId: id };
      });
    } finally {
      if (staged && !installed) discardStagedTagFile(p.scope.dir, staged);
      committing = false;
      job = null;
    }
  }
  async function commit(input) {
    const requestRevision = cancellationRevision;
    record(input, ['previewId']);
    const p = previews.get(input.previewId);
    if (!p || now() - p.created > 10 * 60 * 1000)
      throw failure('RECONCILIATION_EXPIRED');
    same(p.scope, p.docs);
    const bytes = await readTagAudio(managedPath(p.scope.dir, p.trackId));
    if (digest(bytes) !== p.beforeHash)
      throw failure('RECONCILIATION_CONFLICT');
    const output = editFlacComments(bytes, p.changes);
    if (digest(output) !== p.afterHash || essence(output) !== p.essence)
      throw failure('TAGS_VERIFICATION_FAILED');
    if (requestRevision !== cancellationRevision)
      throw failure('RECONCILIATION_CANCELLED');
    return install(p, output);
  }
  async function restore(input) {
    const requestRevision = cancellationRevision;
    record(input, ['receiptId']);
    const scope = capture(),
      docs = snapshots(scope),
      receipt = docs.ledger.data.receipts.find((r) => r.id === input.receiptId);
    if (!receipt || receipt.restoredFrom)
      throw failure('RECONCILIATION_EXPIRED');
    if (docs.ledger.data.receipts.some((r) => r.restoredFrom === receipt.id))
      throw failure('RECONCILIATION_EXPIRED');
    const output = await readTagAudio(
      backupPath(scope.dir, receipt.backupId, 'original.flac'),
    );
    if (
      digest(output) !== receipt.beforeHash ||
      essence(output) !== receipt.essence
    )
      throw failure('TAGS_VERIFICATION_FAILED');
    if (requestRevision !== cancellationRevision)
      throw failure('RECONCILIATION_CANCELLED');
    return install(
      {
        scope,
        docs,
        trackId: receipt.trackId,
        beforeHash: receipt.afterHash,
        essence: receipt.essence,
        fields: receipt.fields,
        release: null,
      },
      output,
      receipt.id,
    );
  }
  function recover() {
    const scope = capture(),
      journal = readDocument(scope.dir, 'library-tags-journal.json');
    if (journal.data) assertIdle(journal.data.trackId);
    const result = recoverTagFile(scope.dir);
    previews.clear();
    if (result.recovered)
      try {
        notifyChanged({ libraryEpoch: scope.epoch, collectionIds: [] });
      } catch {
        /* A closed window cannot undo recovery. */
      }
    return { status: 'ready', ...result };
  }
  return {
    options,
    preview,
    commit,
    restore,
    recover,
    activity,
    cancel,
    invalidate() {
      cancel();
      generation++;
      previews.clear();
      activityIds = null;
    },
  };
}
module.exports = { createTagWritebackService, readTagLedger };
