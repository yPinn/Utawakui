import {
  RIGHT_DOCK_SURFACE_PREPARATION,
  useAppRightDock,
} from '../useAppRightDock.js';
import { notificationKey } from '../../constants/notificationKeys.js';
import { t } from '../../utils/i18n.js';

export function useImportResultNotification(notify) {
  return (batch) => notifyImportResult(batch, notify);
}

function notifyImportResult(batch, notify) {
  if (batch.setupRequired) return;
  const work = batch.tracks.filter((track) => track.downloadRequired);
  const completed = work.filter((track) => track.status === 'done').length;
  const failed = work.filter((track) => track.status === 'error').length;
  const cancelled = work.filter((track) => track.status === 'cancelled').length;
  const local = batch.tracks.length - work.length;
  const stopped = batch.phase === 'cancelled';
  const problems = failed || batch.saveError;
  const tone = problems
    ? completed || local
      ? 'warning'
      : 'danger'
    : stopped
      ? 'info'
      : 'success';
  const summary = [
    t('import.result.completed', { count: completed }),
    failed ? t('import.result.failed', { count: failed }) : '',
    cancelled ? t('import.result.cancelled', { count: cancelled }) : '',
    local ? t('import.result.local', { count: local }) : '',
    batch.saveError ? t('import.result.saveError') : '',
  ]
    .filter(Boolean)
    .join(t('common.clauseSeparator'));
  notify({
    key: notificationKey.providerImport(batch.id),
    title: problems
      ? t('import.result.incomplete')
      : stopped
        ? t('import.result.stopped')
        : work.length
          ? t('import.result.done')
          : t('import.result.imported'),
    message:
      batch.kind === 'single' && !problems && !stopped
        ? String(
            batch.resultTitle || batch.title || t('import.result.songAdded'),
          ).slice(0, 200)
        : summary,
    tone,
    lifecycle: problems ? 'persistent' : 'transient',
    // Transient results carry no action; the Import tab keeps the details.
    ...(problems && {
      actionLabel: t('import.result.viewResults'),
      action() {
        const dock = useAppRightDock();
        dock.selectPreparationTab('import');
        dock.showSurface(RIGHT_DOCK_SURFACE_PREPARATION);
      },
    }),
  });
}
