'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { originalMedia } = require('../performanceSettings/media');
const { validateTrackBinding } = require('../works/trackBinding');
const {
  validateMetadata,
  LIMITS,
} = require('../../../shared/waveform/policy.mjs');

function createWaveformSource({ scheduler, start }) {
  const prepared = new Map();
  return {
    async prepare(scope, trackId, check, signal) {
      const original = originalMedia(scope.dir, trackId);
      const inputBytes = Number(fs.statSync(original.file).size);
      if (inputBytes < 1 || inputBytes > LIMITS.inputBytes)
        throw Error('METADATA_BUDGET');
      const key = `${scope.epoch}/${original.file}/${original.stamp}`;
      if (prepared.has(key)) return { ...original, ...prepared.get(key) };
      const jobId = `waveform-prepare-${crypto.randomUUID()}`;
      const cancel = () => {
        void scheduler.cancel(jobId);
      };
      const result = scheduler.schedule({
        jobId,
        start: () => {
          check();
          return start({
            mode: 'prepare',
            inputPath: original.file,
            expectedStamp: original.stamp.split('/').at(-1),
          });
        },
      });
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      const monitor = setInterval(() => {
        try {
          check();
          if (originalMedia(scope.dir, trackId).stamp !== original.stamp)
            throw Error('SOURCE_STALE');
        } catch {
          cancel();
        }
      }, 100);
      try {
        const value = await result;
        check();
        if (originalMedia(scope.dir, trackId).stamp !== original.stamp)
          throw Error('SOURCE_STALE');
        const data = {
          binding: validateTrackBinding(value.binding),
          metadata: validateMetadata(value.metadata),
        };
        if (prepared.size >= 128) prepared.delete(prepared.keys().next().value);
        prepared.set(key, data);
        return { ...original, ...data };
      } catch (error) {
        check();
        if (originalMedia(scope.dir, trackId).stamp !== original.stamp)
          throw Error('SOURCE_STALE', { cause: error });
        throw error;
      } finally {
        clearInterval(monitor);
        signal.removeEventListener('abort', cancel);
      }
    },
    inspect: (scope, trackId) => originalMedia(scope.dir, trackId).stamp,
  };
}
function decoderIdentity(file) {
  if (typeof file !== 'string' || !file) throw Error('DECODER_UNAVAILABLE');
  // The prepared-path owner already authorizes system/managed executables.
  // Resolve its approved alias instead of rejecting WinGet links/hardlinks.
  file = fs.realpathSync(file);
  const stat = fs.lstatSync(file, { bigint: true });
  if (!stat.isFile()) throw Error('DECODER_UNAVAILABLE');
  return {
    file,
    stamp: [
      file,
      stat.dev,
      stat.ino,
      stat.size,
      stat.mtimeNs,
      stat.ctimeNs,
    ].join(':'),
  };
}
module.exports = { createWaveformSource, decoderIdentity };
