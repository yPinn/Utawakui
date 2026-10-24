'use strict';

const fs = require('node:fs');
const path = require('node:path');
const organization = require('./organization');
const { createWorkOrganizationService } = require('./service');
const { bindingsEqual, hashAudioFile } = require('./trackBinding');
const tracks = require('../library/tracks');
const { atomicWriteJson } = require('../atomicWrite');
const { INDEX_FILENAME } = require('../library/constants');
const {
  isStructuredAudioFilename,
  compareFilenames,
  resolveTrackPath,
} = require('../library/paths');
const { hasControlCharacters } = require('../textGuards');

const DEFAULT_VERSION = Object.freeze({
  arrangement: 'unspecified',
  performance: 'unspecified',
  vocal: 'unspecified',
  label: '',
  note: '',
});
function failure(code = 'WORKS_INVALID') {
  return Object.assign(new Error('Work organization operation failed'), {
    code,
  });
}
function record(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw failure();
}
function identifier(value, allowReserved = false) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 255 ||
    value !== value.trim() ||
    hasControlCharacters(value) ||
    /[/\\]/.test(value) ||
    ['.', '..'].includes(value) ||
    (!allowReserved &&
      ['__proto__', 'constructor', 'prototype'].includes(value)) ||
    path.win32.isAbsolute(value)
  )
    throw failure();
  return value;
}
function queryText(value) {
  if (
    typeof value !== 'string' ||
    value.length > 200 ||
    hasControlCharacters(value)
  )
    throw failure();
  return value.trim().toLocaleLowerCase();
}

// Candidate ranking is only a search aid; identity still needs an explicit link.
function comparableTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]+/gu, ' ')
    .trim();
}
function baseTitle(value) {
  return value
    .replace(
      /(?:^|\s)(?:acoustic|live|demo|cover|remix|instrumental|ver|version|翻唱|現場版|伴奏版|試唱版)(?=\s|$)/gu,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}
function titleScore(value, query) {
  if (!query) return 1;
  const title = comparableTitle(value);
  if (!title) return 0;
  if (title === query) return 5;
  const left = baseTitle(title) || title;
  const right = baseTitle(query) || query;
  if (title === right) return 4;
  if (left === right) return 3;
  if (left.includes(right) || right.includes(left)) return 2;
  const a = Array.from(left.replace(/\s/g, ''));
  const b = Array.from(right.replace(/\s/g, ''));
  if (Math.min(a.length, b.length) < 4) return 0;
  const pairs = new Map();
  for (let i = 1; i < a.length; i += 1) {
    const pair = a[i - 1] + a[i];
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }
  let matches = 0;
  for (let i = 1; i < b.length; i += 1) {
    const pair = b[i - 1] + b[i];
    if (pairs.get(pair)) {
      matches += 1;
      pairs.set(pair, pairs.get(pair) - 1);
    }
  }
  const score = (2 * matches) / (a.length + b.length - 2);
  return score >= 0.65 ? score : 0;
}

// The runtime is Main-owned. Inputs are product intents; canonical audio paths,
// content bindings and deletion receipts never cross its public projection.
function createWorkOrganizationRuntime({
  getDirectory,
  findTrackRecord = tracks.findTrackRecord,
  findTrack = tracks.findTrack,
  listTracks = tracks.listTracks,
  deleteTrack = tracks.deleteTrack,
  cleanupReferences = async () => {},
  notifyChanged = () => {},
} = {}) {
  if (typeof getDirectory !== 'function') throw failure();
  let generation = 0;
  const service = createWorkOrganizationService({
    getLibraryContext: getDirectory,
    resolveTrack: async () => null,
    staleScopeCode: 'WORKS_SCOPE_STALE',
  });

  function assertCurrent(context) {
    const current = getDirectory();
    if (
      !current ||
      path.resolve(current.dir) !== context.dir ||
      current.epoch !== context.epoch ||
      context.generation !== generation
    )
      throw failure('WORKS_SCOPE_STALE');
  }
  function available(context) {
    // Do not let helpers which intentionally swallow ENOENT/permission errors
    // mistake an offline library volume for a deleted track.
    try {
      if (!fs.statSync(context.dir).isDirectory()) throw failure();
      fs.readdirSync(context.dir);
    } catch (cause) {
      throw Object.assign(failure('WORKS_UNAVAILABLE'), { cause });
    }
  }
  async function inspect(trackId, context, { allowEmpty = false } = {}) {
    identifier(trackId, true);
    available(context);
    const trackDirectory = path.join(context.dir, 'tracks', trackId);
    let audioPath;
    try {
      const names = fs.readdirSync(trackDirectory, { withFileTypes: true });
      const filename = names
        .filter(
          (entry) => entry.isFile() && isStructuredAudioFilename(entry.name),
        )
        .map((entry) => entry.name)
        .sort(compareFilenames)[0];
      if (filename) audioPath = path.join(trackDirectory, filename);
    } catch (cause) {
      if (cause.code !== 'ENOENT')
        throw Object.assign(failure('WORKS_UNAVAILABLE'), { cause });
    }
    if (!audioPath) {
      // A successful root listing makes legacy absence distinguishable from an
      // inaccessible library. Only canonical original audio is considered.
      const legacy = fs
        .readdirSync(context.dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(compareFilenames)
        .find(
          (name) =>
            path.basename(name, path.extname(name)) === trackId &&
            resolveTrackPath(context.dir, name),
        );
      if (legacy) audioPath = resolveTrackPath(context.dir, legacy);
    }
    if (!audioPath) return { status: 'missing' };
    try {
      const binding = await hashAudioFile(audioPath, { allowEmpty });
      assertCurrent(context);
      return { status: 'present', binding };
    } catch (cause) {
      assertCurrent(context);
      // Disappearance while reading is a concurrent change, not evidence that
      // a previously prepared delete has safely finished.
      throw Object.assign(
        failure(
          cause.code === 'WORKS_STALE' ? 'WORKS_STALE' : 'WORKS_UNAVAILABLE',
        ),
        { cause },
      );
    }
  }
  async function resolve(trackId, context, options) {
    const result = await inspect(trackId, context, options);
    if (result.status !== 'present') throw failure('WORKS_NOT_FOUND');
    return result.binding;
  }
  function changed(context, document, trackIds) {
    try {
      notifyChanged({
        libraryEpoch: context.epoch,
        revision: document.revision,
        ...(trackIds ? { trackIds } : {}),
      });
    } catch {
      /* observer cannot roll back a committed mutation */
    }
  }
  function checkRevision(input, context, document) {
    if (input.libraryEpoch !== context.epoch)
      throw failure('WORKS_SCOPE_STALE');
    if (input.expectedRevision !== document.revision)
      throw failure('WORKS_STALE');
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    )
      throw failure();
  }
  async function snapshot(
    trackId,
    context,
    document = organization.loadWorks(context.dir),
    paging = {},
  ) {
    const offset = paging.offset ?? 0;
    const limit = paging.limit ?? 50;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw failure();
    const binding = await resolve(trackId, context);
    const stored = document.trackProfiles[trackId];
    const profile = organization.getBoundTrackProfile(
      document,
      trackId,
      binding,
    );
    const workId = profile?.workLink?.workId;
    const work = workId ? { id: workId, ...document.works[workId] } : null;
    if (work) {
      delete work.createdAt;
      delete work.updatedAt;
    }
    const relatedVersions = [];
    const candidates = workId
      ? Object.entries(document.trackProfiles).filter(
          ([id, candidate]) =>
            id !== trackId && candidate.workLink?.workId === workId,
        )
      : [];
    const hasMore = offset + limit < candidates.length;
    for (const [id, candidate] of candidates.slice(offset, offset + limit)) {
      const inspected = await inspect(id, context);
      if (
        inspected.status === 'present' &&
        organization.getBoundTrackProfile(document, id, inspected.binding)
      )
        relatedVersions.push({
          trackId: id,
          relationship: candidate.workLink.relationship,
          versionInfo: candidate.versionInfo,
        });
    }
    assertCurrent(context);
    return {
      status: 'ok',
      libraryEpoch: context.epoch,
      revision: document.revision,
      trackId,
      bindingStatus: stored ? (profile ? 'current' : 'changed') : 'unlinked',
      work,
      relationship: profile?.workLink?.relationship ?? 'unknown',
      versionInfo: profile?.versionInfo ?? { ...DEFAULT_VERSION },
      relatedVersions,
      relatedCandidateTotal: candidates.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }
  function get(input) {
    return service.runInLibrary((context) => {
      record(input, ['trackId', 'offset', 'limit']);
      identifier(input.trackId);
      return snapshot(input.trackId, context, undefined, input);
    });
  }
  function search(input) {
    return service.runInLibrary(async (context) => {
      record(input, ['trackId', 'query', 'limit']);
      identifier(input.trackId);
      const query = queryText(input.query);
      const titleQuery = comparableTitle(query) || query;
      const limit = input.limit ?? 20;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
        throw failure();
      const sourceBinding = await resolve(input.trackId, context);
      const document = organization.loadWorks(context.dir);
      const sourceWorkId = organization.getBoundTrackProfile(
        document,
        input.trackId,
        sourceBinding,
      )?.workLink?.workId;
      const counts = new Map();
      for (const profile of Object.values(document.trackProfiles))
        if (profile.workLink)
          counts.set(
            profile.workLink.workId,
            (counts.get(profile.workLink.workId) ?? 0) + 1,
          );
      const works = Object.entries(document.works)
        .map(([id, work]) => ({
          id,
          work,
          score: Math.max(
            ...[work.title, ...work.aliases].map((value) =>
              titleScore(value, titleQuery),
            ),
          ),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ id, work }) => ({
          id,
          title: work.title,
          memberCount: counts.get(id) ?? 0,
        }));
      const candidates = listTracks(context.dir)
        .filter(
          (track) =>
            track.id !== input.trackId &&
            (!sourceWorkId ||
              document.trackProfiles[track.id]?.workLink?.workId !==
                sourceWorkId),
        )
        .map((track) => ({
          track,
          score: Math.max(
            titleScore(track.title, titleQuery),
            ...[
              document.works[
                document.trackProfiles[track.id]?.workLink?.workId
              ],
            ]
              .filter(Boolean)
              .flatMap((work) => [work.title, ...work.aliases])
              .map((value) => titleScore(value, titleQuery)),
            query &&
              String(track.artist || '')
                .toLocaleLowerCase()
                .includes(query)
              ? 0.1
              : 0,
          ),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ track }) => ({
          id: track.id,
          title: track.title || track.id,
          artist: track.artist || '',
          workId: document.trackProfiles[track.id]?.workLink?.workId || null,
        }));
      assertCurrent(context);
      return {
        status: 'ok',
        libraryEpoch: context.epoch,
        revision: document.revision,
        works,
        tracks: candidates,
      };
    });
  }
  function save(input) {
    return service.runInLibrary(async (context) => {
      record(input, [
        'trackId',
        'expectedRevision',
        'libraryEpoch',
        'selection',
        'relationship',
        'versionInfo',
        'reconfirm',
      ]);
      identifier(input.trackId);
      record(input.selection, ['kind', 'workId', 'title', 'targetTrackId']);
      const selection = input.selection;
      const selectionFields = {
        keep: ['kind'],
        none: ['kind'],
        existing: ['kind', 'workId'],
        new: ['kind', 'title', 'targetTrackId'],
        track: ['kind', 'targetTrackId'],
      };
      if (selectionFields[selection.kind])
        record(selection, selectionFields[selection.kind]);
      if (
        !['keep', 'none', 'existing', 'new', 'track'].includes(
          selection.kind,
        ) ||
        (input.reconfirm !== undefined && typeof input.reconfirm !== 'boolean')
      )
        throw failure();
      if (
        input.relationship !== undefined &&
        !['unknown', 'original', 'cover'].includes(input.relationship)
      )
        throw failure();
      const document = organization.loadWorks(context.dir);
      checkRevision(input, context, document);
      const binding = await resolve(input.trackId, context);
      const previous = document.trackProfiles[input.trackId];
      const bindingChanged =
        previous && !bindingsEqual(previous.binding, binding);
      if (bindingChanged && !input.reconfirm)
        throw failure('WORKS_BINDING_MISMATCH');
      // A changed original projects an empty profile. Reconfirmation accepts
      // that displayed state; restoring an earlier hidden work requires an
      // explicit existing-work selection by the operator.
      const displayedProfile = bindingChanged ? undefined : previous;
      const common = {
        trackId: input.trackId,
        binding,
        ...(input.versionInfo !== undefined
          ? { versionInfo: input.versionInfo }
          : bindingChanged
            ? { versionInfo: { ...DEFAULT_VERSION } }
            : {}),
        ...(input.reconfirm ? { reconfirm: true } : {}),
      };
      let target;
      let targetWorkId;
      let targetTitle;
      if (selection.kind === 'track') {
        identifier(selection.targetTrackId);
        if (selection.targetTrackId === input.trackId) throw failure();
        const targetBinding = await resolve(selection.targetTrackId, context);
        const storedTarget = document.trackProfiles[selection.targetTrackId];
        const targetProfile = organization.getBoundTrackProfile(
          document,
          selection.targetTrackId,
          targetBinding,
        );
        if (storedTarget && !targetProfile)
          throw failure('WORKS_TARGET_CHANGED');
        targetWorkId = targetProfile?.workLink?.workId;
        const targetTrack = findTrack(context.dir, selection.targetTrackId);
        if (!targetTrack) throw failure('WORKS_NOT_FOUND');
        targetTitle =
          String(targetTrack.title || '')
            .trim()
            .slice(0, 200) || '未命名';
        target = {
          trackId: selection.targetTrackId,
          binding: targetBinding,
          relationship: 'unknown',
        };
      }
      if (selection.kind === 'new' && selection.targetTrackId !== undefined) {
        identifier(selection.targetTrackId);
        if (selection.targetTrackId === input.trackId) throw failure();
        if (document.trackProfiles[selection.targetTrackId]?.workLink)
          throw failure('WORKS_TARGET_LINKED');
        target = {
          trackId: selection.targetTrackId,
          binding: await resolve(selection.targetTrackId, context),
          relationship: 'unknown',
        };
      }
      // Recheck originals after all asynchronous reads, immediately before commit.
      if (!bindingsEqual(binding, await resolve(input.trackId, context)))
        throw failure('WORKS_BINDING_MISMATCH');
      if (
        target &&
        !bindingsEqual(target.binding, await resolve(target.trackId, context))
      )
        throw failure(
          selection.kind === 'track'
            ? 'WORKS_TARGET_CHANGED'
            : 'WORKS_BINDING_MISMATCH',
        );
      assertCurrent(context);
      let updated;
      if (
        selection.kind === 'new' ||
        (selection.kind === 'track' && !targetWorkId)
      )
        updated = organization.createAndLinkWork(context.dir, {
          expectedRevision: input.expectedRevision,
          title: selection.kind === 'track' ? targetTitle : selection.title,
          tracks: [
            { ...common, relationship: input.relationship ?? 'unknown' },
            ...(target ? [target] : []),
          ],
        });
      else {
        let workLink;
        if (selection.kind === 'none') workLink = null;
        else if (selection.kind === 'existing')
          workLink = {
            workId: selection.workId,
            relationship: input.relationship ?? 'unknown',
          };
        else if (selection.kind === 'track')
          workLink = {
            workId: targetWorkId,
            relationship: input.relationship ?? 'unknown',
          };
        else
          workLink = displayedProfile?.workLink
            ? {
                ...displayedProfile.workLink,
                relationship:
                  input.relationship ?? displayedProfile.workLink.relationship,
              }
            : null;
        updated = organization.saveTrackProfile(context.dir, {
          expectedRevision: input.expectedRevision,
          ...common,
          workLink,
        });
      }
      changed(context, updated, [
        input.trackId,
        ...(target ? [target.trackId] : []),
      ]);
      return snapshot(input.trackId, context, updated);
    });
  }
  function rename(input) {
    return service.runInLibrary((context) => {
      record(input, ['workId', 'title', 'expectedRevision', 'libraryEpoch']);
      available(context);
      checkRevision(input, context, organization.loadWorks(context.dir));
      const document = organization.renameWork(context.dir, {
        workId: input.workId,
        title: input.title,
        expectedRevision: input.expectedRevision,
      });
      changed(context, document);
      return {
        status: 'ok',
        libraryEpoch: context.epoch,
        revision: document.revision,
      };
    });
  }
  async function finish(context, operationId) {
    let document = organization.loadWorks(context.dir);
    const receipt = document.pendingTrackDeletions[operationId];
    if (!receipt) return document;
    await cleanupReferences(receipt.trackId, receipt.binding, context);
    assertCurrent(context);
    // library.deleteTrack can fail after unlinking audio but before its scalar
    // index write. Clear that orphan only while canonical media is still absent;
    // replacement media and malformed metadata remain untouched.
    const inspected = await inspect(receipt.trackId, context, {
      allowEmpty: true,
    });
    if (inspected.status === 'missing') {
      const file = path.join(context.dir, INDEX_FILENAME);
      let index;
      try {
        index = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (cause) {
        if (cause.code !== 'ENOENT') throw cause;
      }
      if (index) {
        if (
          !index.tracks ||
          typeof index.tracks !== 'object' ||
          Array.isArray(index.tracks)
        )
          throw failure();
        if (Object.hasOwn(index.tracks, receipt.trackId)) {
          delete index.tracks[receipt.trackId];
          atomicWriteJson(file, index);
        }
      }
    }
    document = organization.loadWorks(context.dir);
    return organization.finishTrackDeletion(context.dir, {
      expectedRevision: document.revision,
      operationId,
    });
  }
  async function reconcileInLane(context, trackId) {
    available(context);
    const before = organization.loadWorks(context.dir);
    for (const [operationId, receipt] of Object.entries(
      before.pendingTrackDeletions,
    )) {
      if (trackId !== undefined && receipt.trackId !== trackId) continue;
      const inspected = await inspect(receipt.trackId, context, {
        allowEmpty: true,
      });
      const document = organization.loadWorks(context.dir);
      if (
        receipt.phase === 'prepared' &&
        inspected.status === 'present' &&
        bindingsEqual(receipt.binding, inspected.binding)
      ) {
        organization.finishTrackDeletion(context.dir, {
          expectedRevision: document.revision,
          operationId,
          cancel: true,
        });
        continue;
      }
      if (receipt.phase === 'prepared')
        organization.markTrackMediaDeleted(context.dir, {
          expectedRevision: document.revision,
          operationId,
        });
      await finish(context, operationId);
    }
    const document = organization.loadWorks(context.dir);
    if (document.revision !== before.revision) changed(context, document);
    return document;
  }
  function reconcile() {
    return service.runInLibrary(reconcileInLane);
  }
  function remove(input) {
    return service.runInLibrary(async (context) => {
      record(input, ['trackId']);
      identifier(input.trackId, true);
      available(context);
      const before = organization.loadWorks(context.dir);
      const pending = Object.entries(before.pendingTrackDeletions).find(
        ([, receipt]) => receipt.trackId === input.trackId,
      );
      if (pending) {
        const inspected = await inspect(input.trackId, context, {
          allowEmpty: true,
        });
        if (
          inspected.status === 'missing' ||
          !bindingsEqual(inspected.binding, pending[1].binding) ||
          pending[1].phase === 'media-deleted'
        ) {
          await reconcileInLane(context, input.trackId);
          return true;
        }
        organization.finishTrackDeletion(context.dir, {
          expectedRevision: before.revision,
          operationId: pending[0],
          cancel: true,
        });
      }
      const inspected = await inspect(input.trackId, context, {
        allowEmpty: true,
      });
      if (inspected.status !== 'present') return false;
      const document = organization.loadWorks(context.dir);
      const prepared = organization.prepareTrackDeletion(context.dir, {
        expectedRevision: document.revision,
        trackId: input.trackId,
        binding: inspected.binding,
      });
      const [operationId] = Object.entries(prepared.pendingTrackDeletions).find(
        ([, receipt]) => receipt.trackId === input.trackId,
      );
      if (
        !bindingsEqual(
          inspected.binding,
          await resolve(input.trackId, context, { allowEmpty: true }),
        )
      )
        throw failure('WORKS_BINDING_MISMATCH');
      // findTrackRecord/deleteTrack retain the existing filesystem-first deletion
      // and scalar metadata cleanup; provider execution never enters this lane.
      if (
        !findTrackRecord(context.dir, input.trackId) ||
        !(await deleteTrack(context.dir, input.trackId))
      )
        throw failure('WORKS_NOT_FOUND');
      assertCurrent(context);
      organization.markTrackMediaDeleted(context.dir, {
        expectedRevision: prepared.revision,
        operationId,
      });
      const updated = await finish(context, operationId);
      changed(context, updated, [input.trackId]);
      return true;
    });
  }
  function runImport(input, finalize) {
    return service.runInLibrary(async (context) => {
      record(input, ['dir', 'trackId', 'libraryEpoch']);
      if (
        input.libraryEpoch !== undefined &&
        input.libraryEpoch !== context.epoch
      )
        throw failure('WORKS_SCOPE_STALE');
      if (
        typeof input.dir !== 'string' ||
        path.resolve(input.dir) !== context.dir
      )
        throw failure('WORKS_STALE');
      if (input.trackId !== undefined) identifier(input.trackId);
      if (typeof finalize !== 'function') throw failure();
      await reconcileInLane(context, input.trackId);
      assertCurrent(context);
      const result = await finalize(() => assertCurrent(context));
      assertCurrent(context);
      return result;
    });
  }
  // Expose only trusted operations to Main; renderer receives get/search/save/
  // rename through explicit handlers, never the import or recovery callbacks.
  return {
    get,
    search,
    save,
    rename,
    deleteTrack: remove,
    reconcile,
    runImport,
    invalidate: () => {
      generation++;
      service.invalidate();
    },
    inspectBinding: (trackId, context) =>
      inspect(
        trackId,
        {
          ...context,
          generation: context.generation ?? generation,
        },
        { allowEmpty: true },
      ),
    findTrack,
  };
}

module.exports = { createWorkOrganizationRuntime };
