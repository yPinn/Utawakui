import { computed, shallowRef, watch } from 'vue';
import { releaseMembershipKey } from './useReleaseMembershipProjection.js';
import { isLocalPreviewTrack } from '../utils/trackPreviewSource.js';

// This only owns the preview control. It must never drive album presentation.
export function useTrackPreviewEligibility({
  collection,
  candidates,
  libraryIdentity,
  resolveMembers,
}) {
  const localCandidates = computed(() =>
    candidates.value.filter(isLocalPreviewTrack),
  );
  const key = computed(() => releaseMembershipKey(collection.value));
  const verification = shallowRef(null);

  function current(value) {
    return (
      value?.key === key.value &&
      value.libraryIdentity === libraryIdentity.value
    );
  }

  watch(
    [key, () => libraryIdentity.value],
    ([_key, identity], _previous, onCleanup) => {
      let active = true;
      onCleanup(() => {
        active = false;
      });
      const target = collection.value;
      const snapshot = {
        key: _key,
        libraryIdentity: identity,
        status: 'pending',
        ids: null,
        availableCount: 0,
      };
      verification.value = snapshot;
      if (target?.kind !== 'album' || target.hasSourceCatalog) return;
      if (!localCandidates.value.length) {
        verification.value = { ...snapshot, status: 'ready', ids: new Set() };
        return;
      }
      // A bounded check of this selected album, not an all-library startup scan.
      void (async () => {
        try {
          const tracks = await resolveMembers(target);
          if (!active || !current(snapshot)) return;
          const local = tracks.filter(isLocalPreviewTrack);
          verification.value = {
            ...snapshot,
            status: 'ready',
            ids: new Set(local.map((track) => track.id)),
            availableCount: local.length,
          };
        } catch {
          if (active && current(snapshot))
            verification.value = { ...snapshot, status: 'error' };
        }
      })();
    },
    { immediate: true, flush: 'sync' },
  );

  function acceptCatalog(result) {
    if (
      !collection.value?.hasSourceCatalog ||
      releaseMembershipKey(result.collection) !== key.value ||
      result.libraryIdentity !== libraryIdentity.value
    )
      return;
    if (!['pending', 'ready', 'error'].includes(result.status)) return;
    if (
      result.status === 'ready' &&
      (!Number.isSafeInteger(result.availableCount) ||
        result.availableCount < 0)
    )
      return;
    verification.value = {
      key: key.value,
      libraryIdentity: libraryIdentity.value,
      status: result.status,
      ids: null,
      availableCount: result.availableCount ?? 0,
    };
  }

  function captureScope() {
    return verification.value;
  }

  function confirm(tracks, scope = captureScope()) {
    if (!current(scope) || scope !== verification.value) return false;
    const local = tracks.filter(isLocalPreviewTrack);
    verification.value = {
      key: key.value,
      libraryIdentity: libraryIdentity.value,
      status: 'ready',
      ids: new Set(local.map((track) => track.id)),
      availableCount: local.length,
    };
    return true;
  }

  const eligibleTracks = computed(() => {
    if (collection.value?.kind !== 'album') return localCandidates.value;
    const proof = verification.value;
    if (!current(proof) || proof.status !== 'ready' || !proof.availableCount)
      return [];
    return proof.ids
      ? localCandidates.value.filter((track) => proof.ids.has(track.id))
      : localCandidates.value;
  });
  const canPreview = computed(() => eligibleTracks.value.length > 0);
  const blockedReason = computed(() => {
    if (canPreview.value) return '';
    if (collection.value?.kind === 'album' && localCandidates.value.length) {
      if (
        !current(verification.value) ||
        verification.value.status === 'pending'
      )
        return '正在確認本地音檔';
      if (verification.value.status === 'error') return '無法確認本地音檔';
    }
    return '沒有可用的本地音檔';
  });
  return {
    canPreview,
    blockedReason,
    eligibleTracks,
    acceptCatalog,
    confirm,
    captureScope,
  };
}
