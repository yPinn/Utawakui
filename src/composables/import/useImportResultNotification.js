import {
  RIGHT_DOCK_SURFACE_PREPARATION,
  useAppRightDock,
} from '../useAppRightDock.js';
import { notificationKey } from '../../constants/notificationKeys.js';

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
    `${completed} 首下載完成`,
    failed ? `${failed} 首失敗` : '',
    cancelled ? `${cancelled} 首已停止` : '',
    local ? `${local} 首已在曲庫` : '',
    batch.saveError ? '播放清單未儲存，請再試一次' : '',
  ]
    .filter(Boolean)
    .join('，');
  notify({
    key: notificationKey.providerImport(batch.id),
    title: problems
      ? '下載未完成'
      : stopped
        ? '下載已停止'
        : work.length
          ? '下載完成'
          : '匯入完成',
    message:
      batch.kind === 'single' && !problems && !stopped
        ? String(batch.resultTitle || batch.title || '歌曲已加入曲庫').slice(
            0,
            200,
          )
        : summary,
    tone,
    lifecycle: problems ? 'persistent' : 'transient',
    // Transient results carry no action; the Import tab keeps the details.
    ...(problems && {
      actionLabel: '查看下載結果',
      action() {
        const dock = useAppRightDock();
        dock.selectPreparationTab('import');
        dock.showSurface(RIGHT_DOCK_SURFACE_PREPARATION);
      },
    }),
  });
}
