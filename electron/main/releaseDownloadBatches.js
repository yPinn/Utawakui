'use strict';

const { isBoundedTrackId } = require('../lib/library/paths');
const RESERVED = new Set(['constructor', 'prototype', '__proto__']);
const keyOf = (input) =>
  JSON.stringify([input.libraryEpoch, input.collectionId]);
function valid(input) {
  return Boolean(
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(input)) &&
    Object.keys(input).every((key) =>
      [
        'operation',
        'collectionId',
        'libraryEpoch',
        'expectedRevision',
      ].includes(key),
    ) &&
    ['status', 'start', 'stop', 'retry'].includes(input.operation) &&
    isBoundedTrackId(input.collectionId) &&
    !RESERVED.has(input.collectionId) &&
    Number.isSafeInteger(input.libraryEpoch) &&
    input.libraryEpoch >= 0 &&
    Number.isSafeInteger(input.expectedRevision) &&
    input.expectedRevision >= 0,
  );
}
function createReleaseDownloadBatches({
  getScope,
  getPlan,
  prepare,
  validate,
  hasAudio,
  download,
  attach,
  requireProvider,
  isPending = () => false,
  onChanged = () => {},
  recordFailure = () => {},
}) {
  const batches = new Map(),
    admissions = new Map();
  let sequence = 0,
    disposed = false;
  function report(error, operation) {
    try {
      recordFailure(error, operation);
    } catch {
      /* fail open */
    }
  }
  function current(input) {
    if (disposed || getScope()?.epoch !== input.libraryEpoch)
      throw Object.assign(new Error('Batch scope changed'), {
        code: 'RELEASE_SCOPE_STALE',
      });
  }
  function snapshot(input) {
    const batch = batches.get(keyOf(input));
    if (!batch) return null;
    const count = (state) =>
      batch.entries.filter((entry) => entry.state === state).length;
    return {
      batchId: batch.id,
      collectionId: input.collectionId,
      libraryEpoch: input.libraryEpoch,
      active: batch.active,
      phase: batch.active
        ? batch.stopped
          ? 'stopping'
          : 'running'
        : batch.stopped
          ? 'stopped'
          : 'complete',
      total: batch.entries.length,
      completed: batch.entries.filter(
        (entry) => !['pending', 'active'].includes(entry.state),
      ).length,
      succeeded: count('ok'),
      failed: count('failed'),
      unlinked: count('unlinked'),
      skipped: count('skipped'),
      cancelled: count('cancelled'),
      pendingSlots: batch.entries
        .filter((entry) => ['pending', 'active'].includes(entry.state))
        .map((entry) => entry.target.slotKey),
      downloadableCount: batch.entries.filter((entry) =>
        ['pending', 'failed', 'cancelled'].includes(entry.state),
      ).length,
    };
  }
  async function runGroup(batch, entries) {
    let started = false;
    const beforeStart = async () => {
      current(batch.input);
      if (batch.stopped && !started)
        throw Object.assign(new Error('Batch stopped before start'), {
          code: 'IMPORT_DOWNLOAD_CANCELLED',
        });
      requireProvider();
      for (const entry of entries) validate(entry.target);
      started = true;
      for (const entry of entries) entry.state = 'active';
    };
    try {
      current(batch.input);
      requireProvider();
      for (const entry of entries) validate(entry.target);
      if (!(await hasAudio(entries[0].target)))
        await download(entries[0].target, beforeStart);
      else await beforeStart();
    } catch {
      for (const entry of entries)
        entry.state = batch.stopped && !started ? 'cancelled' : 'failed';
      return;
    }
    for (const entry of entries) {
      try {
        current(batch.input);
        requireProvider();
        validate(entry.target);
        const result = await attach(entry.target);
        entry.state = result?.status === 'ok' ? 'ok' : 'unlinked';
      } catch (error) {
        report(error, 'attach');
        entry.state = 'unlinked';
      }
    }
  }
  async function run(batch) {
    const groups = new Map();
    for (const entry of batch.entries) {
      const group = groups.get(entry.target.videoId) ?? [];
      group.push(entry);
      groups.set(entry.target.videoId, group);
    }
    const pending = [...groups.values()];
    async function worker() {
      while (pending.length && !batch.stopped && !disposed) {
        const entries = pending.shift();
        await runGroup(batch, entries);
      }
    }
    try {
      await Promise.all([worker(), worker()]);
    } finally {
      for (const entry of batch.entries)
        if (entry.state === 'pending') entry.state = 'cancelled';
      batch.active = false;
      try {
        onChanged();
      } catch {
        /* committed audio is retained */
      }
    }
  }
  async function admit(input, previous, admission) {
    current(input);
    requireProvider();
    const plan = await getPlan({
      collectionId: input.collectionId,
      libraryEpoch: input.libraryEpoch,
      expectedRevision: input.expectedRevision,
    });
    current(input);
    requireProvider();
    if (!Array.isArray(plan?.slotKeys) || plan.slotKeys.length > 5000)
      throw new Error('Invalid download plan');
    const targets =
      input.operation === 'retry' && previous
        ? previous.entries
            .filter((entry) => ['failed', 'unlinked'].includes(entry.state))
            .map((entry) => entry.target)
        : plan.slotKeys.map((slotKey) =>
            prepare({
              collectionId: input.collectionId,
              libraryEpoch: input.libraryEpoch,
              expectedRevision: input.expectedRevision,
              slotKey,
            }),
          );
    const entries = targets.map((target) => ({
      target,
      state: isPending(target.videoId) ? 'skipped' : 'pending',
    }));
    const batch = {
      id: ++sequence,
      input: { ...input },
      entries,
      active: true,
      stopped: admission.stopped,
    };
    // Bound retained plans, without evicting an active owner.
    if (!batches.has(keyOf(input)) && batches.size >= 16) {
      const idle = [...batches].find(([, value]) => !value.active);
      if (!idle) return { status: 'busy' };
      batches.delete(idle[0]);
    }
    batches.set(keyOf(input), batch);
    // Skip jobs already owned by other imports, without cancelling their work.
    const skipped = entries.filter((entry) => entry.state === 'skipped');
    batch.entries = entries.filter((entry) => entry.state !== 'skipped');
    const operation = run(batch);
    batch.entries.push(...skipped);
    void operation;
    return { status: 'ok', snapshot: snapshot(input) };
  }
  async function execute(input) {
    if (!valid(input)) return { status: 'invalid-intent' };
    try {
      current(input);
      const key = keyOf(input),
        batch = batches.get(key);
      if (input.operation === 'stop') {
        if (admissions.has(key)) admissions.get(key).stopped = true;
        if (batch?.active) batch.stopped = true;
        return { status: 'ok', snapshot: snapshot(input) };
      }
      if (input.operation === 'status') {
        if (batch?.active) return { status: 'ok', snapshot: snapshot(input) };
        let plan;
        try {
          plan = await getPlan({
            collectionId: input.collectionId,
            libraryEpoch: input.libraryEpoch,
            expectedRevision: input.expectedRevision,
          });
        } catch (error) {
          // Our own successful attachments can advance the collection before
          // Renderer receives its new revision. Deliver completion first.
          if (
            batch &&
            ['RELEASE_INFO_CONFLICT', 'RELEASE_CONFLICT'].includes(error?.code)
          )
            return { status: 'ok', snapshot: snapshot(input) };
          throw error;
        }
        current(input);
        return {
          status: 'ok',
          snapshot: {
            ...(snapshot(input) ?? {
              batchId: 0,
              collectionId: input.collectionId,
              libraryEpoch: input.libraryEpoch,
              active: false,
              phase: 'idle',
              total: 0,
              completed: 0,
              succeeded: 0,
              failed: 0,
              unlinked: 0,
              skipped: 0,
              cancelled: 0,
              pendingSlots: [],
            }),
            downloadableCount: plan.slotKeys.length,
          },
        };
      }
      if (batch?.active) return { status: 'ok', snapshot: snapshot(input) };
      if (input.operation === 'retry' && !batch)
        return { status: 'unavailable' };
      if (admissions.has(key)) return admissions.get(key).promise;
      // Gate denial is expected, not an operational diagnostic.
      try {
        requireProvider();
      } catch {
        return { status: 'disabled' };
      }
      const admission = { stopped: false };
      const operation = admit(input, batch, admission).finally(() =>
        admissions.delete(key),
      );
      admission.promise = operation;
      admissions.set(key, admission);
      return await operation;
    } catch (error) {
      if (['RELEASE_SCOPE_STALE', 'WORKS_SCOPE_STALE'].includes(error?.code))
        return { status: 'stale' };
      if (['RELEASE_INFO_CONFLICT', 'RELEASE_CONFLICT'].includes(error?.code))
        return { status: 'conflict' };
      report(error, 'plan');
      return { status: 'unavailable' };
    }
  }
  return {
    execute,
    snapshot,
    dispose() {
      disposed = true;
      for (const batch of batches.values()) batch.stopped = true;
    },
  };
}

function registerReleaseDownloadBatchHandlers({
  ipcMain,
  getMainWindow,
  ...options
}) {
  const service = createReleaseDownloadBatches(options);
  ipcMain.handle('library:release-download-batch', (event, input) => {
    const window = getMainWindow();
    if (
      !window ||
      window.isDestroyed() ||
      event?.sender !== window.webContents ||
      event?.senderFrame !== window.webContents.mainFrame
    )
      return { status: 'invalid-intent' };
    return service.execute(input);
  });
  return service;
}
module.exports = {
  createReleaseDownloadBatches,
  registerReleaseDownloadBatchHandlers,
};
