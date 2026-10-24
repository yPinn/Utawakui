'use strict';

const path = require('node:path');
const organization = require('./organization');
const { validateTrackBinding, bindingsEqual } = require('./trackBinding');
const { hasControlCharacters } = require('../textGuards');

// All instances share the lane: a second consumer cannot race a deletion or a
// binding read for the same library. Long-running acquisition stays outside it.
const lanes = new Map();

function error(code = 'WORKS_INVALID') {
  return Object.assign(new Error('Work organization operation failed'), {
    code,
  });
}

function command(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw error();
}

function trackIdentifier(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 255 ||
    hasControlCharacters(value) ||
    /[/\\]/.test(value) ||
    value.trim() !== value ||
    ['__proto__', 'constructor', 'prototype'].includes(value)
  )
    throw error();
  return value;
}

// This service is a Main-only boundary. resolveTrack must derive a fresh binding
// from canonical original media and optionally return a primitive file stamp.
// inspectBinding returns present+binding, missing, or unavailable; it must never
// classify permission / offline-volume errors as missing. Cleanup must compare
// the supplied old binding before touching any replacement's references.
function createWorkOrganizationService({
  getLibraryContext,
  resolveTrack,
  deleteMedia,
  cleanupReferences,
  inspectBinding,
  staleScopeCode = 'WORKS_STALE',
} = {}) {
  if (
    typeof getLibraryContext !== 'function' ||
    typeof resolveTrack !== 'function'
  )
    throw error();
  let generation = 0;

  function capture() {
    const context = getLibraryContext();
    if (
      !context ||
      typeof context.dir !== 'string' ||
      !context.dir ||
      !['string', 'number'].includes(typeof context.epoch)
    )
      throw error();
    return { dir: path.resolve(context.dir), epoch: context.epoch, generation };
  }

  function assertCurrent(context) {
    const current = capture();
    if (
      current.dir !== context.dir ||
      current.epoch !== context.epoch ||
      current.generation !== context.generation
    )
      throw error(staleScopeCode);
  }

  function run(operation) {
    let context;
    try {
      context = capture();
    } catch (failure) {
      return Promise.reject(failure);
    }
    const previous = lanes.get(context.dir) ?? Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(() => {
        assertCurrent(context);
        return operation(context);
      });
    lanes.set(context.dir, pending);
    // Both handlers consume failures without creating an unhandled rejection.
    const release = () => {
      if (lanes.get(context.dir) === pending) lanes.delete(context.dir);
    };
    pending.then(release, release);
    return pending;
  }

  async function resolve(trackId, context) {
    trackIdentifier(trackId);
    const result = await resolveTrack(trackId, context);
    assertCurrent(context);
    if (!result) throw error('WORKS_NOT_FOUND');
    return {
      binding: validateTrackBinding(result.binding),
      stamp: result.stamp,
    };
  }

  async function withBindings(context, entries, operation) {
    const resolved = [];
    for (const entry of entries)
      resolved.push(await resolve(entry.trackId, context));
    // Re-read canonical media after all asynchronous hash work and before the
    // synchronous commit. Never reuse a binding across a library epoch.
    for (let i = 0; i < entries.length; i++) {
      const current = await resolve(entries[i].trackId, context);
      if (
        !bindingsEqual(current.binding, resolved[i].binding) ||
        current.stamp !== resolved[i].stamp
      )
        throw error('WORKS_BINDING_MISMATCH');
    }
    assertCurrent(context);
    return operation(
      entries.map((entry, index) => ({
        ...entry,
        binding: resolved[index].binding,
      })),
    );
  }

  function createAndLink(input) {
    return run(async (context) => {
      command(input, [
        'expectedRevision',
        'title',
        'aliases',
        'note',
        'tracks',
      ]);
      if (
        !Array.isArray(input.tracks) ||
        input.tracks.length < 1 ||
        input.tracks.length > 2
      )
        throw error();
      for (const entry of input.tracks)
        command(entry, ['trackId', 'relationship', 'versionInfo']);
      return withBindings(context, input.tracks, (entries) =>
        organization.createAndLinkWork(context.dir, {
          ...input,
          tracks: entries,
        }),
      );
    });
  }

  function saveProfile(input) {
    return run(async (context) => {
      command(input, [
        'expectedRevision',
        'trackId',
        'versionInfo',
        'workLink',
      ]);
      return withBindings(context, [input], ([entry]) =>
        organization.saveTrackProfile(context.dir, entry),
      );
    });
  }

  function unlink(input) {
    return run(async (context) => {
      command(input, ['expectedRevision', 'trackId']);
      return withBindings(context, [input], ([entry]) =>
        organization.unlinkTrack(context.dir, entry),
      );
    });
  }

  function rename(input) {
    return run((context) => {
      command(input, [
        'expectedRevision',
        'workId',
        'title',
        'aliases',
        'note',
      ]);
      return organization.renameWork(context.dir, input);
    });
  }

  function getProfile(trackId) {
    return run(async (context) => {
      trackIdentifier(trackId);
      const result = await resolveTrack(trackId, context);
      assertCurrent(context);
      return organization.getBoundTrackProfile(
        organization.loadWorks(context.dir),
        trackId,
        result?.binding,
      );
    });
  }

  async function cleanup(context, operationId) {
    assertCurrent(context);
    let document = organization.loadWorks(context.dir);
    const receipt = document.pendingTrackDeletions[operationId];
    if (!receipt) return document;
    if (typeof cleanupReferences !== 'function') throw error();
    await cleanupReferences(receipt.trackId, receipt.binding, context);
    assertCurrent(context);
    document = organization.loadWorks(context.dir);
    return organization.finishTrackDeletion(context.dir, {
      expectedRevision: document.revision,
      operationId,
    });
  }

  function deleteTrack(input) {
    return run(async (context) => {
      command(input, ['expectedRevision', 'trackId']);
      if (
        typeof deleteMedia !== 'function' ||
        typeof cleanupReferences !== 'function'
      )
        throw error();
      const document = await withBindings(context, [input], ([entry]) =>
        organization.prepareTrackDeletion(context.dir, entry),
      );
      const [operationId, receipt] = Object.entries(
        document.pendingTrackDeletions,
      ).find(([, entry]) => entry.trackId === input.trackId);
      assertCurrent(context);
      await deleteMedia(input.trackId, receipt.binding, context);
      assertCurrent(context);
      const current = organization.loadWorks(context.dir);
      organization.markTrackMediaDeleted(context.dir, {
        expectedRevision: current.revision,
        operationId,
      });
      return cleanup(context, operationId);
    });
  }

  function reconcile(input = {}) {
    return run(async (context) => {
      command(input, ['trackId']);
      if (input.trackId !== undefined) trackIdentifier(input.trackId);
      if (
        typeof inspectBinding !== 'function' ||
        typeof cleanupReferences !== 'function'
      )
        throw error();
      const snapshot = organization.loadWorks(context.dir);
      for (const [operationId, receipt] of Object.entries(
        snapshot.pendingTrackDeletions,
      )) {
        if (input.trackId !== undefined && receipt.trackId !== input.trackId)
          continue;
        const inspected = await inspectBinding(receipt.trackId, context);
        assertCurrent(context);
        command(inspected, ['status', 'binding']);
        if (!['present', 'missing', 'unavailable'].includes(inspected.status))
          throw error();
        if (inspected.status === 'unavailable') continue;
        if (inspected.status === 'present')
          validateTrackBinding(inspected.binding);
        const current = organization.loadWorks(context.dir);
        if (
          receipt.phase === 'prepared' &&
          inspected.status === 'present' &&
          bindingsEqual(receipt.binding, inspected.binding)
        ) {
          organization.finishTrackDeletion(context.dir, {
            expectedRevision: current.revision,
            operationId,
            cancel: true,
          });
          continue;
        }
        if (receipt.phase === 'prepared')
          organization.markTrackMediaDeleted(context.dir, {
            expectedRevision: current.revision,
            operationId,
          });
        await cleanup(context, operationId);
      }
      return organization.loadWorks(context.dir);
    });
  }

  return {
    // Main-only coordinator hook: shares the exact service lane with imports.
    runInLibrary: run,
    createAndLink,
    saveProfile,
    unlink,
    rename,
    getProfile,
    deleteTrack,
    reconcile,
    invalidate() {
      generation++;
    },
  };
}

module.exports = { createWorkOrganizationService };
