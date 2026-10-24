'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createWorkOrganizationService } = require('../works/service');
const { loadWorks } = require('../works/organization');
const {
  bindingsEqual,
  validateTrackBinding,
} = require('../works/trackBinding');
const {
  loadPlaylists,
  updatePlaylistReleaseInfo,
  createLocalRelease,
  resolvePlaylistId,
} = require('../playlists');
const { findTrackRecord } = require('../library/tracks');
const { isBoundedTrackId } = require('../library/paths');
const { hasControlCharacters } = require('../textGuards');
const { publicCatalogPage, catalogMemberMatches } = require('./catalog');
const {
  resolveReleaseInfo,
  createReleaseInfo,
  updateReleaseInfo,
} = require('./schema');

const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const EMPTY_DIGEST =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
function failure(code = 'RELEASE_INFO_INVALID') {
  return Object.assign(new Error('Release organization operation failed.'), {
    code,
  });
}
function record(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => RESERVED.has(key) || !fields.includes(key))
  )
    throw failure();
}
function trackId(value) {
  if (!isBoundedTrackId(value) || RESERVED.has(value)) throw failure();
  return value;
}
function collectionId(value) {
  if (!isBoundedTrackId(value) || RESERVED.has(value)) throw failure();
}
function page(input) {
  const offset = input.offset ?? 0,
    limit = input.limit ?? 50;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 5000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw failure();
  return { offset, limit };
}
function revision(collection) {
  return collection.releaseInfo?.revision ?? 0;
}
function hasBindings(collection) {
  return (
    Boolean(collection.releaseInfo?.catalog) ||
    (!collection.source &&
      Object.hasOwn(collection.releaseInfo ?? {}, 'localMemberBindings'))
  );
}

// Scalar-only startup projection. Membership IDs remain durable, while an empty
// available list makes unverified bound-local releases fail closed in consumers.
function projectReleaseList(collections) {
  return collections.map((collection) => {
    const projected = { ...collection };
    if (collection.releaseInfo) {
      projected.releaseInfo = { ...collection.releaseInfo };
      delete projected.releaseInfo.localMemberBindings;
      delete projected.releaseInfo.catalog;
    }
    if (collection.kind === 'album') {
      projected.resolvedRelease = {
        ...resolveReleaseInfo(collection),
        revision: revision(collection),
        leadTrackId: collection.releaseInfo?.leadTrackId ?? null,
      };
      projected.requiresMembershipVerification = hasBindings(collection);
      projected.hasSourceCatalog = Boolean(collection.releaseInfo?.catalog);
      projected.availableTrackIds = hasBindings(collection)
        ? []
        : [...collection.trackIds];
    }
    return projected;
  });
}

function createReleaseOrganizationRuntime({
  getDirectory,
  inspectBinding,
  notifyChanged = () => {},
} = {}) {
  if (
    typeof getDirectory !== 'function' ||
    typeof inspectBinding !== 'function'
  )
    throw failure();
  let generation = 0;
  const service = createWorkOrganizationService({
    getLibraryContext: getDirectory,
    resolveTrack: async () => null,
    staleScopeCode: 'RELEASE_SCOPE_STALE',
  });
  function assertCurrent(context) {
    const current = getDirectory();
    if (
      !current ||
      path.resolve(current.dir) !== context.dir ||
      current.epoch !== context.epoch ||
      context.generation !== generation
    )
      throw failure('RELEASE_SCOPE_STALE');
  }
  function available(context) {
    try {
      if (!fs.statSync(context.dir).isDirectory()) throw failure();
      fs.readdirSync(context.dir);
    } catch (cause) {
      throw Object.assign(failure('RELEASE_UNAVAILABLE'), { cause });
    }
  }
  function load(context, id) {
    collectionId(id);
    id = resolvePlaylistId(context.dir, id);
    available(context);
    const collection = loadPlaylists(context.dir).find(
      (entry) => entry.id === id,
    );
    if (!collection || collection.kind !== 'album')
      throw failure('RELEASE_NOT_FOUND');
    return collection;
  }
  function checkScope(input, context) {
    if (input.libraryEpoch !== context.epoch)
      throw failure('RELEASE_SCOPE_STALE');
  }
  function checkRevision(input, collection) {
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    )
      throw failure();
    if (input.expectedRevision !== revision(collection))
      throw failure('RELEASE_INFO_CONFLICT');
  }
  function assertSame(before, context, latest) {
    assertCurrent(context);
    const current = latest ?? load(context, before.id);
    if (current.kind !== 'album') throw failure('RELEASE_NOT_FOUND');
    if (
      revision(current) !== revision(before) ||
      JSON.stringify(current.trackIds) !== JSON.stringify(before.trackIds) ||
      JSON.stringify(current.source ?? null) !==
        JSON.stringify(before.source ?? null)
    )
      throw failure('RELEASE_INFO_CONFLICT');
    return current;
  }
  function assertNoPending(ids, context) {
    const selected = new Set(ids);
    if (
      Object.values(loadWorks(context.dir).pendingTrackDeletions).some(
        (receipt) => selected.has(receipt.trackId),
      )
    )
      throw failure('RELEASE_PENDING_DELETION');
  }
  async function inspect(id, context, { requireUsable = false } = {}) {
    let result;
    try {
      result = await inspectBinding(id, {
        dir: context.dir,
        epoch: context.epoch,
      });
    } catch (cause) {
      assertCurrent(context);
      if (cause.code === 'WORKS_SCOPE_STALE')
        throw Object.assign(failure('RELEASE_SCOPE_STALE'), { cause });
      throw cause;
    }
    assertCurrent(context);
    if (result?.status === 'missing') return result;
    if (result?.status !== 'present') throw failure('RELEASE_UNAVAILABLE');
    const binding = validateTrackBinding(result.binding);
    if (requireUsable && binding.value === EMPTY_DIGEST)
      throw failure('RELEASE_UNAVAILABLE');
    return { status: 'present', binding };
  }
  function present(id, context) {
    available(context);
    return Boolean(findTrackRecord(context.dir, id));
  }
  async function members(collection, context, input, stored = collection) {
    const { offset, limit } = page(input);
    const selected = collection.trackIds.slice(offset, offset + limit);
    const projected = [];
    for (const id of selected) {
      let bindingStatus;
      if (hasBindings(collection)) {
        const resolved = await inspect(id, context);
        const saved =
          collection.releaseInfo.catalog?.bindings[id] ??
          collection.releaseInfo.localMemberBindings?.[id];
        bindingStatus =
          resolved.status === 'missing'
            ? 'missing'
            : !saved
              ? 'unresolved'
              : catalogMemberMatches(collection, id) &&
                  resolved.binding.value !== EMPTY_DIGEST &&
                  bindingsEqual(saved, resolved.binding)
                ? 'current'
                : 'changed';
      } else
        bindingStatus = present(id, context)
          ? collection.source
            ? 'current'
            : 'unverified'
          : 'missing';
      projected.push({ trackId: id, bindingStatus });
    }
    assertSame(stored, context);
    const hasMore = offset + limit < collection.trackIds.length;
    return {
      members: projected,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }
  async function snapshot(collection, context, input = {}) {
    const projection = await members(collection, context, input);
    return publicSnapshot(collection, context, projection);
  }
  function publicSnapshot(collection, context, projection) {
    const info = collection.releaseInfo ?? createReleaseInfo(collection);
    return {
      status: 'ok',
      libraryEpoch: context.epoch,
      release: {
        id: collection.id,
        name: collection.name,
        revision: revision(collection),
        sourceBacked: Boolean(collection.source),
        effective: resolveReleaseInfo(collection),
        overrides: structuredClone(info.overrides),
        sourceValues: Object.fromEntries(
          Object.entries(info.observed).map(([key, fact]) => [
            key,
            structuredClone(fact.value),
          ]),
        ),
        leadTrackId: info.leadTrackId ?? null,
        memberTrackIds: [...collection.trackIds],
        memberCount: collection.trackIds.length,
        ...projection,
        requiresMembershipVerification: hasBindings(collection),
        canInitializeBindings: !collection.source && !hasBindings(collection),
      },
    };
  }
  function notify(context, collection) {
    try {
      notifyChanged({
        libraryEpoch: context.epoch,
        collectionIds: [collection.id],
      });
    } catch {
      /* committed data remains authoritative */
    }
  }
  function get(input) {
    return service.runInLibrary((context) => {
      record(input, ['collectionId', 'offset', 'limit']);
      page(input);
      return snapshot(load(context, input.collectionId), context, input);
    });
  }
  function resolveMembers(input) {
    return service.runInLibrary(async (context) => {
      record(input, [
        'collectionId',
        'expectedRevision',
        'libraryEpoch',
        'offset',
        'limit',
      ]);
      page(input);
      checkScope(input, context);
      const collection = load(context, input.collectionId);
      checkRevision(input, collection);
      const projected = await members(collection, context, input);
      return {
        status: 'ok',
        libraryEpoch: context.epoch,
        collectionId: collection.id,
        revision: revision(collection),
        ...projected,
        playableTrackIds: projected.members
          .filter(
            (member) =>
              member.bindingStatus === 'current' ||
              (!hasBindings(collection) &&
                member.bindingStatus === 'unverified'),
          )
          .map((member) => member.trackId),
      };
    });
  }
  function save(input) {
    return service.runInLibrary(async (context) => {
      record(input, [
        'collectionId',
        'expectedRevision',
        'libraryEpoch',
        'set',
        'remove',
        'leadTrackId',
        'initializeBindings',
        'reconfirmTrackIds',
      ]);
      checkScope(input, context);
      const collection = load(context, input.collectionId);
      checkRevision(input, collection);
      if (
        input.initializeBindings !== undefined &&
        typeof input.initializeBindings !== 'boolean'
      )
        throw failure();
      const reconfirm = input.reconfirmTrackIds ?? [];
      if (
        !Array.isArray(reconfirm) ||
        reconfirm.length > 100 ||
        new Set(reconfirm).size !== reconfirm.length
      )
        throw failure();
      for (const id of reconfirm) {
        trackId(id);
        if (!collection.trackIds.includes(id)) throw failure();
      }
      if (collection.source && (input.initializeBindings || reconfirm.length))
        throw failure('RELEASE_SOURCE_OWNED');
      if (input.initializeBindings && hasBindings(collection))
        throw failure('RELEASE_BINDING_MISMATCH');
      if (
        !collection.source &&
        !hasBindings(collection) &&
        !input.initializeBindings
      )
        throw failure('RELEASE_BINDINGS_REQUIRED');
      let bindings;
      const resolved = new Map();
      const selected = input.initializeBindings
        ? collection.trackIds
        : reconfirm;
      if (input.initializeBindings || reconfirm.length) {
        bindings = { ...(collection.releaseInfo?.localMemberBindings ?? {}) };
        assertNoPending(selected, context);
        for (const id of selected) {
          const inspected = await inspect(id, context, { requireUsable: true });
          bindings[id] =
            inspected.status === 'present' ? inspected.binding : null;
          resolved.set(id, inspected);
        }
      }
      const intent = {
        expectedRevision: input.expectedRevision,
        ...(input.set !== undefined ? { set: input.set } : {}),
        ...(input.remove !== undefined ? { remove: input.remove } : {}),
        ...(Object.hasOwn(input, 'leadTrackId')
          ? { leadTrackId: input.leadTrackId }
          : {}),
      };
      const options = bindings === undefined ? {} : { bindings };
      const preview = updateReleaseInfo(collection, intent, options);
      // All fallible response verification precedes the atomic write. A later
      // unavailable disk cannot turn a successful creation/save into a retry.
      const projection = await members(preview, context, {}, collection);
      for (const [id, previous] of resolved) {
        const currentBinding = await inspect(id, context, {
          requireUsable: true,
        });
        if (
          currentBinding.status !== previous.status ||
          (currentBinding.status === 'present' &&
            !bindingsEqual(currentBinding.binding, previous.binding))
        )
          throw failure('RELEASE_BINDING_MISMATCH');
      }
      if (resolved.size) assertNoPending(selected, context);
      const current = assertSame(collection, context);
      const updated = updatePlaylistReleaseInfo(
        context.dir,
        collection.id,
        intent,
        options,
      ).find((entry) => entry.id === collection.id);
      if (revision(updated) !== revision(current)) notify(context, updated);
      return publicSnapshot(updated, context, projection);
    });
  }
  function create(input) {
    return service.runInLibrary(async (context) => {
      record(input, ['trackId', 'name', 'libraryEpoch']);
      trackId(input.trackId);
      checkScope(input, context);
      available(context);
      if (
        typeof input.name !== 'string' ||
        !input.name.trim() ||
        input.name.length > 200 ||
        hasControlCharacters(input.name)
      )
        throw failure();
      if (loadPlaylists(context.dir).length >= 500)
        throw failure('RELEASE_LIMIT_REACHED');
      assertNoPending([input.trackId], context);
      const first = await inspect(input.trackId, context, {
        requireUsable: true,
      });
      if (first.status !== 'present') throw failure('RELEASE_NOT_FOUND');
      const last = await inspect(input.trackId, context, {
        requireUsable: true,
      });
      if (
        last.status !== 'present' ||
        !bindingsEqual(first.binding, last.binding)
      )
        throw failure('RELEASE_BINDING_MISMATCH');
      assertCurrent(context);
      assertNoPending([input.trackId], context);
      const created = createLocalRelease(context.dir, {
        name: input.name,
        trackId: input.trackId,
        binding: first.binding,
      });
      const collection = created.playlists.find(
        (entry) => entry.id === created.playlistId,
      );
      notify(context, collection);
      return publicSnapshot(collection, context, {
        members: [{ trackId: input.trackId, bindingStatus: 'current' }],
        hasMore: false,
        nextOffset: null,
      });
    });
  }
  function forTrack(input) {
    return service.runInLibrary(async (context) => {
      record(input, ['trackId', 'offset', 'limit']);
      trackId(input.trackId);
      available(context);
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 500
      )
        throw failure();
      const candidates = loadPlaylists(context.dir).filter(
        (collection) =>
          collection.kind === 'album' &&
          collection.trackIds.includes(input.trackId),
      );
      // The one canonical binding is shared across every candidate collection;
      // this query never reads unrelated tracks or chooses a preferred release.
      let binding;
      if (candidates.some(hasBindings)) {
        const inspected = await inspect(input.trackId, context);
        if (inspected.status === 'missing')
          return {
            status: 'ok',
            libraryEpoch: context.epoch,
            releases: [],
            hasMore: false,
            nextOffset: null,
          };
        binding = inspected.binding;
      } else if (!present(input.trackId, context))
        return {
          status: 'ok',
          libraryEpoch: context.epoch,
          releases: [],
          hasMore: false,
          nextOffset: null,
        };
      const releases = [];
      const currentById = new Map(
        loadPlaylists(context.dir).map((collection) => [
          collection.id,
          collection,
        ]),
      );
      for (const collection of candidates) {
        const current = currentById.get(collection.id);
        if (!current) throw failure('RELEASE_NOT_FOUND');
        assertSame(collection, context, current);
        if (
          hasBindings(collection) &&
          (!catalogMemberMatches(collection, input.trackId) ||
            binding?.value === EMPTY_DIGEST ||
            !bindingsEqual(
              collection.releaseInfo.catalog?.bindings[input.trackId] ??
                collection.releaseInfo.localMemberBindings?.[input.trackId],
              binding,
            ))
        )
          continue;
        const effective = resolveReleaseInfo(collection);
        releases.push({
          id: collection.id,
          name: collection.name,
          type: effective.type,
          date: effective.date,
          revision: revision(collection),
        });
      }
      const hasMore = offset + limit < releases.length;
      return {
        status: 'ok',
        libraryEpoch: context.epoch,
        releases: releases.slice(offset, offset + limit),
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      };
    });
  }
  function withPlayableCollection(input, work) {
    return service.runInLibrary(async (context) => {
      record(input, ['collectionId', 'libraryEpoch']);
      if (input.libraryEpoch !== undefined) checkScope(input, context);
      if (typeof work !== 'function') throw failure();
      const collection = load(context, input.collectionId);
      const playableTrackIds = [];
      for (let offset = 0; offset < collection.trackIds.length; offset += 100) {
        const projected = await members(collection, context, {
          offset,
          limit: 100,
        });
        for (const member of projected.members) {
          if (
            member.bindingStatus === 'current' ||
            (!hasBindings(collection) && member.bindingStatus === 'unverified')
          )
            playableTrackIds.push(member.trackId);
        }
      }
      const current = assertSame(collection, context);
      // Main-only callback: consumers synchronously commit their own store here,
      // while release verification and media deletion still share this lane.
      return work({
        collection: { ...current, trackIds: playableTrackIds },
        context: { dir: context.dir, epoch: context.epoch },
      });
    });
  }
  function catalogPage(input) {
    return service.runInLibrary(async (context) => {
      record(input, [
        'collectionId',
        'expectedRevision',
        'libraryEpoch',
        'offset',
        'limit',
        'availabilityOnly',
      ]);
      if (
        input.availabilityOnly !== undefined &&
        typeof input.availabilityOnly !== 'boolean'
      )
        throw failure();
      page(input);
      checkScope(input, context);
      const collection = load(context, input.collectionId);
      checkRevision(input, collection);
      const states = new Map();
      for (let offset = 0; offset < collection.trackIds.length; offset += 100) {
        const projected = await members(collection, context, {
          offset,
          limit: 100,
        });
        projected.members.forEach((member) =>
          states.set(member.trackId, member.bindingStatus),
        );
      }
      const localCandidates = new Set();
      for (const slot of collection.releaseInfo?.catalog?.manifest.slots ??
        []) {
        if (
          slot.videoId &&
          !collection.releaseInfo.catalog.links[`slot-${slot.position}`] &&
          present(slot.videoId, context)
        )
          localCandidates.add(slot.videoId);
      }
      return {
        status: 'ok',
        collectionId: collection.id,
        revision: revision(collection),
        libraryEpoch: context.epoch,
        catalog: publicCatalogPage(collection, states, input, localCandidates),
      };
    });
  }
  function catalogDownload(input) {
    return service.runInLibrary((context) => {
      record(input, [
        'collectionId',
        'expectedRevision',
        'libraryEpoch',
        'slotKey',
      ]);
      checkScope(input, context);
      const collection = load(context, input.collectionId);
      checkRevision(input, collection);
      if (
        typeof input.slotKey !== 'string' ||
        !/^slot-[1-9][0-9]{0,3}$/.test(input.slotKey)
      )
        throw failure();
      const slot =
        collection.releaseInfo?.catalog?.manifest.slots[
          Number(input.slotKey.slice(5)) - 1
        ];
      if (!slot?.available || !slot.videoId)
        throw failure('RELEASE_UNAVAILABLE');
      return {
        status: 'ok',
        input: `https://music.youtube.com/watch?v=${slot.videoId}`,
        libraryEpoch: context.epoch,
      };
    });
  }
  return {
    get,
    save,
    create,
    forTrack,
    resolveMembers,
    withPlayableCollection,
    catalogPage,
    catalogDownload,
    projectList: projectReleaseList,
    invalidate() {
      generation++;
      service.invalidate();
    },
  };
}

module.exports = { createReleaseOrganizationRuntime, projectReleaseList };
