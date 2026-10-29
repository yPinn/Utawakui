<script setup>
import { computed } from 'vue';
import { Download, ListPlus } from '../../icons/index.js';
import { projectSourceCatalogRows } from '../../utils/sourceCatalog.js';
import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';
import TrackTable from '../track/TrackTable.vue';
import UiIconButton from '../ui/UiIconButton.vue';

const props = defineProps({
  catalog: { type: Object, required: true },
  tracksById: { type: Map, required: true },
  busy: Boolean,
  downloadDisabled: Boolean,
  downloadPendingSlots: { type: Set, default: () => new Set() },
  selectedTrackId: { type: String, default: '' },
  currentTrackId: { type: String, default: '' },
  playingTrackId: { type: String, default: '' },
  columnPreferences: { type: Object, default: () => ({}) },
  density: { type: String, default: 'list' },
  queuedTrackIds: { type: Set, default: () => new Set() },
  enqueueingTrackId: { type: String, default: '' },
});
const emit = defineEmits([
  'play',
  'togglePlayback',
  'select',
  'menu',
  'download',
  'separate',
  'updateColumnPreferences',
]);
const { playCountOf } = usePlaybackHistory();
// Source-only data stays a presentation entry, never a canonical local track.
const entries = computed(() =>
  projectSourceCatalogRows(props.catalog, props.tracksById).map((row) => ({
    key: row.key,
    sourceRow: row,
    track: row.track,
    displayTrack: {
      title: row.title || '來源未提供曲名',
      artist: row.artist,
      duration: row.duration,
    },
    disabled: !row.track,
    // The manifest has flat positions; local tags may describe another release.
    trackNumber: row.position,
    discNumber: 1,
    playCount: row.track ? playCountOf(row.track.id) : null,
  })),
);
const unmatchedEntries = computed(() =>
  (props.catalog.unmatchedTrackIds ?? [])
    .map((id) => props.tracksById.get(id))
    .filter(Boolean)
    .map((track, visibleIndex) => ({
      track,
      visibleIndex,
      playCount: playCountOf(track.id),
    })),
);
</script>

<template>
  <TrackTable
    :entries="entries"
    collection-kind="album"
    label="專輯完整來源曲序"
    :column-preferences="columnPreferences"
    :density="density"
    :selected-track-id="selectedTrackId"
    :current-track-id="currentTrackId"
    :playing-track-id="playingTrackId"
    :vs-queued-track-ids="queuedTrackIds"
    :vs-enqueue-pending-track-id="enqueueingTrackId"
    @select-track="emit('select', $event)"
    @activate-track="emit('play', $event)"
    @toggle-playback="emit('togglePlayback', $event)"
    @queue-separation="emit('separate', $event)"
    @open-menu="(track, event) => emit('menu', track, event)"
    @update-column-preferences="emit('updateColumnPreferences', $event)"
  >
    <template #row-status="{ entry }">
      <UiIconButton
        v-if="
          !entry.track &&
          (entry.sourceRow.sourceAvailable ||
            entry.sourceRow.localCandidateTrackId)
        "
        class="library-source-tracks__download"
        :icon="entry.sourceRow.localCandidateTrackId ? ListPlus : Download"
        :label="
          entry.sourceRow.localCandidateTrackId
            ? `納入本地曲目：${entry.displayTrack.title}`
            : `下載 ${entry.displayTrack.title}`
        "
        :loading="downloadPendingSlots.has(entry.key)"
        :loading-label="
          entry.sourceRow.localCandidateTrackId ? '正在納入專輯' : '下載中'
        "
        :disabled="busy || downloadDisabled"
        :aria-disabled="busy || downloadDisabled ? 'true' : 'false'"
        @click.stop="emit('download', entry.sourceRow)"
        @dblclick.stop
      />
    </template>
  </TrackTable>
  <template v-if="unmatchedEntries.length">
    <h3 class="library-source-tracks__heading">未對應的本地收錄</h3>
    <TrackTable
      :entries="unmatchedEntries"
      collection-kind="album"
      label="未對應的本地收錄"
      :column-preferences="columnPreferences"
      :density="density"
      :selected-track-id="selectedTrackId"
      :current-track-id="currentTrackId"
      :playing-track-id="playingTrackId"
      :vs-queued-track-ids="queuedTrackIds"
      :vs-enqueue-pending-track-id="enqueueingTrackId"
      @select-track="emit('select', $event)"
      @activate-track="emit('play', $event)"
      @toggle-playback="emit('togglePlayback', $event)"
      @queue-separation="emit('separate', $event)"
      @open-menu="(track, event) => emit('menu', track, event)"
      @update-column-preferences="emit('updateColumnPreferences', $event)"
    />
  </template>
</template>

<style scoped>
.library-source-tracks__download {
  --ui-icon-button-size-override: var(--ui-track-row-utility-size);
  pointer-events: auto;
}
.library-source-tracks__heading {
  font-size: var(--ui-type-title-size);
  margin-block: var(--ui-space-5) var(--ui-space-3);
}
</style>
