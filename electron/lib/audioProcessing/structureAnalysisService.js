'use strict';

const {
  STRUCTURE_CAPABILITY_ID,
  createStructureAnalysisJob,
} = require('./structureAnalysisJob');

function createStructureAnalysisService({
  host,
  scheduler,
  createJobId,
  prepareSource,
  publishDocument,
  createJob = createStructureAnalysisJob,
}) {
  if (
    !host ||
    typeof host.acquireCurrentGeneration !== 'function' ||
    !scheduler ||
    typeof scheduler.schedule !== 'function' ||
    typeof scheduler.cancel !== 'function' ||
    typeof createJobId !== 'function' ||
    typeof prepareSource !== 'function' ||
    typeof publishDocument !== 'function'
  ) {
    throw new Error('invalid structure-analysis service dependencies');
  }

  let activeJob = null;

  async function run({ trackId, onProgress }) {
    if (activeJob) {
      throw new Error('a structure-analysis job is already running');
    }
    const jobId = createJobId();
    const state = { jobId, trackId, cancelRequested: false, scheduled: false };
    activeJob = state;

    try {
      const prepared = await prepareSource({ trackId });
      if (state.cancelRequested) {
        throw new Error('audio-processing job cancelled');
      }
      state.scheduled = true;
      const result = scheduler.schedule({
        jobId,
        start: () => {
          let lease;
          try {
            lease = host.acquireCurrentGeneration();
          } catch (error) {
            throw new Error('structure-analysis capability is not activated', {
              cause: error,
            });
          }
          const capability =
            lease.generation.capabilities?.[STRUCTURE_CAPABILITY_ID];
          if (!capability) {
            lease.release();
            throw new Error('structure-analysis capability is not activated');
          }
          try {
            return createJob({
              host,
              runtimeRef: capability.runtime,
              environmentRef: capability.environment,
              modelRef: capability.model,
              generationId: lease.generation.generationId,
              jobId,
              trackId,
              ...prepared,
              releaseGenerationLease: lease.release,
              publishDocument: (document, identity) =>
                publishDocument({
                  trackId,
                  document,
                  identity,
                  libraryDir: prepared.libraryDir,
                }),
              emitProgress: ({ stage, percent }) =>
                onProgress?.({
                  jobId,
                  trackId,
                  stage,
                  ...(Number.isFinite(percent) ? { percent } : {}),
                }),
            });
          } catch (error) {
            lease.release();
            throw error;
          }
        },
      });
      return await result;
    } finally {
      if (activeJob === state) activeJob = null;
    }
  }

  function getActiveJob() {
    return activeJob
      ? { jobId: activeJob.jobId, trackId: activeJob.trackId }
      : null;
  }

  async function cancelActiveJob() {
    if (!activeJob) return false;
    activeJob.cancelRequested = true;
    if (!activeJob.scheduled) return true;
    return scheduler.cancel(activeJob.jobId);
  }

  return { run, getActiveJob, cancelActiveJob };
}

module.exports = { createStructureAnalysisService };
