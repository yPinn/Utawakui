<script setup>
import { computed } from 'vue';
import TrackTable from '../track/TrackTable.vue';

// Compatibility adapter for visual demos and older callers. Production
// Setlist pages use TrackTable directly so every entity variant shares
// one column, alignment, state, and keyboard-interaction contract.
const props = defineProps({
  entries: { type: Array, default: () => [] },
  sort: { type: Object, required: true },
  isAlbum: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
  label: { type: String, default: '' },
  hideArtist: { type: Boolean, default: false },
  canDrag: { type: Boolean, default: false },
  selectedTrackId: { type: String, default: null },
  currentTrackId: { type: String, default: null },
  draggingTrackId: { type: String, default: null },
  dropTargetTrackId: { type: String, default: null },
  dropPosition: { type: String, default: null },
  jumpableTrackIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits([
  'toggleSort',
  'selectTrack',
  'activateTrack',
  'titleClick',
  'openMenu',
  'moveTrack',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
]);

const variant = computed(() =>
  props.isAlbum ? 'album' : props.readOnly ? 'artist' : 'playlist',
);
</script>

<template>
  <TrackTable
    :entries="entries"
    :variant="variant"
    :label="label"
    :sort="sort"
    sortable
    :can-drag="canDrag"
    :selected-track-id="selectedTrackId"
    :current-track-id="currentTrackId"
    :dragging-track-id="draggingTrackId"
    :drop-target-track-id="dropTargetTrackId"
    :drop-position="dropPosition"
    :jumpable-track-ids="jumpableTrackIds"
    @toggle-sort="emit('toggleSort', $event)"
    @select-track="emit('selectTrack', $event)"
    @activate-track="emit('activateTrack', $event)"
    @title-click="emit('titleClick', $event)"
    @open-menu="(track, event) => emit('openMenu', track, event)"
    @move-track="(trackId, offset) => emit('moveTrack', trackId, offset)"
    @track-drag-start="(track, event) => emit('trackDragStart', track, event)"
    @track-drag-over="(track, event) => emit('trackDragOver', track, event)"
    @track-drag-leave="(track, event) => emit('trackDragLeave', track, event)"
    @track-drop="(track, event) => emit('trackDrop', track, event)"
    @track-drag-end="emit('trackDragEnd')"
  />
</template>
