import { t } from './i18n.js';
export function isImportBatchRunning(batch) {
  return ['queued', 'running', 'finalizing'].includes(batch?.phase);
}

export function importBatchProgress(batch) {
  const tracks = (batch?.tracks || []).filter(
    (track) => track.downloadRequired,
  );
  const count = (status) =>
    tracks.filter((track) => track.status === status).length;
  const completed = count('done'),
    failed = count('error'),
    cancelled = count('cancelled');
  return {
    total: tracks.length,
    completed,
    failed,
    cancelled,
    active: count('downloading'),
    pending: count('pending'),
    processed: completed + failed + cancelled,
    phaseLabel: batch?.cancelError
      ? t('import.batch.stopFailed')
      : batch?.saveError
        ? t('import.batch.notSaved')
        : {
            queued: t('import.batch.phases.queued'),
            running: t('import.batch.phases.running'),
            finalizing: t('import.batch.phases.finalizing'),
            completed: t('import.batch.phases.completed'),
            failed: t('import.batch.phases.failed'),
            cancelled: t('import.batch.phases.cancelled'),
          }[batch?.phase] || '',
  };
}
