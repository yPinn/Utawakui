'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const {
  loadCatalogCollections: loadPlaylists,
  writeReleaseCatalog,
} = require('../playlists');
const { createWorkOrganizationService } = require('../works/service');
const { loadWorks } = require('../works/organization');
const {
  bindingsEqual,
  validateTrackBinding,
} = require('../works/trackBinding');
const { observeReleaseInfo } = require('./schema');
const {
  reconcileCatalog,
  validateManifest,
  slotKey,
  slotIdentity,
} = require('./catalog');
const { isBoundedTrackId } = require('../library/paths');
const { hasControlCharacters } = require('../textGuards');
const { acquireReleaseArtwork, saveReleaseArtwork } = require('./artwork');
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const SOURCE = /^OLAK5uy_[A-Za-z0-9_-]{1,120}$/;
const revision = (collection) => collection?.releaseInfo?.revision ?? 0;
const sourceAlbum = (collection) =>
  collection.kind === 'album' &&
  ['youtube', 'yt-music'].includes(collection.source?.platform) &&
  SOURCE.test(collection.source.id);
function failure(code = 'RELEASE_CATALOG_INVALID') {
  return Object.assign(new Error('Release catalog operation failed.'), {
    code,
  });
}
function intent(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw failure();
}
function id(value) {
  if (
    !isBoundedTrackId(value) ||
    ['__proto__', 'constructor', 'prototype'].includes(value)
  )
    throw failure();
  return value;
}

function createReleaseCatalogService({
  getDirectory,
  requireProvider,
  runWorker,
  inspectBinding,
  listTracks,
  notifyChanged = () => {},
  onProgress = () => {},
  recordFailure = () => {},
  acquireArtwork = acquireReleaseArtwork,
}) {
  const lane = createWorkOrganizationService({
    getLibraryContext: getDirectory,
    resolveTrack: async () => null,
  });
  const candidates = new Map();
  const queuedImports = new Map();
  const downloadTargets = new WeakSet();
  let tail = Promise.resolve(),
    generation = 0,
    active = null;
  function capture() {
    const scope = getDirectory();
    return { dir: path.resolve(scope.dir), epoch: scope.epoch, generation };
  }
  function current(scope) {
    const now = capture();
    if (
      scope.dir !== now.dir ||
      scope.epoch !== now.epoch ||
      scope.generation !== generation
    )
      throw failure('RELEASE_SCOPE_STALE');
  }
  function admit(scope) {
    current(scope);
    try {
      requireProvider();
    } catch (cause) {
      throw Object.assign(failure('RELEASE_PROVIDER_DISABLED'), { cause });
    }
    if (active?.controller.signal.aborted)
      throw failure('RELEASE_CATALOG_CANCELLED');
  }
  function serial(work) {
    const next = tail.then(work, work);
    tail = next.catch(() => {});
    return next;
  }
  function notify(scope, collection) {
    try {
      notifyChanged({
        libraryEpoch: scope.epoch,
        collectionIds: [collection.id],
      });
    } catch {
      /* durable write remains committed */
    }
  }
  function report(error) {
    if (
      [
        'RELEASE_PROVIDER_DISABLED',
        'RELEASE_SCOPE_STALE',
        'RELEASE_CATALOG_CANCELLED',
      ].includes(error.code)
    )
      return;
    try {
      recordFailure(error);
    } catch {
      /* diagnostics must not erase original outcome */
    }
  }
  function sourceMatch(collections, playlistId) {
    const matches = collections.filter(
      (entry) => sourceAlbum(entry) && entry.source.id === playlistId,
    );
    if (matches.length > 1) throw failure('RELEASE_INFO_CONFLICT');
    return matches[0];
  }
  async function bindingFor(trackId, scope) {
    const result = await inspectBinding(trackId, {
      dir: scope.dir,
      epoch: scope.epoch,
    });
    current(scope);
    if (result?.status === 'missing') return null;
    if (result?.status !== 'present') throw failure('RELEASE_UNAVAILABLE');
    const binding = validateTrackBinding(result.binding);
    return /^0*$/.test(binding.value) ||
      binding.value ===
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      ? null
      : binding;
  }
  async function commit(
    scope,
    manifestInput,
    before,
    manual,
    fetchedAt = new Date().toISOString(),
  ) {
    admit(scope);
    const manifest = validateManifest(manifestInput);
    const previous = sourceMatch(before, manifest.playlistId);
    const artwork =
      !previous?.coverImage &&
      !previous?.releaseInfo?.catalog &&
      manifest.artworkUrl
        ? await acquireArtwork(manifest.artworkUrl, {
            signal: active?.controller.signal,
          })
        : null;
    admit(scope);
    const available = new Set(listTracks(scope.dir).map((track) => track.id));
    const selected = [
      ...new Set([
        ...(previous?.trackIds ?? []),
        ...manifest.slots
          .map((slot) => slot.videoId)
          .filter((value) => value && available.has(value)),
        ...(manual ? [manual.trackId] : []),
      ]),
    ];
    const bindings = {};
    // First hash pass is outside the lane. The second inspection at commit is
    // stamp-cached by the canonical media runtime and closes replacement races.
    for (const trackId of selected) {
      admit(scope);
      bindings[trackId] = await bindingFor(trackId, scope);
    }
    return lane.runInLibrary(async () => {
      admit(scope);
      const latest = sourceMatch(loadPlaylists(scope.dir), manifest.playlistId);
      if (
        (previous?.id ?? null) !== (latest?.id ?? null) ||
        revision(previous) !== revision(latest)
      )
        throw failure('RELEASE_INFO_CONFLICT');
      const pending = new Set(
        Object.values(loadWorks(scope.dir).pendingTrackDeletions).map(
          (item) => item.trackId,
        ),
      );
      for (const trackId of selected) {
        if (pending.has(trackId)) throw failure('RELEASE_PENDING_DELETION');
        const fresh = await bindingFor(trackId, scope);
        if (
          (bindings[trackId] === null) !== (fresh === null) ||
          (fresh && !bindingsEqual(bindings[trackId], fresh))
        )
          throw failure('RELEASE_BINDING_MISMATCH');
      }
      admit(scope);
      const base = latest ?? {
        id: crypto.randomUUID(),
        kind: 'album',
        name: manifest.title,
        description: '',
        source: { platform: 'yt-music', id: manifest.playlistId },
        trackIds: [],
        addedAt: {},
      };
      let next = reconcileCatalog(base, manifest, bindings, fetchedAt);
      if (manual) {
        const slot = manifest.slots.find(
          (entry) => entry.position === manual.position,
        );
        if (
          !slot ||
          !bindings[manual.trackId] ||
          !bindingsEqual(bindings[manual.trackId], manual.binding)
        )
          throw failure('RELEASE_BINDING_MISMATCH');
        next = structuredClone(next);
        const catalog = next.releaseInfo.catalog;
        const persistedSlot = catalog.manifest.slots.find(
          (entry) => entry.position === manual.position,
        );
        if (
          !persistedSlot ||
          slotIdentity(persistedSlot) !== slotIdentity(slot)
        )
          throw failure('RELEASE_INFO_CONFLICT');
        catalog.links[slotKey(slot.position)] = {
          trackId: manual.trackId,
          evidence: 'manual',
          slotIdentity: slotIdentity(slot),
        };
        catalog.bindings[manual.trackId] = manual.binding;
        catalog.rejected = catalog.rejected.filter(
          (value) => value !== manual.trackId,
        );
        next.trackIds = [
          ...new Set([
            ...manifest.slots
              .map((entry) => catalog.links[slotKey(entry.position)]?.trackId)
              .filter(Boolean),
            ...next.trackIds,
          ]),
        ];
        next.addedAt[manual.trackId] ??= new Date().toISOString();
      }
      const provenance = {
        provider: base.source.platform,
        sourceId: base.source.id,
      };
      const facts = {};
      if (manifest.type !== 'unknown')
        facts.type = { value: manifest.type, provenance };
      if (
        manifest.year &&
        !['month', 'day'].includes(
          next.releaseInfo.observed.date?.value?.precision,
        )
      )
        facts.date = {
          value: { value: manifest.year, precision: 'year' },
          provenance,
        };
      if (manifest.completeness === 'complete')
        facts.totalTrackCount = { value: manifest.reportedTotal, provenance };
      next = observeReleaseInfo(next, facts);
      // A partial refresh may keep the same snapshot but a manual relationship
      // still counts as a real revision change.
      if (manual && revision(next) === revision(base))
        next.releaseInfo.revision++;
      if (next === base) return base;
      const coverOwner = latest
        ? loadPlaylists(scope.dir).find((entry) => entry.id === latest.id)
        : null;
      if (
        artwork &&
        !base.coverImage &&
        !base.releaseInfo?.catalog &&
        !coverOwner?.coverImage &&
        !coverOwner?.releaseInfo?.catalog
      ) {
        try {
          next.coverImage =
            saveReleaseArtwork(scope.dir, base.id, artwork) || undefined;
        } catch {
          /* source text remains useful without its image */
        }
      }
      if (
        manual &&
        JSON.stringify(next.releaseInfo) !== JSON.stringify(base.releaseInfo) &&
        revision(next) <= revision(base)
      )
        next.releaseInfo.revision = revision(base) + 1;
      writeReleaseCatalog(scope.dir, next, latest ? revision(latest) : null);
      notify(scope, next);
      return next;
    });
  }
  async function runRefresh(request, scope, { automatic = false } = {}) {
    const controller = new AbortController();
    const job = {
      controller,
      scope,
      result: {
        libraryEpoch: scope.epoch,
        status: 'running',
        total: 0,
        completed: 0,
        updated: 0,
        unresolved: 0,
        needsConfirmation: 0,
      },
    };
    active = job;
    const publish = () => {
      try {
        onProgress({ ...job.result });
      } catch {
        /* renderer may be closed */
      }
    };
    try {
      admit(scope);
      const collections = loadPlaylists(scope.dir);
      const tracks = listTracks(scope.dir);
      const fresh = (entry) => {
        const catalog = entry.releaseInfo?.catalog;
        return (
          catalog?.manifest.completeness === 'complete' &&
          Date.now() - Date.parse(catalog.fetchedAt) < 24 * 60 * 60 * 1000
        );
      };
      const albumTarget = (entry) => ({
        action: 'album',
        playlistId: entry.source.id,
        ...((automatic || !request) && fresh(entry)
          ? { savedManifest: entry.releaseInfo.catalog.manifest }
          : {}),
      });
      let targets;
      if (request?.trackId) {
        const trackId = id(request.trackId);
        if (!tracks.some((track) => track.id === trackId))
          throw failure('RELEASE_NOT_FOUND');
        const known = collections.filter((entry) =>
          entry.releaseInfo?.catalog?.manifest.slots.some(
            (slot) => slot.videoId === trackId,
          ),
        );
        targets = known.length
          ? known.map(albumTarget)
          : VIDEO.test(trackId)
            ? [{ action: 'resolve', videoId: trackId }]
            : [];
        if (!targets.length) job.result.needsConfirmation++;
      } else if (request?.collectionId) {
        const collection = collections.find(
          (entry) => entry.id === id(request.collectionId),
        );
        targets =
          collection && sourceAlbum(collection)
            ? [albumTarget(collection)]
            : [];
        if (!targets.length) job.result.needsConfirmation++;
      } else {
        const albums = collections.filter(sourceAlbum);
        const covered = new Set(albums.flatMap((entry) => entry.trackIds));
        targets = [
          ...new Map(
            albums.map((entry) => [entry.source.id, albumTarget(entry)]),
          ).values(),
          ...tracks
            .filter((track) => VIDEO.test(track.id) && !covered.has(track.id))
            .map((track) => ({ action: 'resolve', videoId: track.id })),
        ];
        job.result.needsConfirmation = tracks.filter(
          (track) => !VIDEO.test(track.id) && !covered.has(track.id),
        ).length;
      }
      job.result.total = targets.length;
      publish();
      const completedSources = new Set();
      for (const target of targets) {
        if (controller.signal.aborted) break;
        admit(scope);
        if (target.playlistId && completedSources.has(target.playlistId)) {
          job.result.completed++;
          continue;
        }
        const before = loadPlaylists(scope.dir);
        try {
          const { savedManifest, ...workerIntent } = target;
          const result = savedManifest
            ? { status: 'ok', manifest: savedManifest }
            : await runWorker(workerIntent, { signal: controller.signal });
          admit(scope);
          if (result.status === 'ok' && result.manifest) {
            if (!completedSources.has(result.manifest.playlistId)) {
              const previous = sourceMatch(before, result.manifest.playlistId);
              const saved = await commit(
                scope,
                result.manifest,
                before,
                undefined,
                savedManifest
                  ? previous?.releaseInfo.catalog.fetchedAt
                  : undefined,
              );
              completedSources.add(result.manifest.playlistId);
              if (!previous || revision(saved) !== revision(previous))
                job.result.updated++;
            }
          } else job.result.unresolved++;
        } catch (error) {
          if (controller.signal.aborted) break;
          admit(scope);
          report(error);
          job.result.unresolved++;
        }
        job.result.completed++;
        publish();
      }
      job.result.status = controller.signal.aborted ? 'cancelled' : 'complete';
    } catch (error) {
      job.result.status = controller.signal.aborted
        ? 'cancelled'
        : 'interrupted';
      if (!controller.signal.aborted && error.code !== 'RELEASE_SCOPE_STALE')
        report(error);
    } finally {
      active = null;
      publish();
    }
    return { ...job.result };
  }
  function refresh(request) {
    if (request !== undefined) {
      intent(request, ['trackId', 'collectionId']);
      if (Object.keys(request).length !== 1) throw failure();
    }
    const scope = capture();
    return serial(() => runRefresh(request, scope));
  }
  function candidate(value) {
    intent(value, ['candidateId', 'position', 'offset', 'limit']);
    const entry = candidates.get(value.candidateId);
    if (!entry || Date.now() - entry.createdAt > 15 * 60 * 1000)
      throw failure('RELEASE_CANDIDATE_EXPIRED');
    admit(entry.scope);
    return entry;
  }
  async function search(request) {
    intent(request, ['trackId']);
    const trackId = id(request.trackId),
      scope = capture();
    admit(scope);
    const track = listTracks(scope.dir).find((entry) => entry.id === trackId);
    if (!track) throw failure('RELEASE_NOT_FOUND');
    const query = [track.artist, track.album || track.title]
      .filter(Boolean)
      .join(' ')
      .slice(0, 200);
    if (!query.trim() || hasControlCharacters(query)) throw failure();
    const binding = await bindingFor(trackId, scope);
    if (!binding) throw failure('RELEASE_BINDING_MISMATCH');
    const result = await serial(() => {
      admit(scope);
      return runWorker({ action: 'search', query });
    });
    admit(scope);
    if (result.status !== 'ok' || !Array.isArray(result.candidates))
      return { status: 'unavailable', candidates: [] };
    const values = result.candidates.map((item) => {
      const candidateId = crypto.randomUUID();
      candidates.set(candidateId, {
        ...item,
        scope,
        trackId,
        binding,
        createdAt: Date.now(),
      });
      return {
        candidateId,
        title: item.title,
        artist: item.artist,
        year: item.year,
      };
    });
    while (candidates.size > 20)
      candidates.delete(candidates.keys().next().value);
    return { status: 'ok', libraryEpoch: scope.epoch, candidates: values };
  }
  async function preview(request) {
    intent(request, ['candidateId', 'offset', 'limit']);
    const entry = candidate(request);
    const offset = request.offset ?? 0,
      limit = request.limit ?? 100;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 5000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw failure();
    if (!entry.manifest) {
      const before = loadPlaylists(entry.scope.dir);
      const result = await serial(() => {
        admit(entry.scope);
        return runWorker({ action: 'browse', browseId: entry.browseId });
      });
      admit(entry.scope);
      if (result.status !== 'ok' || !result.manifest)
        throw failure('RELEASE_SOURCE_UNAVAILABLE');
      entry.manifest = validateManifest(result.manifest);
      entry.before = before;
    }
    const rows = entry.manifest.slots
      .slice(offset, offset + limit)
      .map((slot) => ({
        position: slot.position,
        title: slot.title,
        artist: slot.artist,
        duration: slot.duration,
      }));
    return {
      status: 'ok',
      title: entry.manifest.title,
      artist: entry.manifest.artist,
      type: entry.manifest.type,
      year: entry.manifest.year,
      completeness: entry.manifest.completeness,
      rows,
      hasMore: offset + limit < entry.manifest.slots.length,
      nextOffset:
        offset + limit < entry.manifest.slots.length ? offset + limit : null,
    };
  }
  function accept(request) {
    intent(request, ['candidateId', 'position']);
    const entry = candidate(request);
    if (
      !entry.manifest ||
      !Number.isInteger(request.position) ||
      !entry.manifest.slots.some((slot) => slot.position === request.position)
    )
      throw failure();
    return serial(async () => {
      const saved = await commit(entry.scope, entry.manifest, entry.before, {
        trackId: entry.trackId,
        binding: entry.binding,
        position: request.position,
      });
      candidates.delete(request.candidateId);
      return { status: 'ok', collectionId: saved.id };
    });
  }
  function unlink(request) {
    intent(request, [
      'collectionId',
      'expectedRevision',
      'libraryEpoch',
      'slotKey',
    ]);
    const scope = capture();
    current(scope);
    if (
      request.libraryEpoch !== scope.epoch ||
      !Number.isSafeInteger(request.expectedRevision)
    )
      throw failure('RELEASE_SCOPE_STALE');
    return serial(() =>
      lane.runInLibrary(() => {
        current(scope);
        const collection = loadPlaylists(scope.dir).find(
          (entry) => entry.id === id(request.collectionId),
        );
        const link = collection?.releaseInfo?.catalog?.links[request.slotKey];
        if (!link || revision(collection) !== request.expectedRevision)
          throw failure('RELEASE_INFO_CONFLICT');
        const next = structuredClone(collection),
          catalog = next.releaseInfo.catalog;
        delete catalog.links[request.slotKey];
        if (!catalog.rejected.includes(link.trackId))
          catalog.rejected.push(link.trackId);
        if (
          !Object.values(catalog.links).some(
            (entry) => entry.trackId === link.trackId,
          )
        ) {
          next.trackIds = next.trackIds.filter(
            (value) => value !== link.trackId,
          );
          delete next.addedAt[link.trackId];
          delete catalog.bindings[link.trackId];
          if (next.releaseInfo.leadTrackId === link.trackId)
            delete next.releaseInfo.leadTrackId;
        }
        next.releaseInfo.revision++;
        writeReleaseCatalog(scope.dir, next, request.expectedRevision);
        notify(scope, next);
        return { status: 'ok' };
      }),
    );
  }
  function prepareDownload(request, { localOnly = false, batch = false } = {}) {
    intent(request, [
      'collectionId',
      'expectedRevision',
      'libraryEpoch',
      'slotKey',
    ]);
    const scope = capture();
    current(scope);
    if (request.libraryEpoch !== scope.epoch)
      throw failure('RELEASE_SCOPE_STALE');
    const collection = loadPlaylists(scope.dir).find(
      (entry) => entry.id === id(request.collectionId),
    );
    if (!collection || !sourceAlbum(collection))
      throw failure('RELEASE_NOT_FOUND');
    if (
      !Number.isSafeInteger(request.expectedRevision) ||
      revision(collection) !== request.expectedRevision
    )
      throw failure('RELEASE_INFO_CONFLICT');
    if (
      typeof request.slotKey !== 'string' ||
      !/^slot-[1-9][0-9]{0,3}$/.test(request.slotKey)
    )
      throw failure();
    const slot =
      collection.releaseInfo?.catalog?.manifest.slots[
        Number(request.slotKey.slice(5)) - 1
      ];
    if (!slot?.videoId || (!localOnly && !slot.available))
      throw failure('RELEASE_UNAVAILABLE');
    const target = {
      scope,
      collectionId: collection.id,
      sourceId: collection.source.id,
      slotKey: request.slotKey,
      identity: slotIdentity(slot),
      videoId: slot.videoId,
      revision: revision(collection),
      rejected: collection.releaseInfo.catalog.rejected.includes(slot.videoId),
      batch,
    };
    downloadTargets.add(target);
    return target;
  }
  function validateDownload(target) {
    if (!downloadTargets.has(target)) throw failure();
    current(target.scope);
    const collection = loadPlaylists(target.scope.dir).find(
      (entry) => entry.id === target.collectionId,
    );
    const slot =
      collection?.releaseInfo?.catalog?.manifest.slots[
        Number(target.slotKey.slice(5)) - 1
      ];
    if (
      !collection ||
      !sourceAlbum(collection) ||
      collection.source.id !== target.sourceId ||
      !slot ||
      slotIdentity(slot) !== target.identity
    )
      throw failure('RELEASE_INFO_CONFLICT');
    if (target.batch) {
      const catalog = collection.releaseInfo.catalog;
      const link = catalog.links[target.slotKey];
      if (
        !slot.available ||
        catalog.rejected.includes(target.videoId) ||
        (link &&
          (link.trackId !== target.videoId ||
            link.evidence !== 'exact-source' ||
            link.slotIdentity !== target.identity))
      )
        throw failure('RELEASE_INFO_CONFLICT');
    }
    return collection;
  }
  async function attachDownload(target) {
    validateDownload(target);
    const before = await bindingFor(target.videoId, target.scope);
    if (!before) throw failure('RELEASE_UNAVAILABLE');
    return lane.runInLibrary(async () => {
      const collection = validateDownload(target);
      if (
        Object.values(loadWorks(target.scope.dir).pendingTrackDeletions).some(
          (entry) => entry.trackId === target.videoId,
        )
      )
        throw failure('RELEASE_PENDING_DELETION');
      const fresh = await bindingFor(target.videoId, target.scope);
      if (!fresh || !bindingsEqual(before, fresh))
        throw failure('RELEASE_BINDING_MISMATCH');
      validateDownload(target);
      const catalog = collection.releaseInfo.catalog;
      const link = catalog.links[target.slotKey];
      const savedBinding = catalog.bindings[target.videoId];
      if (savedBinding && !bindingsEqual(savedBinding, fresh))
        throw failure('RELEASE_BINDING_MISMATCH');
      if (link) {
        if (
          link.trackId !== target.videoId ||
          link.slotIdentity !== target.identity ||
          !savedBinding
        )
          throw failure('RELEASE_INFO_CONFLICT');
        return {
          status: 'ok',
          collectionId: collection.id,
          libraryEpoch: target.scope.epoch,
        };
      }
      if (
        catalog.rejected.includes(target.videoId) &&
        (!target.rejected || revision(collection) !== target.revision)
      )
        throw failure('RELEASE_INFO_CONFLICT');
      const next = structuredClone(collection);
      next.releaseInfo.catalog.rejected = catalog.rejected.filter(
        (value) => value !== target.videoId,
      );
      // Explicit local inclusion does not depend on current online availability.
      next.releaseInfo.catalog.links[target.slotKey] = {
        trackId: target.videoId,
        evidence: 'exact-source',
        slotIdentity: target.identity,
      };
      next.releaseInfo.catalog.bindings[target.videoId] = fresh;
      next.trackIds = [
        ...new Set([
          ...catalog.manifest.slots
            .map(
              (slot) =>
                next.releaseInfo.catalog.links[slotKey(slot.position)]?.trackId,
            )
            .filter(Boolean),
          ...collection.trackIds,
        ]),
      ];
      next.addedAt[target.videoId] ??= new Date().toISOString();
      next.releaseInfo.revision = revision(collection) + 1;
      writeReleaseCatalog(target.scope.dir, next, revision(collection));
      notify(target.scope, next);
      return {
        status: 'ok',
        collectionId: collection.id,
        libraryEpoch: target.scope.epoch,
      };
    });
  }
  function linkLocal(request) {
    return attachDownload(prepareDownload(request, { localOnly: true }));
  }
  function enqueueRequest(request, suppliedScope) {
    const scope = suppliedScope
      ? { ...suppliedScope, dir: path.resolve(suppliedScope.dir), generation }
      : capture();
    const key = JSON.stringify([
      scope.dir,
      scope.epoch,
      scope.generation,
      request,
    ]);
    if (queuedImports.has(key)) return queuedImports.get(key);
    if (queuedImports.size >= 100)
      return Promise.resolve({ status: 'limit-reached' });
    const result = serial(() => runRefresh(request, scope, { automatic: true }))
      .catch(report)
      .finally(() => queuedImports.delete(key));
    queuedImports.set(key, result);
    return result;
  }
  return {
    refresh,
    search,
    preview,
    accept,
    unlink,
    prepareDownload,
    validateDownload,
    attachDownload,
    async hasDownloadAudio(target) {
      validateDownload(target);
      return Boolean(await bindingFor(target.videoId, target.scope));
    },
    linkLocal,
    collectionsChanged(collectionIds) {
      for (const collection of loadPlaylists(capture().dir).filter(
        (entry) => collectionIds.includes(entry.id) && sourceAlbum(entry),
      )) {
        void enqueueRequest({ collectionId: collection.id });
      }
    },
    enqueue(trackId, scope = capture()) {
      id(trackId);
      return enqueueRequest({ trackId }, scope);
    },
    cancel() {
      active?.controller.abort();
      generation++;
      return { cancelling: true };
    },
  };
}
module.exports = { createReleaseCatalogService };
