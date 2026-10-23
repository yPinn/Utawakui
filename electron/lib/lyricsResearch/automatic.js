'use strict';
const {
  isBoundedTrackId,
  isLyricsSubtitleFilename,
} = require('../library/paths');
const { randomUUID } = require('node:crypto');
const { isAnalysisLanguage, SKIP_REASONS } = require('./language');

function createExperimentalLyricsQueue({
  getConfig,
  updateConfig,
  isAllowed,
  research,
  onComplete = () => {},
  onError = () => {},
}) {
  const items = [];
  const admissions = new Set();
  let draining = false,
    active = null,
    retryTimer;
  const enabled = () =>
    getConfig().experimentalLyricsAfterSeparation === true && isAllowed();
  function environmentStatus() {
    try {
      return research.status();
    } catch {
      return { status: 'damaged', busy: false };
    }
  }
  const status = () => {
    const environment = environmentStatus();
    return {
      enabled: getConfig().experimentalLyricsAfterSeparation === true,
      allowed: isAllowed(),
      environmentStatus: environment.status,
      stage: environment.stage ?? '',
      items: items.map((item) => ({
        ...item,
        ...(item === active && item.status === 'running'
          ? { progress: environment.progress ?? null }
          : {}),
      })),
    };
  };
  function requestDrain() {
    if (draining || retryTimer || !items.some((i) => i.status === 'pending'))
      return;
    queueMicrotask(() => {
      void drain();
    });
  }
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (items.some((i) => i.status === 'pending')) {
        const item = items.find((i) => i.status === 'pending');
        if (!enabled()) {
          item.status = 'cancelled';
          continue;
        }
        const environment = environmentStatus();
        if (environment.busy || research.isAnalysisBusy?.()) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            requestDrain();
          }, 500);
          retryTimer.unref?.();
          break;
        }
        if (
          environment.status === 'missing' ||
          environment.status === 'damaged'
        ) {
          item.status = 'skipped';
          item.reason = 'environment-missing';
          continue;
        }
        active = item;
        item.status = 'running';
        try {
          const result = await research.analyze(
            item.trackId,
            item.analysisLanguage,
            item.sourceFilename,
            item.sourceRevision,
          );
          if (item.status === 'cancelled' || result?.cancelled || !enabled())
            item.status = 'cancelled';
          else {
            item.status = result?.status === 'skipped' ? 'skipped' : 'ready';
            item.reason =
              result?.status === 'skipped'
                ? SKIP_REASONS.includes(result.reason)
                  ? result.reason
                  : 'unsupported-lyrics'
                : null;
            if (item.status === 'ready') {
              try {
                onComplete(item.trackId, item.jobId);
              } catch {
                /* Optional projection. */
              }
            }
          }
        } catch (error) {
          if (item.status !== 'cancelled') {
            item.status = 'failed';
            item.reason = 'analysis-failed';
          }
          try {
            onError(error);
          } catch {
            /* Diagnostics cannot affect accompaniment. */
          }
        } finally {
          active = null;
        }
      }
    } finally {
      draining = false;
    }
  }
  async function enqueue(trackId, analysisLanguage = 'auto', sourceFilename) {
    if (
      !isBoundedTrackId(trackId) ||
      !isAnalysisLanguage(analysisLanguage) ||
      (sourceFilename !== undefined &&
        (!isLyricsSubtitleFilename(sourceFilename) ||
          sourceFilename.length > 240)) ||
      !enabled() ||
      admissions.size +
        items.filter((i) => ['pending', 'running'].includes(i.status)).length >=
        100
    )
      return false;
    const admission = { trackId, cancelled: false };
    admissions.add(admission);
    try {
      const captured = await research.prepareAnalysis(
        trackId,
        analysisLanguage,
        sourceFilename,
      );
      if (admission.cancelled || !enabled() || !captured) return false;
      const source = captured.sourceFilename;
      const revision = captured.sourceRevision;
      if (
        captured.status !== 'skipped' &&
        (!isLyricsSubtitleFilename(source) ||
          source.length > 240 ||
          typeof revision !== 'string' ||
          !revision.length ||
          revision.length > 128)
      )
        return false;
      const same = (i) =>
        i.trackId === trackId &&
        i.sourceFilename === source &&
        i.sourceRevision === revision;
      if (
        items.some((i) => same(i) && ['pending', 'running'].includes(i.status))
      )
        return false;
      const old = items.findIndex((i) => same(i));
      if (old >= 0) items.splice(old, 1);
      if (items.length >= 100) {
        const expired = items.findIndex(
          (i) => !['pending', 'running'].includes(i.status),
        );
        if (expired < 0) return false;
        items.splice(expired, 1);
      }
      items.push({
        jobId: randomUUID(),
        trackId,
        sourceFilename: source,
        sourceRevision: revision,
        status: captured.status === 'skipped' ? 'skipped' : 'pending',
        reason:
          captured.status === 'skipped'
            ? SKIP_REASONS.includes(captured.reason)
              ? captured.reason
              : 'unsupported-lyrics'
            : null,
        analysisLanguage,
      });
      requestDrain();
      return true;
    } catch (error) {
      try {
        onError(error);
      } catch {
        /* Diagnostics cannot affect playback. */
      }
      return false;
    } finally {
      admissions.delete(admission);
    }
  }
  async function cancel(trackId, jobId) {
    if (
      (trackId !== undefined && !isBoundedTrackId(trackId)) ||
      (jobId !== undefined &&
        (typeof jobId !== 'string' || !/^[a-f0-9-]{36}$/u.test(jobId)))
    )
      throw Error('invalid experimental job');
    if (jobId === undefined)
      for (const admission of admissions)
        if (trackId === undefined || admission.trackId === trackId)
          admission.cancelled = true;
    for (const item of items) {
      if (
        (trackId === undefined || item.trackId === trackId) &&
        (jobId === undefined || item.jobId === jobId) &&
        ['pending', 'running'].includes(item.status)
      )
        item.status = 'cancelled';
    }
    if (active?.status === 'cancelled') await research.cancel();
    if (!items.some((i) => i.status === 'pending')) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    return status();
  }
  async function setEnabled(value) {
    if (typeof value !== 'boolean' || (value && !isAllowed()))
      throw Error('experimental lyrics unavailable');
    updateConfig({ experimentalLyricsAfterSeparation: value });
    if (!value) await cancel();
    return status();
  }
  return { status, enqueue, cancel, setEnabled };
}
module.exports = { createExperimentalLyricsQueue };
