<script setup>
import { computed, shallowRef, watch } from 'vue';
import { RotateCcw } from '../../icons/index.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import {
  nextPlaylistSort,
  sortPlaylistEntries,
} from '../../utils/playlistSort.js';
import UiButton from '../ui/UiButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import StudioLibraryDossierHeader from './StudioLibraryDossierHeader.vue';
import StudioLibraryTrackTable from './StudioLibraryTrackTable.vue';

const props = defineProps({
  collectionType: { type: String, required: true },
  kindLabel: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  description: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  canCollage: { type: Boolean, default: true },
  currentTrackId: { type: String, default: null },
  selectedTrackId: { type: String, default: null },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
});

const emit = defineEmits(['selectTrack', 'activateTrack', 'retry']);
const searchQuery = shallowRef('');
const draftTracks = shallowRef([...props.tracks]);
const playlistSort = shallowRef({ key: null, direction: 'asc' });

watch(
  () => props.tracks,
  (tracks) => {
    draftTracks.value = [...tracks];
    playlistSort.value = { key: null, direction: 'asc' };
    clearDragState();
  },
);

const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLocaleLowerCase(),
);
const orderedTracks = computed(() => {
  const entries = draftTracks.value.map((track, playlistIndex) => ({
    track,
    playlistIndex,
  }));
  return sortPlaylistEntries(entries, playlistSort.value).map(
    ({ track }) => track,
  );
});
const visibleTracks = computed(() => {
  const query = normalizedSearchQuery.value;
  if (!query) return orderedTracks.value;
  return orderedTracks.value.filter((track) =>
    [track.title, track.artist, track.album, track.filename, track.id].some(
      (value) =>
        String(value ?? '')
          .toLocaleLowerCase()
          .includes(query),
    ),
  );
});
const emptyCollectionName = computed(() => {
  if (props.collectionType === 'album') return '專輯';
  if (props.collectionType === 'playlist') return '播放清單';
  return '曲庫';
});
const reorderAvailable = computed(
  () =>
    props.collectionType === 'playlist' &&
    props.tracks.length > 1 &&
    !props.loading &&
    !props.errorMessage,
);
const canReorder = computed(
  () =>
    reorderAvailable.value &&
    playlistSort.value.key === null &&
    normalizedSearchQuery.value.length === 0,
);
const isOrderDirty = computed(
  () =>
    draftTracks.value.map(({ id }) => id).join('\0') !==
    props.tracks.map(({ id }) => id).join('\0'),
);

function toggleSort(key) {
  playlistSort.value = nextPlaylistSort(playlistSort.value, key);
  clearDragState();
}

function resetDraftOrder() {
  draftTracks.value = [...props.tracks];
  clearDragState();
}

function moveTrack(trackId, delta) {
  if (!canReorder.value) return;
  const index = draftTracks.value.findIndex(({ id }) => id === trackId);
  const targetIndex = index + delta;
  if (index < 0 || targetIndex < 0 || targetIndex >= draftTracks.value.length) {
    return;
  }

  const next = [...draftTracks.value];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  draftTracks.value = next;
}

function activateTrack(track) {
  emit('activateTrack', track, [...visibleTracks.value]);
}

function reorderTrack(draggedId, targetId, position) {
  if (!canReorder.value || !draggedId || draggedId === targetId) return;
  const withoutDragged = draftTracks.value.filter(({ id }) => id !== draggedId);
  if (withoutDragged.length === draftTracks.value.length) return;

  const targetIndex = withoutDragged.findIndex(({ id }) => id === targetId);
  if (targetIndex < 0) return;
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  const draggedTrack = draftTracks.value.find(({ id }) => id === draggedId);
  withoutDragged.splice(insertIndex, 0, draggedTrack);
  draftTracks.value = withoutDragged;
}

const {
  draggingId,
  dropTargetId,
  dropPosition,
  startDrag,
  updateDropTarget,
  leaveDropTarget,
  drop,
  clearDragState,
} = useDragReorder({
  onReorder: reorderTrack,
  canDrag: () => canReorder.value,
});
</script>

<template>
  <section class="studio-dossier" aria-labelledby="studio-library-title">
    <StudioLibraryDossierHeader
      :kind-label="kindLabel"
      :title="title"
      :summary="summary"
      :description="description"
      :tracks="draftTracks"
      :cover-url="coverUrl"
      :can-collage="canCollage"
    />

    <div class="studio-dossier__body">
      <section class="studio-dossier__document" :aria-label="`${title}內容`">
        <div class="studio-dossier__toolbar">
          <UiSearchBox
            v-model="searchQuery"
            label="搜尋目前集合"
            placeholder="搜尋曲目或演出者"
          />
          <div
            v-if="collectionType === 'playlist' && isOrderDirty"
            class="studio-dossier__order-actions"
          >
            <UiButton :icon="RotateCcw" @click="resetDraftOrder">
              還原順序
            </UiButton>
          </div>
        </div>

        <div v-if="loading" class="studio-dossier__state" role="status">
          正在讀取本機曲庫…
        </div>
        <div
          v-else-if="errorMessage"
          class="studio-dossier__state"
          role="alert"
        >
          <strong>曲庫讀取未完成</strong>
          <span>{{ errorMessage }}</span>
          <UiButton
            class="studio-dossier__retry"
            variant="accent"
            @click="emit('retry')"
          >
            重新整理
          </UiButton>
        </div>
        <div
          v-else-if="tracks.length === 0"
          class="studio-dossier__state"
          role="status"
        >
          <strong>這個{{ emptyCollectionName }}還沒有曲目</strong>
          <span>可先從 Import 匯入，或在既有 Setlist 中加入曲目。</span>
        </div>
        <div
          v-else-if="visibleTracks.length === 0"
          class="studio-dossier__state"
          role="status"
        >
          <strong>找不到符合條件的曲目</strong>
          <span>清除搜尋，或改用曲名、演出者與檔案名稱查找。</span>
        </div>
        <StudioLibraryTrackTable
          v-else
          :title="title"
          :tracks="visibleTracks"
          :sort="playlistSort"
          :current-track-id="currentTrackId"
          :selected-track-id="selectedTrackId"
          :show-artwork="collectionType !== 'album'"
          :reorder-available="reorderAvailable"
          :can-reorder="canReorder"
          :dragging-track-id="draggingId"
          :drop-target-track-id="dropTargetId"
          :drop-position="dropPosition"
          @select-track="emit('selectTrack', $event)"
          @activate-track="activateTrack"
          @toggle-sort="toggleSort"
          @move-track="moveTrack"
          @track-drag-start="startDrag"
          @track-drag-over="updateDropTarget"
          @track-drag-leave="leaveDropTarget"
          @track-drop="drop"
          @track-drag-end="clearDragState"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.studio-dossier {
  container: dossier / inline-size;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: var(--ui-folder-perimeter);
  overflow: hidden;
  color: var(--ui-color-text);
  background: var(--ui-color-folder-primary);
  border-radius: var(--ui-radius-sm);
}

.studio-dossier__body {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: var(--ui-color-surface);
}

.studio-dossier__document {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  flex: 1;
  padding: var(--ui-panel-inset);
  overflow: hidden;
}

.studio-dossier__toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}

.studio-dossier__order-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.studio-dossier__order-actions :deep(.ui-btn) {
  -webkit-user-select: none;
  user-select: none;
}

.studio-dossier__toolbar :deep(.ui-search-box) {
  width: min(24rem, 100%);
}

.studio-dossier__toolbar :deep(.ui-search-box__input) {
  -webkit-user-select: text;
  user-select: text;
}

.studio-dossier__state {
  display: flex;
  min-height: 10rem;
  align-items: center;
  justify-content: center;
  flex: 1;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  text-align: center;
}

.studio-dossier__state strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.studio-dossier__state span {
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.studio-dossier__state strong,
.studio-dossier__state span {
  -webkit-user-select: text;
  user-select: text;
}

.studio-dossier__retry {
  margin-top: var(--ui-space-2);
  -webkit-user-select: none;
  user-select: none;
}

@container dossier (max-width: 45rem) {
  .studio-dossier__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .studio-dossier__toolbar :deep(.ui-search-box) {
    width: 100%;
  }

  .studio-dossier__order-actions {
    flex-wrap: wrap;
  }
}
</style>
