'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  validPerformanceSettings,
  validPerformanceSlot,
} = require('../../../shared/performanceSettings.mjs');
const { createWorkOrganizationService } = require('../works/service');
const { bindingsEqual } = require('../works/trackBinding');
const { isBoundedTrackId } = require('../library/paths');
const { hasSeparation } = require('../library/separationManifest');
const { assertNoTransaction } = require('../reconciliation/transaction');
const { tagContentAliases } = require('../tags/aliases');
const { readSettings, writeSettings, failure, record } = require('./store');
const { originalMedia, createMediaVerifier } = require('./media');

const TOKEN_TTL_MS = 15 * 60_000;
function createPerformanceSettingsRuntime({
  getDirectory,
  hashAudio,
  hasGuide = hasSeparation,
  aliases = tagContentAliases,
  now = Date.now,
  timeoutMs = 10_000,
} = {}) {
  const lane = createWorkOrganizationService({
    getLibraryContext: getDirectory,
    resolveTrack: async () => null,
  });
  const media = createMediaVerifier(hashAudio);
  const tokens = new Map();
  let generation = 0;
  function capture() {
    const scope = getDirectory();
    return { dir: path.resolve(scope.dir), epoch: scope.epoch, generation };
  }
  function assertScope(scope) {
    const current = capture();
    if (
      current.dir !== scope.dir ||
      current.epoch !== scope.epoch ||
      current.generation !== scope.generation
    )
      throw failure('PERFORMANCE_STALE');
  }
  function validate(input, fields) {
    record(input, fields);
    if (
      !isBoundedTrackId(input.trackId) ||
      ['__proto__', 'constructor', 'prototype'].includes(input.trackId)
    )
      throw failure();
  }
  function tokenFor(input, scope, allowExpired = false) {
    const token = tokens.get(input.token);
    if (
      !token ||
      token.trackId !== input.trackId ||
      (!allowExpired && now() - token.created > TOKEN_TTL_MS)
    )
      throw failure('PERFORMANCE_STALE');
    assertScope(token.scope);
    if (scope.epoch !== token.scope.epoch) throw failure('PERFORMANCE_STALE');
    return token;
  }
  function project(scope, trackId, verified, saved, extra = {}) {
    const revision = saved.document?.revision ?? null;
    const token = randomUUID();
    if (tokens.size >= 128) tokens.delete(tokens.keys().next().value);
    tokens.set(token, {
      scope,
      trackId,
      verified,
      raw: saved.raw,
      revision,
      created: now(),
    });
    return {
      status: saved.document
        ? saved.document.slots.some(Boolean)
          ? 'saved'
          : 'removed'
        : 'absent',
      trackId,
      libraryEpoch: scope.epoch,
      token,
      revision,
      slots: saved.document?.slots ?? [null, null, null],
      defaultSlot: saved.document?.defaultSlot ?? 1,
      values: saved.document?.slots[saved.document.defaultSlot - 1] ?? null,
      guideAvailable: hasGuide(scope.dir, trackId),
      ...extra,
    };
  }
  function runOperation(run) {
    let active = true,
      timer;
    const scope = capture();
    const check = () => {
      if (!active) throw failure('PERFORMANCE_TIMEOUT');
      assertScope(scope);
    };
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        active = false;
        reject(failure('PERFORMANCE_TIMEOUT'));
      }, timeoutMs);
    });
    return Promise.race([
      Promise.resolve().then(() => run(scope, check)),
      timeout,
    ]).finally(() => {
      active = false;
      clearTimeout(timer);
    });
  }
  function get(input) {
    return runOperation(async (scope, check) => {
      validate(input, ['trackId']);
      const verified = await media.verify(scope, input.trackId, check);
      check();
      const before = readSettings(verified.directory);
      let equivalent = false;
      if (
        before.document &&
        !bindingsEqual(before.document.binding, verified.binding)
      ) {
        equivalent = (
          await aliases(scope.dir, input.trackId, verified.binding.value)
        ).includes(before.document.binding.value);
        check();
      }
      return lane.runInLibrary(() => {
        check();
        assertNoTransaction(scope.dir);
        if (originalMedia(scope.dir, input.trackId).stamp !== verified.stamp)
          throw failure('PERFORMANCE_SOURCE_STALE');
        let saved = readSettings(verified.directory);
        if (saved.raw !== before.raw) throw failure('PERFORMANCE_CONFLICT');
        if (
          saved.document &&
          !bindingsEqual(saved.document.binding, verified.binding)
        ) {
          if (!equivalent)
            return {
              status: 'source-stale',
              trackId: input.trackId,
              libraryEpoch: scope.epoch,
              values: saved.document.slots[saved.document.defaultSlot - 1],
            };
          saved = writeSettings(
            verified.directory,
            verified.binding,
            saved.document.slots,
            saved.document.defaultSlot,
          );
        }
        return project(scope, input.trackId, verified, saved);
      });
    });
  }
  function mutate(input, operation) {
    return runOperation(async (scope, check) => {
      validate(input, [
        'trackId',
        'token',
        'expectedRevision',
        'slot',
        ...(operation === 'save' ? ['values'] : []),
      ]);
      if (
        !validPerformanceSlot(input.slot) ||
        (operation === 'save' && !validPerformanceSettings(input.values))
      )
        throw failure();
      // Expiry permits revalidation, never a fresh baseline or a scope bypass.
      const token = tokenFor(input, scope, true);
      const requested = operation === 'save' ? { ...input.values } : null;
      const selectedSlot = input.slot;
      const verified = await media.verify(scope, input.trackId, check);
      check();
      return lane.runInLibrary(() => {
        check();
        tokenFor(input, scope, true);
        assertNoTransaction(scope.dir);
        if (
          originalMedia(scope.dir, input.trackId).stamp !== verified.stamp ||
          token.verified.trackIdentity !== verified.trackIdentity ||
          !bindingsEqual(token.verified.binding, verified.binding)
        )
          throw failure('PERFORMANCE_SOURCE_STALE');
        const before = readSettings(verified.directory);
        if (
          before.raw !== token.raw ||
          input.expectedRevision !== token.revision
        )
          throw failure('PERFORMANCE_CONFLICT');
        const available = hasGuide(scope.dir, input.trackId);
        const slots = (before.document?.slots ?? [null, null, null]).map(
          (value) => value && { ...value },
        );
        const previous = slots[selectedSlot - 1];
        let defaultSlot = before.document?.defaultSlot ?? selectedSlot;
        if (operation === 'set-default' && !previous) throw failure();
        const values = requested && {
          ...requested,
          monitorGuideVocalEnabled: available
            ? requested.monitorGuideVocalEnabled
            : (previous?.monitorGuideVocalEnabled ?? true),
        };
        if (operation !== 'set-default') slots[selectedSlot - 1] = values;
        else defaultSlot = selectedSlot;
        if (!slots[defaultSlot - 1])
          defaultSlot = Math.max(1, slots.findIndex(Boolean) + 1);
        // Only unchanged source identity and exact sidecar CAS may renew idle
        // authority. Cancellation/eviction and scope changes remain terminal.
        if (now() - token.created > TOKEN_TTL_MS) token.created = now();
        tokenFor(input, scope);
        const saved = writeSettings(
          verified.directory,
          verified.binding,
          slots,
          defaultSlot,
        );
        return project(scope, input.trackId, verified, saved, {
          guideSelection: available
            ? 'updated'
            : previous
              ? 'retained'
              : 'default',
        });
      });
    });
  }
  function invalidateTrack(trackId) {
    for (const [key, token] of tokens)
      if (token.trackId === trackId) tokens.delete(key);
    media.clear();
  }
  return {
    get,
    verifySource(input) {
      return runOperation(async (scope, check) => {
        validate(input, ['trackId', 'token']);
        const token = tokenFor(input, scope, true);
        const verified = await media.verify(scope, input.trackId, check);
        check();
        tokenFor(input, scope, true);
        if (
          originalMedia(scope.dir, input.trackId).stamp !== verified.stamp ||
          token.verified.trackIdentity !== verified.trackIdentity
        )
          throw failure('PERFORMANCE_SOURCE_STALE');
        if (!bindingsEqual(token.verified.binding, verified.binding)) {
          const equivalents = await aliases(
            scope.dir,
            input.trackId,
            verified.binding.value,
          );
          check();
          tokenFor(input, scope, true);
          if (
            !equivalents.includes(token.verified.binding.value) ||
            originalMedia(scope.dir, input.trackId).stamp !== verified.stamp
          )
            throw failure('PERFORMANCE_SOURCE_STALE');
        }
        return { status: 'equivalent' };
      });
    },
    save: (input) => mutate(input, 'save'),
    remove: (input) => mutate(input, 'remove'),
    setDefault: (input) => mutate(input, 'set-default'),
    cancel(input) {
      record(input, ['token']);
      tokens.delete(input.token);
      return { status: 'cancelled' };
    },
    invalidateTrack,
    invalidate() {
      generation++;
      tokens.clear();
      media.clear();
    },
  };
}
module.exports = { createPerformanceSettingsRuntime };
