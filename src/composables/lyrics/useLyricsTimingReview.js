import { reactive, readonly, watch, nextTick } from 'vue';

// Source documents own saved data. This coordinator only sequences the explicit
// human intent; a receipt never changes the canonical document or transport.
export function useLyricsTimingReview({
  state,
  sourceSession,
  waitForSavedOffset,
  saveTimingDocument,
  reportLyricsError,
  getOffsetIntentRevision,
  reloadSource,
}) {
  const review = reactive({
    status: 'loading',
    coverage: null,
    confirmedAt: null,
    isLoading: false,
    isBusy: false,
    error: null,
    timingSaved: false,
  });
  let readId = 0,
    operationId = 0,
    editSerial = 0;
  let activeToken = null;
  function releaseToken(token) {
    if (!token || !window.Utawakui?.cancelLyricsTimingReview) return;
    try {
      Promise.resolve(window.Utawakui.cancelLyricsTimingReview(token)).catch(
        () => {},
      );
    } catch {
      /* Cancellation does not block navigation. */
    }
  }
  function cancel() {
    operationId++;
    releaseToken(activeToken);
    activeToken = null;
    review.isBusy = false;
    review.error = null;
    review.timingSaved = false;
  }
  const context = () =>
    `${state.selectedTrackId ?? ''}\0${state.selectedSourceFilename ?? ''}`;
  const signature = () => JSON.stringify(sourceSession.value);
  watch(
    () => [state.selectedTrackId, state.selectedSourceFilename],
    () => {
      editSerial++;
    },
    { flush: 'sync' },
  );
  function report(error, operation, fallback) {
    return reportLyricsError(error, operation, fallback);
  }
  async function refresh() {
    const request = ++readId,
      key = context(),
      session = sourceSession.value,
      stamp = signature();
    review.status = 'loading';
    review.coverage = null;
    review.isLoading = true;
    const current = () =>
      request === readId && key === context() && stamp === signature();
    if (!session || !window.Utawakui?.getLyricsTimingReview) {
      if (current()) {
        review.status = 'unavailable';
        review.isLoading = false;
      }
      return null;
    }
    try {
      const value = await window.Utawakui.getLyricsTimingReview(
        state.selectedTrackId,
        state.selectedSourceFilename,
        session,
      );
      if (current()) {
        Object.assign(review, value, { error: null });
        return value;
      }
      releaseToken(value?.token);
    } catch (error) {
      if (current()) {
        review.status = 'unavailable';
        review.error = report(
          error,
          'review-load',
          '無法讀取確認狀態，請再試一次。',
        );
      }
    } finally {
      if (current()) review.isLoading = false;
    }
    return null;
  }
  watch(
    sourceSession,
    async () => {
      await nextTick();
      await refresh();
    },
    { immediate: true },
  );

  async function act(
    kind,
    { document, baseline, isCurrent = () => true, onSaved = () => {} } = {},
  ) {
    if (review.isBusy || !sourceSession.value) return false;
    const request = ++operationId,
      key = context(),
      id = sourceSession.value.id,
      serial = editSerial,
      offsetIntent = getOffsetIntentRevision();
    const current = () =>
      request === operationId &&
      context() === key &&
      editSerial === serial &&
      getOffsetIntentRevision() === offsetIntent &&
      sourceSession.value?.id === id &&
      isCurrent();
    const sameContext = () => request === operationId && context() === key;
    review.isBusy = true;
    review.error = null;
    review.timingSaved = false;
    let commandToken = null;
    try {
      if (document) {
        if (!(await saveTimingDocument(document, baseline))) return false;
        if (!current()) return false;
        review.timingSaved = true;
        onSaved();
      }
      if (!(await waitForSavedOffset())) {
        if (current())
          review.error = review.timingSaved
            ? '時間已儲存；同步調整未儲存，處理後再確認。'
            : '同步調整未儲存，請重新儲存後再確認。';
        return false;
      }
      if (!current()) return false;
      const trackId = state.selectedTrackId,
        filename = state.selectedSourceFilename,
        session = sourceSession.value;
      const ready = await window.Utawakui.getLyricsTimingReview(
        trackId,
        filename,
        session,
      );
      if (!current() || signature() !== JSON.stringify(session)) {
        releaseToken(ready?.token);
        return false;
      }
      if (
        !ready?.token ||
        (kind === 'confirm' &&
          ['not-applicable', 'unusable', 'corrupt', 'unsupported'].includes(
            ready.status,
          ))
      ) {
        Object.assign(review, ready);
        return false;
      }
      const call =
        kind === 'confirm'
          ? window.Utawakui.confirmLyricsTimingReview
          : window.Utawakui.revokeLyricsTimingReview;
      commandToken = ready.token;
      activeToken = commandToken;
      const saved = await call(trackId, filename, session, ready.token);
      if (!current() || signature() !== JSON.stringify(session)) return false;
      readId++;
      Object.assign(review, saved, { error: null, isLoading: false });
      return true;
    } catch (error) {
      if (current()) {
        // A lost response can follow a successful write. Read the fact before
        // presenting a retry, and never resubmit an older timing document.
        const saved = await refresh();
        if (!current()) return false;
        if (saved?.status === (kind === 'confirm' ? 'confirmed' : 'revoked'))
          return true;
        review.error = report(
          error,
          `review-${kind}`,
          review.timingSaved
            ? '時間已儲存；確認未完成，請再確認一次。'
            : '確認操作未完成，請再試一次。',
        );
      }
      return false;
    } finally {
      releaseToken(commandToken);
      if (activeToken === commandToken) activeToken = null;
      if (sameContext()) review.isBusy = false;
    }
  }
  watch(
    () => [state.selectedTrackId, state.selectedSourceFilename],
    () => {
      cancel();
    },
    { flush: 'sync' },
  );
  watch(
    () => [sourceSession.value?.id, state.offsetSeconds],
    () => {
      if (activeToken) cancel();
    },
    { flush: 'sync' },
  );
  return {
    state: readonly(review),
    cancel,
    refresh,
    async reload() {
      if (review.isBusy) return null;
      if (reloadSource) await reloadSource();
      return refresh();
    },
    confirm: (options) => act('confirm', options),
    revoke: () => act('revoke'),
  };
}
