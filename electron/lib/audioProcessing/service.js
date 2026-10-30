'use strict';

function createAudioProcessingService({
  resolveRecipe,
  prepareJob,
  createEngineJob,
  createJobId,
}) {
  let activeJob = null;

  async function run({
    trackId,
    recipeId,
    outputFormat,
    onProgress,
    assertCurrent = () => {},
  }) {
    if (activeJob) {
      throw new Error('an audio-processing job is already running');
    }

    const recipe = resolveRecipe(recipeId);
    const jobId = createJobId();
    const jobState = {
      jobId,
      trackId,
      recipeId: recipe.id,
      cancel: null,
    };
    activeJob = jobState;

    try {
      assertCurrent();
      const prepared = await prepareJob({
        jobId,
        trackId,
        recipe,
        ...(outputFormat ? { outputFormat } : {}),
      });
      assertCurrent();
      const emitProgress = ({ stage, percent }) => {
        onProgress?.({
          jobId,
          trackId,
          recipeId: recipe.id,
          stage,
          ...(Number.isFinite(percent) ? { percent } : {}),
        });
      };
      const engineJob = createEngineJob({
        jobId,
        trackId,
        recipeId: recipe.id,
        engineId: recipe.engineId,
        prepared,
        emitProgress,
        assertCurrent,
      });
      if (!engineJob || !engineJob.result) {
        throw new Error('audio-processing engine did not return a job result');
      }
      jobState.cancel =
        typeof engineJob.cancel === 'function' ? engineJob.cancel : null;
      const result = await engineJob.result;
      assertCurrent();
      return result;
    } finally {
      if (activeJob === jobState) activeJob = null;
    }
  }

  function getActiveJob() {
    if (!activeJob) return null;
    const { jobId, trackId, recipeId } = activeJob;
    return { jobId, trackId, recipeId };
  }

  async function cancelActiveJob() {
    if (!activeJob?.cancel) return false;
    const cancelled = await activeJob.cancel();
    return cancelled !== false;
  }

  return { run, getActiveJob, cancelActiveJob };
}

module.exports = { createAudioProcessingService };
