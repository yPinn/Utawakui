import { reactive, readonly } from 'vue';
import {
  describeDownloadFailure,
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import { normalizeAppError } from '../../utils/appErrors.js';
import { usePlaylists } from '../usePlaylists.js';
import { useAppNotifications } from '../useAppNotifications.js';
import { useImportResultNotification } from './useImportResultNotification.js';
import { t } from '../../utils/i18n.js';

const CONCURRENCY = 2;
const ACTIVE_PHASES = new Set(['queued', 'running', 'finalizing']);
const MAX_BATCHES = 50;
const MAX_DOWNLOADS = 500;

function copyTrack(track) {
  const local = Boolean(track.alreadyDownloaded || track.status === 'done');
  return {
    id: track.id,
    downloadKey: track.downloadInput || track.playbackVideoId || track.id,
    title: track.title || t('import.execution.untitledSong'),
    artist: track.artist || '',
    duration: track.duration,
    thumbnailUrl: track.thumbnailUrl || '',
    trackIdentity: track.trackIdentity
      ? JSON.parse(JSON.stringify(track.trackIdentity))
      : null,
    selected: true,
    alreadyDownloaded: local,
    downloadRequired: !local,
    status: local ? (track.status === 'done' ? 'done' : 'pending') : 'pending',
    errorCode: null,
  };
}

export function useImportExecution({
  state,
  getDraftRevision,
  canConfirmImport,
  canRetryFailed,
  ensureProviderFlow,
  handleProviderSetupError,
  reportImportError,
  setStatus,
  notify = useAppNotifications().notify,
}) {
  const {
    create: createPlaylist,
    setTracks: setPlaylistTracks,
    upsertAlbum,
  } = usePlaylists();
  const internal = reactive({
    batches: [],
    get isImporting() {
      return this.batches.some((b) => ACTIVE_PHASES.has(b.phase));
    },
  });
  const records = new Map(),
    jobs = new Map(),
    targets = new Map(),
    submissions = new Map();
  const pending = [];
  const notifyResult = useImportResultNotification(notify);
  const activeKeys = new Set();
  let active = 0,
    nextId = 0;
  const current = (batch) =>
    records.get(batch.id)?.revision === getDraftRevision();
  const busy = (batch) => ACTIVE_PHASES.has(batch.phase);
  const findBatch = (id) => internal.batches.find((b) => b.id === id);
  const currentBatch = () => [...internal.batches].reverse().find(current);

  function syncDraft(batch) {
    if (!current(batch)) return;
    state.isImporting = busy(batch);
    for (const track of batch.tracks) {
      const draft =
        batch.kind === 'single'
          ? state.singleTrack
          : state.playlistTracks?.find((t) => t.id === track.id);
      if (!draft || (batch.kind === 'single' && draft.id !== track.id))
        continue;
      draft.status =
        track.status === 'cancelled' ||
        track.errorCode === 'FEATURE_DEPENDENCY_MISSING'
          ? 'pending'
          : track.status;
      draft.errorCode =
        track.errorCode === 'FEATURE_DEPENDENCY_MISSING'
          ? null
          : track.errorCode;
      if (batch.kind === 'single') {
        const candidate = state.singleResolution?.candidates?.find(
          (c) => (c.playbackVideoId || c.id) === track.id,
        );
        if (candidate) {
          candidate.status = draft.status;
          candidate.errorCode = draft.errorCode;
        }
      }
    }
    const target = records.get(batch.id).target;
    if (target?.playlistId) state.createdPlaylistId = target.playlistId;
  }

  function completeJob(job, error, result) {
    active--;
    activeKeys.delete(job.id);
    if (jobs.get(job.id) === job) jobs.delete(job.id);
    job.state = 'settled';
    const appError =
      error &&
      normalizeAppError(error, {
        source: 'import',
        operation: 'download-track',
      });
    const cancelled = appError?.code === 'IMPORT_DOWNLOAD_CANCELLED';
    const setup = appError?.code === 'FEATURE_DEPENDENCY_MISSING';
    if (error && !cancelled && !setup)
      reportImportError(
        error,
        'download-track',
        t('import.execution.downloadFailed'),
      );
    for (const consumer of job.consumers) {
      const { batch, track, resolve } = consumer;
      if (error) {
        track.status = cancelled ? 'cancelled' : 'error';
        track.errorCode = cancelled
          ? null
          : setup
            ? 'FEATURE_DEPENDENCY_MISSING'
            : describeDownloadFailure(error).code;
        if (setup) {
          batch.setupRequired = true;
          if (current(batch)) handleProviderSetupError(error);
        }
      } else {
        track.status = 'done';
        if (batch.kind === 'single') batch.resultTitle = result?.title || '';
      }
      syncDraft(batch);
      resolve();
    }
    job.consumers.clear();
    drain();
  }

  function drain() {
    while (active < CONCURRENCY && pending.length) {
      const index = pending.findIndex(
        (job) =>
          job.state === 'pending' &&
          job.consumers.size > 0 &&
          !activeKeys.has(job.id),
      );
      if (index < 0) break;
      const [job] = pending.splice(index, 1);
      if (job.state !== 'pending' || job.consumers.size === 0) continue;
      job.state = 'active';
      active++;
      activeKeys.add(job.id);
      for (const { batch, track } of job.consumers) {
        batch.phase = 'running';
        track.status = 'downloading';
        syncDraft(batch);
      }
      let operation;
      try {
        operation = window.Utawakui.downloadAudio(job.id);
      } catch (error) {
        completeJob(job, error);
        continue;
      }
      Promise.resolve(operation).then(
        (result) => completeJob(job, null, result),
        (error) => completeJob(job, error),
      );
    }
  }

  function subscribe(batch, track) {
    let job = jobs.get(track.downloadKey);
    if (!job) {
      job = { id: track.downloadKey, state: 'pending', consumers: new Set() };
      jobs.set(track.downloadKey, job);
      pending.push(job);
    }
    if (job.state === 'active') {
      track.status = 'downloading';
      batch.phase = 'running';
    }
    return new Promise((resolve) => {
      const consumer = { batch, track, resolve, job };
      job.consumers.add(consumer);
      records.get(batch.id).consumers.add(consumer);
    });
  }

  async function syncCollection(batch) {
    const { target } = records.get(batch.id);
    const ownIds = batch.tracks
      .filter((t) => t.alreadyDownloaded || t.status === 'done')
      .map((t) => t.id);
    if (!ownIds.length) return null;
    const run = async () => {
      const trackIds = [...new Set([...ownIds, ...target.trackIds])];
      let saved;
      if (batch.collectionKind === 'album') {
        saved = Boolean(
          await upsertAlbum({
            name: batch.title,
            source: JSON.parse(JSON.stringify(batch.source)),
            trackIds,
            thumbnailUrl: batch.thumbnailUrl,
          }),
        );
      } else {
        if (!target.playlistId) {
          const created = await createPlaylist(batch.title);
          if (!created) return false;
          target.playlistId = created.id;
        }
        saved = await setPlaylistTracks(target.playlistId, trackIds);
      }
      if (saved) target.trackIds = trackIds;
      return saved;
    };
    const operation = target.tail.then(run, run);
    target.tail = operation.catch(() => undefined);
    return operation;
  }

  function publishResult(batch) {
    syncDraft(batch);
    notifyResult(batch);
    if (!current(batch) || batch.setupRequired) return;
    const failed = batch.tracks.filter((t) => t.status === 'error');
    const dominant = failed.find((t) => t.errorCode)?.errorCode;
    if (batch.saveError)
      setStatus(t('import.execution.playlistNotSaved'), 'error');
    else if (
      batch.cancelRequested ||
      batch.tracks.some((t) => t.status === 'cancelled')
    )
      setStatus(
        batch.kind === 'single'
          ? t('import.execution.stoppedSingle')
          : t('import.execution.stoppedBatch'),
        'pending',
      );
    else if (failed.length) {
      setStatus(
        batch.kind === 'single'
          ? t('import.execution.singleFailed', {
              reason: downloadFailureLabel(dominant),
            })
          : dominant
            ? t('import.execution.batchFailedReason', {
                count: failed.length,
                reason: downloadFailureLabel(dominant),
              })
            : t('import.execution.batchFailed', { count: failed.length }),
        'error',
      );
      if (dominant) state.failureHint = downloadFailureHint(dominant);
    } else if (batch.kind === 'single')
      setStatus(
        batch.resultTitle
          ? t('import.execution.downloadedNamed', { title: batch.resultTitle })
          : t('import.execution.downloadedSong'),
        'success',
        'object',
      );
    else
      setStatus(
        batch.collectionSaved
          ? t(
              batch.collectionKind === 'album'
                ? 'import.execution.addedToAlbum'
                : 'import.execution.addedToPlaylist',
              { title: batch.title },
            )
          : t('import.execution.done'),
        'success',
      );
  }

  async function runBatch(batch) {
    const record = records.get(batch.id);
    batch.phase = 'queued';
    batch.saveError = false;
    batch.cancelRequested = false;
    batch.setupRequired = false;
    batch.cancelError = false;
    record.consumers.clear();
    const work = batch.tracks.filter(
      (t) => t.downloadRequired && t.status !== 'done',
    );
    for (const track of work) {
      track.status = 'pending';
      track.errorCode = null;
    }
    const waits = work.map((track) => subscribe(batch, track));
    syncDraft(batch);
    drain();
    try {
      await Promise.all(waits);
      if (batch.kind !== 'single') {
        batch.phase = 'finalizing';
        syncDraft(batch);
        const saved = await syncCollection(batch);
        batch.saveError = saved === false;
        batch.collectionSaved = saved === true;
      }
      batch.phase =
        batch.saveError || batch.tracks.some((t) => t.status === 'error')
          ? 'failed'
          : batch.cancelRequested ||
              batch.tracks.some((t) => t.status === 'cancelled')
            ? 'cancelled'
            : 'completed';
    } catch (error) {
      batch.saveError = true;
      batch.phase = 'failed';
      reportImportError(
        error,
        'save-import-collection',
        t('import.execution.playlistNotSaved'),
      );
    } finally {
      batch.cancelError = false;
      record.consumers.clear();
      publishResult(batch);
    }
  }

  function acceptBatch(revision) {
    // Retain failures and active groups. Older successful summaries are session-only.
    while (internal.batches.length >= MAX_BATCHES) {
      const index = internal.batches.findIndex((b) => b.phase === 'completed');
      if (index < 0) {
        setStatus(t('import.execution.queueFull'), 'pending');
        return null;
      }
      records.delete(internal.batches[index].id);
      internal.batches.splice(index, 1);
    }
    const single = state.sourceKind === 'single';
    const sourceTracks = single
      ? [
          {
            ...state.singleTrack,
            downloadInput:
              state.singleTrack.downloadInput ||
              state.singleTrack.playbackVideoId ||
              state.input,
          },
        ]
      : (state.playlistTracks || []).filter((t) => t.selected);
    const tracks = [
      ...new Map(
        sourceTracks.map(copyTrack).map((track) => [track.id, track]),
      ).values(),
    ];
    if (tracks.length > MAX_DOWNLOADS) {
      setStatus(t('import.execution.batchTooLarge'), 'pending');
      return null;
    }
    const id = `import-${++nextId}`;
    const source = state.collectionSource
      ? JSON.parse(JSON.stringify(state.collectionSource))
      : null;
    const key = single
      ? null
      : `${state.collectionKind}:${source?.platform || ''}:${source?.id || state.input}`;
    if (key && !targets.has(key))
      targets.set(key, {
        playlistId: state.createdPlaylistId,
        trackIds: [],
        tail: Promise.resolve(),
      });
    internal.batches.push({
      id,
      kind: single ? 'single' : 'playlist',
      title: single
        ? state.singleTrack.title
        : state.playlistTitle || t('import.execution.untitledList'),
      collectionKind: state.collectionKind,
      releaseType: state.collectionReleaseType || 'unknown',
      releaseDate: state.collectionReleaseDate
        ? {
            value: state.collectionReleaseDate.value,
            precision: state.collectionReleaseDate.precision,
          }
        : null,
      source,
      thumbnailUrl: single
        ? state.singleTrack.thumbnailUrl || ''
        : state.collectionThumbnailUrl,
      tracks,
      phase: 'queued',
      saveError: false,
      cancelRequested: false,
      setupRequired: false,
      cancelError: false,
    });
    const batch = internal.batches.at(-1);
    records.set(id, {
      revision,
      target: key ? targets.get(key) : null,
      consumers: new Set(),
      completion: null,
    });
    if (current(batch)) {
      state.isImporting = true;
      setStatus(
        single
          ? t('import.execution.downloadingSingle')
          : t('import.execution.downloadingSelected'),
        'pending',
      );
    }
    records.get(id).completion = runBatch(batch);
    return id;
  }

  async function submitImport() {
    const revision = getDraftRevision();
    const existing = currentBatch();
    if (existing && busy(existing)) return existing.id;
    if (submissions.has(revision)) return submissions.get(revision);
    if (!canConfirmImport.value) return null;
    const submission = (async () => {
      if (!(await ensureProviderFlow()) || revision !== getDraftRevision())
        return null;
      return acceptBatch(revision);
    })();
    submissions.set(revision, submission);
    try {
      return await submission;
    } finally {
      submissions.delete(revision);
    }
  }

  function detach(consumer) {
    consumer.cancellation ||= detachConsumer(consumer).finally(() => {
      consumer.cancellation = null;
    });
    return consumer.cancellation;
  }

  async function detachConsumer(consumer) {
    const { job, batch, track, resolve } = consumer;
    if (!job.consumers.has(consumer)) return false;
    let cancellationAccepted = false;
    if (job.consumers.size === 1 && job.state === 'active') {
      job.state = 'cancelling';
      if (jobs.get(job.id) === job) jobs.delete(job.id);
      try {
        cancellationAccepted = Boolean(
          await window.Utawakui.cancelAudioDownload?.(job.id),
        );
      } catch (error) {
        reportImportError(
          error,
          'cancel-import-download',
          t('import.execution.stopFailed'),
        );
      }
      if (!cancellationAccepted && job.state !== 'settled') {
        // A failed cancel keeps the original consumer alive. Rejoin any
        // submissions made while cancellation was awaiting the Main reply.
        const replacement = jobs.get(job.id);
        if (replacement && replacement !== job) {
          for (const other of replacement.consumers) {
            other.job = job;
            job.consumers.add(other);
            other.track.status = 'downloading';
            other.batch.phase = 'running';
            syncDraft(other.batch);
          }
          replacement.consumers.clear();
          replacement.state = 'settled';
          const index = pending.indexOf(replacement);
          if (index >= 0) pending.splice(index, 1);
        }
        job.state = 'active';
        jobs.set(job.id, job);
        batch.cancelError = true;
        batch.cancelRequested = false;
        return false;
      }
    }
    if (!job.consumers.delete(consumer)) return cancellationAccepted;
    track.status = 'cancelled';
    track.errorCode = null;
    syncDraft(batch);
    resolve();
    if (job.consumers.size === 0) {
      if (jobs.get(job.id) === job) jobs.delete(job.id);
      if (job.state === 'pending') {
        job.state = 'settled';
        const index = pending.indexOf(job);
        if (index >= 0) pending.splice(index, 1);
      }
    }
    return true;
  }

  async function cancelBatch(id) {
    const batch = findBatch(id),
      record = records.get(id);
    if (!batch || !busy(batch) || batch.phase === 'finalizing') return false;
    batch.cancelRequested = true;
    batch.cancelError = false;
    await Promise.all([...record.consumers].map(detach));
    if (batch.cancelError) return false;
    await record.completion;
    return true;
  }

  async function cancelTrackDownload(trackId, batchId = currentBatch()?.id) {
    const record = records.get(batchId);
    const consumer =
      record &&
      [...record.consumers].find(
        (c) => c.track.id === trackId && c.track.status === 'downloading',
      );
    return consumer ? detach(consumer) : false;
  }

  async function retryBatch(id) {
    const batch = findBatch(id),
      record = records.get(id);
    if (!batch || busy(batch) || !['failed', 'cancelled'].includes(batch.phase))
      return false;
    if (!(await ensureProviderFlow())) return false;
    if (busy(batch)) return false;
    record.completion = runBatch(batch);
    await record.completion;
    return true;
  }

  async function confirmImport() {
    const batch = currentBatch();
    if (batch && busy(batch)) {
      await cancelBatch(batch.id);
      return;
    }
    const id = await submitImport();
    if (id) await records.get(id)?.completion;
  }
  async function retryFailedTracks() {
    if (!canRetryFailed.value) return;
    for (const track of state.playlistTracks || [])
      if (track.status === 'error') track.selected = true;
    state.activeFilter = 'failed';
    const batch = currentBatch();
    if (batch) await retryBatch(batch.id);
    else await confirmImport();
  }
  function dismissBatch(id) {
    const index = internal.batches.findIndex((b) => b.id === id && !busy(b));
    if (index < 0) return false;
    internal.batches.splice(index, 1);
    records.delete(id);
    return true;
  }
  function clearCompletedBatches() {
    const completed = internal.batches.filter(
      (batch) => batch.phase === 'completed',
    );
    for (const batch of completed) dismissBatch(batch.id);
  }
  return {
    activity: readonly(internal),
    currentBatchId: () => currentBatch()?.id || null,
    submitImport,
    confirmImport,
    cancelTrackDownload,
    cancelBatch,
    retryBatch,
    retryFailedTracks,
    dismissBatch,
    clearCompletedBatches,
  };
}
