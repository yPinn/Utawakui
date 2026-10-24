import { readonly } from 'vue';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import {
  createReleaseMembershipProjection,
  releaseMembershipProjection,
  releaseMembershipKey as keyFor,
  projectReleaseTrackIds,
} from './useReleaseMembershipProjection.js';

// Verification belongs to explicit collection entry/actions, never list hydration.
// Private media bindings stay in Main; this cache holds public admission only.
export function createReleaseMemberResolver({
  getBridge,
  getCollection,
  getTracksById,
  projection = createReleaseMembershipProjection(),
}) {
  const state = projection;
  const requests = new Map();
  const tokens = new Map();
  let sequence = 0;
  let generation = 0;
  let unsubscribe = null;
  let libraryEpoch = null;

  function displayTrackIds(collection) {
    return projectReleaseTrackIds(collection, state);
  }
  function verificationState(collection) {
    const key = keyFor(collection);
    const error = state.errors.get(key) ?? '';
    return {
      state: state.pending.has(key)
        ? 'pending'
        : error
          ? 'error'
          : state.cache.has(key) || !collection?.requiresMembershipVerification
            ? 'ready'
            : 'idle',
      error,
    };
  }

  function initialize() {
    if (unsubscribe || !getBridge()?.onReleaseOrganizationChanged) return;
    unsubscribe = getBridge().onReleaseOrganizationChanged((event) => {
      generation += 1;
      state.cache.clear();
      state.admitted.clear();
      state.pending.clear();
      state.errors.clear();
      requests.clear();
      libraryEpoch = event.libraryEpoch;
    });
  }

  function current(collection, key, currentGeneration, token) {
    return (
      currentGeneration === generation &&
      tokens.get(key) === token &&
      keyFor(getCollection(collection.id)) === key &&
      (libraryEpoch === null || libraryEpoch === collection.releaseLibraryEpoch)
    );
  }

  async function read(collection, key, currentGeneration, token) {
    state.pending.add(key);
    state.error = '';
    state.errors.delete(key);
    const ids = new Set();
    let offset = 0;
    try {
      do {
        const result = await getBridge()?.resolveReleaseMembers?.({
          collectionId: collection.id,
          expectedRevision: collection.resolvedRelease?.revision ?? 0,
          libraryEpoch: collection.releaseLibraryEpoch,
          offset,
          limit: 100,
        });
        if (!current(collection, key, currentGeneration, token)) return [];
        if (
          result?.status !== 'ok' ||
          result.libraryEpoch !== collection.releaseLibraryEpoch ||
          result.revision !== (collection.resolvedRelease?.revision ?? 0) ||
          result.collectionId !== collection.id
        ) {
          state.cache.delete(key);
          state.admitted.delete(key);
          state.error = '發行成員已變更，請重新讀取後再操作。';
          state.errors.set(key, state.error);
          return [];
        }
        for (const id of result.playableTrackIds ?? [])
          if (collection.trackIds.includes(id)) ids.add(id);
        if (!result.hasMore) break;
        if (
          !Number.isSafeInteger(result.nextOffset) ||
          result.nextOffset <= offset
        ) {
          state.cache.delete(key);
          state.admitted.delete(key);
          state.error = '發行成員未完整讀取，請再試一次。';
          state.errors.set(key, state.error);
          return [];
        }
        offset = result.nextOffset;
      } while (offset <= 5000);
      if (!current(collection, key, currentGeneration, token)) return [];
      const ordered = collection.trackIds.filter((id) => ids.has(id));
      state.cache.set(key, ordered);
      state.admitted.delete(key);
      return ordered.map((id) => getTracksById().get(id)).filter(Boolean);
    } catch {
      if (current(collection, key, currentGeneration, token)) {
        state.cache.delete(key);
        state.admitted.delete(key);
        state.error = '目前無法確認發行成員，請再試一次。';
        state.errors.set(key, state.error);
      }
      return [];
    } finally {
      if (currentGeneration === generation && tokens.get(key) === token)
        state.pending.delete(key);
    }
  }

  function resolve(collection, { fresh = false } = {}) {
    if (!collection?.id) return Promise.resolve([]);
    const key = keyFor(collection);
    if (!fresh && state.cache.has(key))
      return Promise.resolve(
        state.cache
          .get(key)
          .map((id) => getTracksById().get(id))
          .filter(Boolean),
      );
    if (!fresh && requests.has(key)) return requests.get(key);
    const token = ++sequence;
    tokens.set(key, token);
    const request = read(collection, key, generation, token);
    requests.set(key, request);
    request.finally(() => {
      if (requests.get(key) === request) requests.delete(key);
    });
    return request;
  }

  function admitTrackReleases(trackId, releases, epoch) {
    if (libraryEpoch !== null && epoch !== libraryEpoch) return;
    for (const key of tokens.keys()) {
      const [keyEpoch, , , ids] = JSON.parse(key);
      if (keyEpoch === epoch && ids.includes(trackId)) {
        tokens.set(key, ++sequence);
        requests.delete(key);
        state.pending.delete(key);
      }
    }
    for (const map of [state.cache, state.admitted]) {
      for (const [key, ids] of map) {
        if (JSON.parse(key)[0] === epoch)
          map.set(
            key,
            ids.filter((id) => id !== trackId),
          );
      }
    }
    for (const release of releases) {
      const collection = getCollection(release.id);
      if (
        !collection ||
        collection.releaseLibraryEpoch !== epoch ||
        collection.resolvedRelease?.revision !== release.revision ||
        !collection.trackIds.includes(trackId)
      )
        continue;
      const key = keyFor(collection);
      state.admitted.set(key, [
        ...new Set([...(state.admitted.get(key) ?? []), trackId]),
      ]);
    }
  }

  function isPending(collection) {
    return state.pending.has(keyFor(collection));
  }
  function dispose() {
    unsubscribe?.();
    unsubscribe = null;
    generation += 1;
    libraryEpoch = null;
    requests.clear();
    tokens.clear();
    state.cache.clear();
    state.admitted.clear();
    state.pending.clear();
    state.errors.clear();
    state.error = '';
  }
  return {
    state: readonly(state),
    displayTrackIds,
    verificationState,
    resolve,
    admitTrackReleases,
    isPending,
    initialize,
    dispose,
  };
}

let singleton;
export function useReleaseMembers() {
  if (!singleton) {
    const { state: playlists } = usePlaylists();
    const { tracksById } = useLibrary();
    singleton = createReleaseMemberResolver({
      getBridge: () => globalThis.window?.Utawakui,
      getCollection: (id) =>
        playlists.playlists.find((collection) => collection.id === id),
      getTracksById: () => tracksById.value,
      projection: releaseMembershipProjection,
    });
  }
  return singleton;
}
