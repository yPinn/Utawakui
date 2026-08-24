import { computed, readonly, shallowRef } from 'vue';

const MAX_BATCH_TRACKS = 500;
const BATCH_STATUSES = new Set([
  'running',
  'cancelling',
  'completed',
  'cancelled',
]);
const ITEM_STATUSES = new Set([
  'pending',
  'checking',
  'running',
  'completed',
  'failed',
  'skipped',
  'cancelled',
]);
const ITEM_REASONS = new Set(['analysis-failed', 'unavailable-source']);

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeTrackId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !hasControlCharacters(value)
  );
}

function boundedCount(value, total) {
  return Number.isSafeInteger(value) && value >= 0 && value <= total;
}

function normalizeItem(value) {
  if (
    !value ||
    !safeTrackId(value.trackId) ||
    !ITEM_STATUSES.has(value.status)
  ) {
    return null;
  }
  if (
    value.percent !== undefined &&
    (!Number.isFinite(value.percent) ||
      value.percent < 0 ||
      value.percent > 100)
  ) {
    return null;
  }
  if (value.reason !== undefined && !ITEM_REASONS.has(value.reason))
    return null;
  return {
    trackId: value.trackId,
    status: value.status,
    ...(typeof value.jobId === 'string' && value.jobId.length <= 128
      ? { jobId: value.jobId }
      : {}),
    ...(typeof value.stage === 'string' && value.stage.length <= 64
      ? { stage: value.stage }
      : {}),
    ...(Number.isFinite(value.percent) ? { percent: value.percent } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
  };
}

function normalizeBatchStatus(payload) {
  if (payload?.batch === null) return null;
  const value = payload?.batch;
  if (
    !value ||
    typeof value.batchId !== 'string' ||
    value.batchId.length === 0 ||
    value.batchId.length > 128 ||
    !BATCH_STATUSES.has(value.status) ||
    typeof value.force !== 'boolean' ||
    !Number.isSafeInteger(value.total) ||
    value.total < 1 ||
    value.total > MAX_BATCH_TRACKS ||
    !Array.isArray(value.items) ||
    value.items.length !== value.total ||
    !Number.isFinite(value.percent) ||
    value.percent < 0 ||
    value.percent > 100
  ) {
    throw new Error('invalid music analysis batch status');
  }
  const items = value.items.map(normalizeItem);
  if (items.some((item) => item === null)) {
    throw new Error('invalid music analysis batch status');
  }
  for (const key of [
    'completed',
    'succeeded',
    'failed',
    'skipped',
    'cancelled',
  ]) {
    if (!boundedCount(value[key], value.total)) {
      throw new Error('invalid music analysis batch status');
    }
  }
  if (
    value.activeTrackId !== null &&
    (!safeTrackId(value.activeTrackId) ||
      !items.some(({ trackId }) => trackId === value.activeTrackId))
  ) {
    throw new Error('invalid music analysis batch status');
  }
  return {
    batchId: value.batchId,
    status: value.status,
    force: value.force,
    total: value.total,
    completed: value.completed,
    succeeded: value.succeeded,
    failed: value.failed,
    skipped: value.skipped,
    cancelled: value.cancelled,
    activeTrackId: value.activeTrackId,
    percent: value.percent,
    items,
  };
}

function summaryText(value) {
  if (!value) return '';
  if (['running', 'cancelling'].includes(value.status)) {
    return `已處理 ${value.completed} / ${value.total} 首`;
  }
  const parts = [];
  if (value.succeeded) parts.push(`完成 ${value.succeeded} 首`);
  if (value.skipped) parts.push(`略過 ${value.skipped} 首`);
  if (value.failed) parts.push(`失敗 ${value.failed} 首`);
  if (value.cancelled) parts.push(`取消 ${value.cancelled} 首`);
  return parts.join('，') || '沒有處理任何曲目';
}

export function useMusicAnalysisBatch({ tracks, bridge, onStatusChange } = {}) {
  const batch = shallowRef(null);
  const selectedTrackIds = shallowRef([]);
  const error = shallowRef('');
  let unsubscribe = null;
  let disposed = false;

  const active = computed(() =>
    ['running', 'cancelling'].includes(batch.value?.status),
  );
  const itemsByTrackId = computed(() =>
    Object.fromEntries(
      (batch.value?.items ?? []).map((item) => [item.trackId, item]),
    ),
  );
  const summary = computed(() => summaryText(batch.value));

  function allowedTrackIds() {
    return new Set((tracks?.value ?? []).map(({ id }) => id));
  }

  function applyStatus(payload) {
    if (disposed) return null;
    try {
      batch.value = normalizeBatchStatus(payload);
      error.value = '';
      onStatusChange?.(batch.value);
      return batch.value;
    } catch {
      batch.value = null;
      error.value = '批次分析狀態無效，請重新啟動後再試。';
      return null;
    }
  }

  async function refreshStatus() {
    if (typeof bridge?.getMusicStructureBatchStatus !== 'function') return null;
    try {
      return applyStatus(await bridge.getMusicStructureBatchStatus());
    } catch {
      error.value = '目前無法讀取批次分析狀態，請稍後再試。';
      return null;
    }
  }

  async function initialize() {
    if (bridge && !unsubscribe) {
      unsubscribe = bridge.onMusicStructureBatchProgress?.(applyStatus) ?? null;
    }
    return refreshStatus();
  }

  function toggleTrack(trackId) {
    if (!allowedTrackIds().has(trackId) || active.value) return;
    if (selectedTrackIds.value.includes(trackId)) {
      selectedTrackIds.value = selectedTrackIds.value.filter(
        (id) => id !== trackId,
      );
      error.value = '';
      return;
    }
    if (selectedTrackIds.value.length >= MAX_BATCH_TRACKS) {
      error.value = '單次最多選取 500 首曲目。';
      return;
    }
    selectedTrackIds.value = [...selectedTrackIds.value, trackId];
    error.value = '';
  }

  function selectTracks(trackIds) {
    if (!Array.isArray(trackIds) || active.value) return;
    const allowed = allowedTrackIds();
    const next = new Set(selectedTrackIds.value);
    let reachedLimit = false;
    for (const trackId of trackIds) {
      if (!allowed.has(trackId) || next.has(trackId)) continue;
      if (next.size >= MAX_BATCH_TRACKS) {
        reachedLimit = true;
        continue;
      }
      next.add(trackId);
    }
    selectedTrackIds.value = [...next];
    error.value = reachedLimit ? '單次最多選取 500 首曲目。' : '';
  }

  function clearSelection() {
    if (!active.value) {
      selectedTrackIds.value = [];
      error.value = '';
    }
  }

  async function start({ force = false } = {}) {
    if (
      active.value ||
      selectedTrackIds.value.length === 0 ||
      typeof bridge?.startMusicStructureBatch !== 'function'
    ) {
      return null;
    }
    const allowed = allowedTrackIds();
    const trackIds = selectedTrackIds.value.filter((id) => allowed.has(id));
    if (trackIds.length === 0) return null;
    error.value = '';
    try {
      return applyStatus(
        await bridge.startMusicStructureBatch([...trackIds], force === true),
      );
    } catch {
      error.value = '批次分析無法開始，請確認目前沒有其他音訊工作。';
      return null;
    }
  }

  async function cancel() {
    if (
      !active.value ||
      typeof bridge?.cancelMusicStructureBatch !== 'function'
    ) {
      return false;
    }
    try {
      const result = await bridge.cancelMusicStructureBatch();
      return Boolean(result?.cancelled);
    } catch {
      error.value = '批次分析取消失敗，請稍後再試。';
      return false;
    }
  }

  function dispose() {
    disposed = true;
    unsubscribe?.();
    unsubscribe = null;
  }

  return {
    batch: readonly(batch),
    selectedTrackIds: readonly(selectedTrackIds),
    error: readonly(error),
    active,
    itemsByTrackId,
    summary,
    initialize,
    refreshStatus,
    toggleTrack,
    selectTracks,
    clearSelection,
    start,
    cancel,
    dispose,
  };
}

export { normalizeBatchStatus };
