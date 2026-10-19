'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual: same } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { atomicWriteText } = require('../atomicWrite');
const {
  sha,
  contained,
  treeFiles,
  fingerprintTree,
  verifyFileTable,
} = require('./integrity');
const ID = 'lyrics-acoustic';
function failure(code) {
  return Object.assign(new Error(code), { code });
}
async function renameManaged(from, to, signal) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 20)
        throw error;
      await delay(100, undefined, { signal });
    }
  }
}
function createLyricsAcousticCapability({
  host,
  catalog,
  prepare,
  probe,
  scheduler,
  timeoutMs = 900000,
  isOtherSetupBusy = () => false,
  onCleanupError = () => {},
}) {
  if (
    !host ||
    catalog?.schemaVersion !== 1 ||
    catalog.capabilityId !== ID ||
    catalog.environment?.id !== 'lyrics-alignment' ||
    !['accepted', 'blocked'].includes(catalog.productUse)
  )
    throw new Error('invalid lyrics environment catalog');
  const allowed = catalog.productUse === 'accepted';
  const ref = {
    runtime: {
      familyId: catalog.runtime.familyId,
      artifactHash: catalog.runtime.artifactHash,
    },
    environment: {
      id: catalog.environment.id,
      lockHash: sha(JSON.stringify(catalog.environment)),
    },
    worker: { protocolVersion: 1 },
    model: {
      kind: 'alignment',
      id: catalog.model.id,
      version: catalog.model.version,
      manifestHash: sha(JSON.stringify(catalog.model)),
    },
  };
  const runtime = host.getRuntimeArtifactPaths(
    ref.runtime.familyId,
    ref.runtime.artifactHash,
  );
  const environment = host.getEnvironmentPaths(
    ref.environment.id,
    ref.environment.lockHash,
  );
  const model = host.getModelPaths(
    ref.model.kind,
    ref.model.id,
    ref.model.version,
  );
  const installed = {
    runtime: runtime.installDir,
    environment: environment.sitePackagesPath,
    model: model.installDir,
  };
  const stagingRoot = contained(
    host.paths.root,
    path.join(host.paths.root, 'staging', ID),
  );
  const removalPath = contained(
    host.paths.root,
    path.join(host.paths.root, 'lifecycle', 'lyrics-acoustic-removal.json'),
  );
  function ownedPaths(value) {
    const exactKeys = (object, keys) =>
      object &&
      typeof object === 'object' &&
      same(Object.keys(object).sort(), [...keys].sort());
    if (
      !exactKeys(value, ['runtime', 'environment', 'worker', 'model']) ||
      !exactKeys(value.runtime, ['familyId', 'artifactHash']) ||
      !exactKeys(value.environment, ['id', 'lockHash']) ||
      !exactKeys(value.worker, ['protocolVersion']) ||
      value.worker.protocolVersion !== 1 ||
      !exactKeys(value.model, ['kind', 'id', 'version', 'manifestHash']) ||
      !/^[a-f0-9]{64}$/.test(value.model.manifestHash)
    )
      throw failure('LYRICS_ENV_INVALID_REFERENCE');
    if (
      value?.environment?.id !== 'lyrics-alignment' ||
      value?.model?.kind !== 'alignment' ||
      value.model.id !== catalog.model.id ||
      value?.runtime?.familyId !== catalog.runtime.familyId
    )
      throw failure('LYRICS_ENV_INVALID_REFERENCE');
    return {
      environment: host.getEnvironmentPaths(
        value.environment.id,
        value.environment.lockHash,
      ).installDir,
      model: host.getModelPaths(
        value.model.kind,
        value.model.id,
        value.model.version,
      ).installDir,
      runtime: host.getRuntimeArtifactPaths(
        value.runtime.familyId,
        value.runtime.artifactHash,
      ).installDir,
    };
  }
  function pendingRemoval() {
    if (!fs.existsSync(removalPath)) return null;
    contained(host.paths.root, removalPath);
    if (fs.statSync(removalPath).size > 8192)
      throw failure('LYRICS_ENV_INVALID_REFERENCE');
    const value = JSON.parse(fs.readFileSync(removalPath, 'utf8'));
    ownedPaths(value);
    return value;
  }
  let operation = null,
    verifiedStamp = null,
    damaged = false;
  function current() {
    try {
      return host.getCurrentActivation();
    } catch (error) {
      if (
        error.code === 'ENOENT' &&
        !fs.existsSync(host.paths.currentActivationPath)
      )
        return null;
      throw error;
    }
  }
  function stamp() {
    const files = [
      ...Object.keys(catalog.runtime.files).map((n) =>
        path.join(installed.runtime, n),
      ),
      ...Object.keys(catalog.model.files).map((n) =>
        path.join(installed.model, n),
      ),
      ...treeFiles(installed.environment),
    ];
    return JSON.stringify(
      files.map((file) => {
        const s = fs.lstatSync(file);
        if (s.isSymbolicLink()) throw Error('lyrics environment link rejected');
        return [file, s.size, s.mtimeMs, s.ctimeMs];
      }),
    );
  }
  function getStatus() {
    let active,
      pending,
      invalid = false;
    try {
      active = current();
      pending = pendingRemoval();
    } catch {
      invalid = true;
    }
    const activeRef = active?.capabilities?.[ID];
    const exists = Boolean(activeRef || pending) || invalid;
    let status = 'missing';
    if (exists) {
      if (invalid || !same(activeRef, ref) || damaged) status = 'damaged';
      else {
        try {
          status =
            verifiedStamp && stamp() === verifiedStamp ? 'ready' : 'unverified';
        } catch {
          status = 'damaged';
        }
      }
    }
    if (!allowed) status = 'blocked';
    if (pending) status = 'remove-pending';
    return {
      status: operation?.kind ?? status,
      installed: exists,
      busy: Boolean(operation),
      canPrepare: allowed && !exists && !operation && !invalid,
      canVerify: allowed && exists && !operation && !invalid && !pending,
      canRepair: allowed && exists && !operation && !invalid && !pending,
      canRemove: exists && !operation && !invalid,
      canCancel: Boolean(operation && operation.kind !== 'removing'),
      blockReason: allowed ? null : 'weights-evidence-pending',
      modelName: 'HubertFA 中／日詞塊',
      installedBytesEstimate: catalog.installedBytesEstimate,
      downloadBytes: catalog.downloadBytes ?? null,
    };
  }
  function checkLeases() {
    if (host.hasActiveGenerationLeases() || isOtherSetupBusy())
      throw failure('LYRICS_ENV_IN_USE');
  }
  function publish(next) {
    const active = current();
    const capabilities = { ...(active?.capabilities ?? {}) };
    if (next) capabilities[ID] = ref;
    else delete capabilities[ID];
    return host.publishActivation({
      schemaVersion: 1,
      generationId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      capabilities,
    });
  }
  async function checkAssets(layout, signal) {
    await verifyFileTable(layout.runtime, catalog.runtime.files, signal);
    await verifyFileTable(layout.model, catalog.model.files, signal);
    if (
      (await fingerprintTree(layout.environment, signal)) !==
      catalog.environment.fingerprint
    )
      throw new Error('lyrics environment fingerprint mismatch');
  }
  function removeOwned(dir) {
    contained(host.paths.root, dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  function run(kind, action, { onProgress } = {}) {
    if (operation) throw failure('LYRICS_ENV_BUSY');
    if (kind !== 'removing' && !allowed) throw failure('LYRICS_ENV_BLOCKED');
    checkLeases();
    if (kind !== 'removing' && pendingRemoval())
      throw failure('LYRICS_ENV_REMOVE_PENDING');
    const controller = new AbortController();
    const state = {
      kind,
      controller,
      jobId: `lyrics-env-${crypto.randomUUID()}`,
    };
    operation = state;
    const deadline = setTimeout(() => {
      controller.abort(
        new DOMException('Environment operation timed out', 'TimeoutError'),
      );
      void state.cancelScheduled?.();
    }, timeoutMs);
    deadline.unref?.();
    const emit = (stage) => {
      try {
        onProgress?.({ stage });
      } catch {
        /* Progress is advisory. */
      }
    };
    const execute = async () => {
      state.started = true;
      controller.signal.throwIfAborted();
      return action(controller.signal, emit);
    };
    let completion;
    try {
      completion = scheduler
        ? scheduler.schedule({
            jobId: state.jobId,
            start: () => ({
              result: execute(),
              cancel: () => {
                if (!controller.signal.aborted)
                  controller.abort(new DOMException('Cancelled', 'AbortError'));
              },
            }),
          })
        : Promise.resolve().then(execute);
    } catch (error) {
      operation = null;
      clearTimeout(deadline);
      throw error;
    }
    state.cancelScheduled = scheduler
      ? () => scheduler.cancel(state.jobId)
      : null;
    state.done = completion
      .catch((error) => {
        if (
          controller.signal.aborted &&
          (!state.started || error.name === 'AbortError')
        )
          throw controller.signal.reason;
        throw error;
      })
      .finally(() => {
        clearTimeout(deadline);
        if (operation === state) operation = null;
      });
    return state.done.then(() => getStatus());
  }
  async function prepareCapability(options) {
    return run(
      'preparing',
      async (signal, emit) => {
        fs.mkdirSync(stagingRoot, { recursive: true });
        const work = contained(
          stagingRoot,
          path.join(stagingRoot, crypto.randomUUID()),
        );
        const staging = {
          runtime: path.join(work, 'runtime'),
          model: path.join(work, 'model'),
          environment: path.join(work, 'environment', 'Lib', 'site-packages'),
        };
        fs.mkdirSync(path.dirname(staging.environment), { recursive: true });
        let preserveWork = false;
        try {
          emit('preparing');
          await prepare({
            staging,
            installed,
            catalog,
            signal,
            onProgress: emit,
          });
          signal.throwIfAborted();
          emit('verifying');
          await checkAssets(staging, signal);
          const loaded = await probe({
            ...staging,
            catalog,
            signal,
            workspace: path.join(work, 'probe'),
          });
          if (loaded?.ready !== true)
            throw Error('lyrics environment loading failed');
          signal.throwIfAborted();
          checkLeases(current());
          let runtimeValid = true;
          try {
            await verifyFileTable(
              installed.runtime,
              catalog.runtime.files,
              signal,
            );
          } catch {
            runtimeValid = false;
          }
          signal.throwIfAborted();
          checkLeases(current());
          if (
            !runtimeValid &&
            Object.entries(current()?.capabilities ?? {}).some(
              ([id, c]) => id !== ID && same(c.runtime, ref.runtime),
            )
          )
            throw failure('LYRICS_ENV_SHARED_RUNTIME');
          fs.writeFileSync(
            path.join(staging.runtime, 'manifest.json'),
            JSON.stringify(catalog.runtime.manifest ?? catalog.runtime),
          );
          fs.writeFileSync(
            path.join(work, 'environment', 'manifest.json'),
            JSON.stringify(catalog.environment),
          );
          fs.writeFileSync(
            path.join(staging.model, 'manifest.json'),
            JSON.stringify(catalog.model),
          );
          const pairs = [
            ...(!runtimeValid ? [[staging.runtime, installed.runtime]] : []),
            [path.join(work, 'environment'), environment.installDir],
            [staging.model, installed.model],
          ];
          const moved = [];
          try {
            for (const [from, to] of pairs) {
              contained(host.paths.root, to);
              fs.mkdirSync(path.dirname(to), { recursive: true });
              const backup = path.join(work, `backup-${moved.length}`),
                row = { to, backup, backed: false, moved: false };
              moved.push(row);
              if (fs.existsSync(to)) {
                await renameManaged(to, backup, signal);
                row.backed = true;
              }
              await renameManaged(from, to, signal);
              row.moved = true;
            }
            signal.throwIfAborted();
            checkLeases();
            publish(true);
          } catch (error) {
            const recoveryErrors = [];
            for (const row of moved.toReversed()) {
              try {
                if (row.moved) removeOwned(row.to);
                if (row.backed) await renameManaged(row.backup, row.to);
              } catch (recoveryError) {
                recoveryErrors.push(recoveryError);
              }
            }
            if (recoveryErrors.length) {
              preserveWork = true;
              throw new AggregateError(
                [error, ...recoveryErrors],
                'lyrics environment recovery requires repair',
                { cause: error },
              );
            }
            throw error;
          }
          verifiedStamp = stamp();
          damaged = false;
          emit('ready');
        } finally {
          if (!preserveWork)
            try {
              removeOwned(work);
            } catch (error) {
              try {
                onCleanupError(error);
              } catch {
                /* Diagnostics cannot replace the operation result. */
              }
            }
        }
      },
      options,
    );
  }
  async function verify(options) {
    return run(
      'verifying',
      async (signal, emit) => {
        if (!same(current()?.capabilities?.[ID], ref))
          throw failure('LYRICS_ENV_MISSING');
        const work = contained(
          stagingRoot,
          path.join(stagingRoot, crypto.randomUUID()),
        );
        fs.mkdirSync(work, { recursive: true });
        verifiedStamp = null;
        try {
          emit('verifying');
          await checkAssets(installed, signal);
          const loaded = await probe({
            ...installed,
            catalog,
            signal,
            workspace: work,
          });
          signal.throwIfAborted();
          if (loaded?.ready !== true)
            throw Error('lyrics environment loading failed');
          verifiedStamp = stamp();
          damaged = false;
          emit('ready');
        } catch (error) {
          damaged = error.name !== 'AbortError';
          throw error;
        } finally {
          try {
            removeOwned(work);
          } catch (error) {
            try {
              onCleanupError(error);
            } catch {
              /* Diagnostics cannot replace the operation result. */
            }
          }
        }
      },
      options,
    );
  }
  async function remove(options) {
    return run(
      'removing',
      async (signal) => {
        const active = current(),
          activeRef = pendingRemoval() ?? active?.capabilities?.[ID];
        signal.throwIfAborted();
        checkLeases(active);
        if (!activeRef) return;
        const owned = ownedPaths(activeRef);
        fs.mkdirSync(path.dirname(removalPath), { recursive: true });
        atomicWriteText(removalPath, JSON.stringify(activeRef));
        const next = publish(false);
        verifiedStamp = null;
        damaged = false;
        {
          removeOwned(owned.environment);
          removeOwned(owned.model);
          if (
            !Object.values(next.capabilities).some((c) =>
              same(c.runtime, activeRef.runtime),
            )
          )
            removeOwned(owned.runtime);
        }
        removeOwned(stagingRoot);
        fs.unlinkSync(removalPath);
      },
      options,
    );
  }
  return {
    getStatus,
    prepare: prepareCapability,
    repair: prepareCapability,
    verify,
    remove,
    paths: { stagingRoot },
    getInstalledPaths: () => ({ ...installed }),
    async cancel() {
      const state = operation;
      if (!state || state.kind === 'removing') return { cancelled: false };
      state.controller.abort(new DOMException('Cancelled', 'AbortError'));
      await state.cancelScheduled?.();
      await state.done.catch(() => {});
      return { cancelled: true };
    },
  };
}
module.exports = { createLyricsAcousticCapability };
