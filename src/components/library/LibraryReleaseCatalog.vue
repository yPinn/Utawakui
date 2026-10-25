<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useReleaseCatalog } from '../../composables/useReleaseCatalog.js';
import { useReleaseCatalogDownloads } from '../../composables/useReleaseCatalogDownloads.js';
import { useReleaseCatalogBatchDownloads } from '../../composables/useReleaseCatalogBatchDownloads.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import LibrarySourceTracklist from './LibrarySourceTracklist.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
const props = defineProps({
  collection: { type: Object, required: true },
  tracksById: { type: Map, required: true },
  selectedTrackId: { type: String, default: '' },
  playingTrackId: { type: String, default: '' },
  columnPreferences: { type: Object, default: () => ({}) },
  density: { type: String, default: 'list' },
  currentTrackId: { type: String, default: '' },
  queuedTrackIds: { type: Set, default: () => new Set() },
  enqueueingTrackId: { type: String, default: '' },
});
const emit = defineEmits([
  'play',
  'togglePlayback',
  'select',
  'menu',
  'separate',
  'updateColumnPreferences',
  'previewAvailability',
]);
const session = useReleaseCatalog();
const downloads = useReleaseCatalogDownloads();
const batches = useReleaseCatalogBatchDownloads();
const pendingSlots = computed(
  () =>
    new Set([
      ...downloads.pendingSlots(props.collection),
      ...(batches.snapshotFor(props.collection)?.pendingSlots ?? []),
    ]),
);
const { refresh: refreshPlaylists } = usePlaylists();
const catalog = ref(null),
  busy = ref(false),
  error = ref('');
let generation = 0;
let catalogScope = '';
let conflictRecovery = null;
onUnmounted(() => {
  generation++;
});
async function load(offset = 0, { forceFull = false } = {}) {
  const request = ++generation,
    collection = props.collection;
  const libraryIdentity = props.tracksById;
  const scope = JSON.stringify([collection.releaseLibraryEpoch, collection.id]);
  const retained = catalogScope === scope ? catalog.value : null;
  const visibleCount = offset ? 0 : (retained?.rows.length ?? 0);
  const availabilityOnly =
    !offset && !forceFull && Boolean(retained?.structureVersion);
  const previewAvailability = (status, availableCount = 0) =>
    emit('previewAvailability', {
      collection,
      libraryIdentity,
      status,
      availableCount,
    });
  busy.value = true;
  error.value = '';
  if (catalogScope !== scope) {
    catalog.value = null;
    catalogScope = scope;
  }
  if (!offset) {
    previewAvailability('pending');
  }
  try {
    // Keep the mounted table until every already-visible page is verified.
    // Clearing it between reads collapses the page and clamps scrollTop.
    const rows = offset ? [...(retained?.rows ?? [])] : [];
    let nextOffset = offset,
      snapshot;
    do {
      const result = await window.Utawakui.getReleaseCatalog({
        collectionId: collection.id,
        expectedRevision: collection.resolvedRelease?.revision ?? 0,
        libraryEpoch: collection.releaseLibraryEpoch,
        offset: nextOffset,
        limit: 100,
        ...(availabilityOnly ? { availabilityOnly: true } : {}),
      });
      if (request !== generation) return;
      if (result?.status === 'conflict') {
        // Completion events can precede the updated collection projection.
        // Keep the table while its revision catches up; the watcher starts a
        // new verified read. An unchanged/failed refresh must still fail closed.
        const key = JSON.stringify([
          scope,
          collection.resolvedRelease?.revision ?? 0,
        ]);
        if (conflictRecovery?.key !== key)
          conflictRecovery = { key, promise: refreshPlaylists() };
        // The same listing can also rebuild tracksById before it advances the
        // revision. Those reads share one recovery, including its settled result.
        await conflictRecovery.promise;
        await nextTick();
        if (request !== generation) return;
        throw Error('Catalog revision unavailable');
      }
      if (
        result?.status !== 'ok' ||
        !result.catalog ||
        result.collectionId !== collection.id ||
        result.libraryEpoch !== collection.releaseLibraryEpoch ||
        result.revision !== (collection.resolvedRelease?.revision ?? 0)
      )
        throw Error('Stale catalog');
      if (
        result.catalog.availabilityOnly &&
        result.catalog.structureVersion !== retained?.structureVersion
      )
        return load(0, { forceFull: true });
      if (
        snapshot &&
        result.catalog.structureVersion !== snapshot.structureVersion
      )
        throw Error('Catalog structure changed between pages');
      rows.push(...result.catalog.rows);
      snapshot = { ...result.catalog, rows };
      if (!snapshot.hasMore || rows.length >= visibleCount) break;
      if (
        !Number.isSafeInteger(snapshot.nextOffset) ||
        snapshot.nextOffset <= nextOffset ||
        snapshot.nextOffset > 5000
      )
        throw Error('Invalid catalog page');
      nextOffset = snapshot.nextOffset;
    } while (snapshot.hasMore && rows.length < visibleCount);
    if (snapshot.availabilityOnly) {
      if (
        !availabilityOnly ||
        rows.length !== retained.rows.length ||
        rows.some(
          (row, index) =>
            row.key !== retained.rows[index].key ||
            row.position !== retained.rows[index].position,
        )
      )
        throw Error('Invalid availability projection');
      // Keep the tracklist and its row objects. Main owns these verified status
      // fields; no title/order/cover is inferred from a successful download.
      const fields = [
        'state',
        'localTrackId',
        'localCandidateTrackId',
        'linkedTrackId',
      ];
      rows.forEach((row, index) => {
        for (const field of fields) {
          if (retained.rows[index][field] !== row[field])
            retained.rows[index][field] = row[field];
        }
      });
      for (const [field, value] of Object.entries(snapshot)) {
        if (field !== 'rows' && field !== 'availabilityOnly')
          retained[field] = value;
      }
    } else {
      catalog.value = snapshot;
    }
    conflictRecovery = null;
    previewAvailability('ready', snapshot.availableCount);
  } catch {
    if (request === generation) {
      catalog.value = null;
      error.value = '專輯曲目確認未完成，請重新讀取。';
      previewAvailability('error');
    }
  } finally {
    if (request === generation) busy.value = false;
  }
}
watch(
  [
    () => props.collection.id,
    () => props.collection.resolvedRelease?.revision,
    () => props.collection.releaseLibraryEpoch,
    () => props.tracksById,
    () => session.state.revision,
  ],
  () => load(),
  { immediate: true },
);
function download(row) {
  if (pendingSlots.value.has(row.key)) return false;
  return downloads.download(props.collection, row);
}
</script>

<template>
  <section
    class="library-release-catalog"
    aria-label="專輯來源曲目"
    :aria-busy="busy"
  >
    <UiHint v-if="busy && !catalog" role="status"
      >正在確認本地音源與來源曲目…</UiHint
    >
    <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
    <UiHint v-if="downloads.errorFor(collection)" tone="danger" role="alert">{{
      downloads.errorFor(collection)
    }}</UiHint>
    <UiHint v-if="session.state.error" tone="danger">{{
      session.state.error
    }}</UiHint>
    <template v-if="catalog">
      <LibrarySourceTracklist
        :catalog="catalog"
        :tracks-by-id="tracksById"
        :busy="busy"
        :download-pending-slots="pendingSlots"
        :selected-track-id="selectedTrackId"
        :playing-track-id="playingTrackId"
        :column-preferences="columnPreferences"
        :density="density"
        :current-track-id="currentTrackId"
        :queued-track-ids="queuedTrackIds"
        :enqueueing-track-id="enqueueingTrackId"
        @play="emit('play', $event)"
        @select="emit('select', $event)"
        @menu="(track, event) => emit('menu', track, event)"
        @toggle-playback="emit('togglePlayback', $event)"
        @update-column-preferences="emit('updateColumnPreferences', $event)"
        @download="download"
        @separate="emit('separate', $event)"
      />
      <UiButton
        v-if="catalog.hasMore"
        :disabled="busy"
        @click="load(catalog.nextOffset)"
        >顯示更多曲目</UiButton
      >
    </template>
  </section>
</template>

<style scoped>
.library-release-catalog {
  container-type: inline-size;
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}
</style>
