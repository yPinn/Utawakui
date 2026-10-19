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
      ? '停止未完成'
      : batch?.saveError
        ? '清單尚未儲存'
        : {
            queued: '等待下載',
            running: '下載中',
            finalizing: '正在整理清單',
            completed: '已完成',
            failed: '未完成',
            cancelled: '已停止',
          }[batch?.phase] || '',
  };
}
