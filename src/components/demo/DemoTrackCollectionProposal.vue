<script setup>
import { computed, shallowRef, watch } from 'vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiSelect from '../ui/UiSelect.vue';
import DemoTrackCollectionTable from './DemoTrackCollectionTable.vue';
import {
  DEMO_TRACK_COLLECTION_KINDS,
  demoTrackCollectionColumns,
  demoTrackCollectionProfile,
  normalizeDemoTrackCollectionPreferences,
  normalizeDemoTrackCollectionSort,
  projectDemoTrackCollectionEntries,
} from './demoTrackCollectionProfiles.js';

defineProps({
  sections: { type: Array, default: () => [] },
});

const PROFILE_OPTIONS = Object.freeze(
  DEMO_TRACK_COLLECTION_KINDS.map((kind) => ({
    id: kind,
    label: demoTrackCollectionProfile(kind).label,
  })),
);
const VIEWPORT_OPTIONS = Object.freeze([
  { id: 'wide', label: 'Wide' },
  { id: 'medium', label: 'Medium' },
  { id: 'narrow', label: 'Narrow' },
  { id: 'minimum', label: 'Minimum' },
]);
const STATE_OPTIONS = Object.freeze([
  { value: 'default', label: 'Default' },
  { value: 'selected', label: 'Selected' },
  { value: 'current', label: 'Current' },
  { value: 'selected-current', label: 'Selected＋Current' },
  { value: 'dragging', label: 'Dragging' },
  { value: 'drop-before', label: 'Drop 前' },
  { value: 'drop-after', label: 'Drop 後' },
  { value: 'interactive', label: '互動結果', disabled: true },
]);
const BASE_ENTRIES = Object.freeze([
  Object.freeze({
    track: Object.freeze({
      id: 'demo-track-1',
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    }),
    addedAtLabel: '2026/10/12',
    albumTitle: 'THE BOOK',
    importedAt: '2026-10-04T12:00:00.000Z',
    releaseYear: 2020,
    discNumber: 1,
    trackNumber: 1,
    playCount: 1234,
    separationReady: true,
    favorite: true,
  }),
  Object.freeze({
    track: Object.freeze({
      id: 'demo-track-2',
      title: '刻在我心底的名字',
      artist: '盧廣仲',
      duration: 320,
    }),
    addedAtLabel: '2026/10/10',
    albumTitle: '刻在我心底的名字 電影原聲帶',
    importedAt: '2026-09-28T12:00:00.000Z',
    releaseYear: 2021,
    discNumber: 1,
    trackNumber: 2,
    playCount: 86,
    separationReady: true,
  }),
  Object.freeze({
    track: Object.freeze({
      id: 'demo-track-3',
      title:
        '夏夜裡的多語版本／SummerLiveSessionFinalMixWithoutConvenientBreaks.wav',
      artist: '本機演出者／アーティスト／아티스트',
      duration: 245,
    }),
    addedAtLabel: '2026/10/08',
    albumTitle: '現場錄音集',
    importedAt: '2026-09-20T12:00:00.000Z',
    releaseYear: 2025,
    discNumber: 2,
    trackNumber: 1,
    playCount: 7,
  }),
  Object.freeze({
    track: Object.freeze({
      id: 'demo-track-4',
      title: '缺少藝人、時長與專輯歸屬的本機單曲',
      artist: '',
      duration: null,
    }),
    addedAtLabel: '2026/10/03',
    albumTitle: '',
    importedAt: '2026-09-12T12:00:00.000Z',
    releaseYear: null,
    discNumber: null,
    trackNumber: null,
    playCount: 0,
  }),
]);

const activeKind = shallowRef('library-all');
const viewport = shallowRef('wide');
const typeScale = shallowRef(false);
const statePreset = shallowRef('selected-current');
const playlistTrackReorderPreference = shallowRef(true);
const orderedEntries = shallowRef([...BASE_ENTRIES]);
const selectedTrackId = shallowRef('demo-track-1');
const currentTrackId = shallowRef('demo-track-1');
const playingTrackId = shallowRef('demo-track-1');
const sort = shallowRef({ key: null, direction: 'asc' });
const draggingTrackId = shallowRef('');
const dropTargetTrackId = shallowRef('');
const dropPosition = shallowRef('');
const operationFeedback = shallowRef('尚未操作');
const columnPreferencesByKind = shallowRef(
  Object.fromEntries(
    DEMO_TRACK_COLLECTION_KINDS.map((kind) => [
      kind,
      normalizeDemoTrackCollectionPreferences(kind),
    ]),
  ),
);

const activeProfile = computed(() =>
  demoTrackCollectionProfile(activeKind.value),
);
const activeColumnPreferences = computed(
  () => columnPreferencesByKind.value[activeKind.value],
);
const effectiveTrackRowSort = computed(() =>
  normalizeDemoTrackCollectionSort(activeKind.value, sort.value),
);
const stateOptions = computed(() =>
  STATE_OPTIONS.map((option) => ({
    ...option,
    disabled:
      option.disabled ||
      (['dragging', 'drop-before', 'drop-after'].includes(option.value) &&
        !activeProfile.value.canReorderPlaylistTracks),
  })),
);
const canReorderPlaylistTracks = computed(
  () =>
    activeProfile.value.canReorderPlaylistTracks &&
    playlistTrackReorderPreference.value &&
    effectiveTrackRowSort.value.key === null,
);
const visibleEntries = computed(() => {
  const projected = projectDemoTrackCollectionEntries(
    orderedEntries.value,
    activeKind.value,
  );
  const { key, direction } = effectiveTrackRowSort.value;
  const sorted = key
    ? [...projected].sort((left, right) => {
        let leftValue;
        let rightValue;
        if (key === 'duration') {
          leftValue = Number(left.track.duration) || 0;
          rightValue = Number(right.track.duration) || 0;
        } else if (key === 'album') {
          leftValue = left.releaseText;
          rightValue = right.releaseText;
        } else if (key === 'addedAt') {
          leftValue = left.membershipText;
          rightValue = right.membershipText;
        } else if (key === 'playCount') {
          leftValue = left.playCount;
          rightValue = right.playCount;
        } else if (key === 'releaseYear') {
          leftValue = Number(left.releaseYearText) || 0;
          rightValue = Number(right.releaseYearText) || 0;
        } else if (key === 'importedAt') {
          leftValue = left.importedText;
          rightValue = right.importedText;
        } else {
          leftValue = left.track.title;
          rightValue = right.track.title;
        }
        const order =
          key === 'playCount' || key === 'releaseYear' || key === 'duration'
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue), 'zh-Hant', {
                numeric: true,
              });
        return direction === 'desc' ? -order : order;
      })
    : projected;
  return projectDemoTrackCollectionEntries(
    sorted.map((entry, visibleIndex) => ({ ...entry, visibleIndex })),
    activeKind.value,
  );
});

watch(activeKind, (kind) => {
  sort.value = { key: null, direction: 'asc' };
  applyStatePreset('selected-current', false);
  reportOperation(`切換至${demoTrackCollectionProfile(kind).label}`);
});

function reportOperation(action) {
  operationFeedback.value = action;
}

function updateColumnPreferences(preferences) {
  const normalized = normalizeDemoTrackCollectionPreferences(
    activeKind.value,
    preferences,
  );
  columnPreferencesByKind.value = {
    ...columnPreferencesByKind.value,
    [activeKind.value]: normalized,
  };
  const visibleSortKeys = new Set(
    demoTrackCollectionColumns(activeKind.value, normalized)
      .map((column) => column.sortKey)
      .filter(Boolean),
  );
  if (sort.value.key && !visibleSortKeys.has(sort.value.key)) {
    sort.value = { key: null, direction: 'asc' };
  }
  reportOperation('更新欄位顯示');
}

function toggleSort(key) {
  if (!activeProfile.value.canSortTrackRows) return;
  const current = sort.value;
  if (current.key !== key) {
    sort.value = { key, direction: 'asc' };
  } else if (current.direction === 'asc') {
    sort.value = { key, direction: 'desc' };
  } else {
    sort.value = { key: null, direction: 'asc' };
  }
  reportOperation(
    sort.value.key
      ? `${key} ${sort.value.direction === 'asc' ? '升冪' : '降冪'}排序`
      : '回到集合原始順序',
  );
}

function selectTrack(track) {
  selectedTrackId.value = track.id;
  statePreset.value = 'interactive';
  reportOperation(`選取「${track.title}」`);
}

function activateTrack(track) {
  currentTrackId.value = track.id;
  playingTrackId.value = track.id;
  statePreset.value = 'interactive';
  reportOperation(`播放「${track.title}」`);
}

function togglePlayback(track) {
  if (currentTrackId.value === track.id) {
    playingTrackId.value = playingTrackId.value === track.id ? '' : track.id;
  } else {
    currentTrackId.value = track.id;
    playingTrackId.value = track.id;
  }
  statePreset.value = 'interactive';
  reportOperation(
    `${playingTrackId.value === track.id ? '播放' : '暫停'}「${track.title}」`,
  );
}

function applyStatePreset(preset, announce = true) {
  statePreset.value = preset;
  selectedTrackId.value = '';
  currentTrackId.value = '';
  playingTrackId.value = '';
  clearDragState();

  if (preset === 'selected') {
    selectedTrackId.value = 'demo-track-1';
  } else if (preset === 'current') {
    currentTrackId.value = 'demo-track-1';
    playingTrackId.value = 'demo-track-1';
  } else if (preset === 'selected-current') {
    selectedTrackId.value = 'demo-track-1';
    currentTrackId.value = 'demo-track-1';
    playingTrackId.value = 'demo-track-1';
  } else if (preset === 'dragging') {
    if (!activeProfile.value.canReorderPlaylistTracks) return;
    draggingTrackId.value = 'demo-track-1';
  } else if (preset === 'drop-before' || preset === 'drop-after') {
    if (!activeProfile.value.canReorderPlaylistTracks) return;
    draggingTrackId.value = 'demo-track-1';
    dropTargetTrackId.value = 'demo-track-2';
    dropPosition.value = preset === 'drop-before' ? 'before' : 'after';
  }

  if (announce) reportOperation(`狀態樣本：${preset}`);
}

function navigateAlbum(track) {
  reportOperation(`前往「${track.title}」的專輯`);
}

function navigateArtist(track) {
  reportOperation(`前往藝人「${track.artist}」`);
}

function openMenu(track) {
  reportOperation(`開啟「${track.title}」操作選單`);
}

function moveTrack(trackId, offset) {
  if (!canReorderPlaylistTracks.value) return;
  const currentIndex = orderedEntries.value.findIndex(
    (entry) => entry.track.id === trackId,
  );
  const targetIndex = currentIndex + offset;
  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= orderedEntries.value.length
  ) {
    return;
  }
  const next = [...orderedEntries.value];
  const [entry] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, entry);
  orderedEntries.value = next;
  reportOperation(`移動「${entry.track.title}」`);
}

function startDrag(track, event) {
  if (!canReorderPlaylistTracks.value) {
    event.preventDefault();
    return;
  }
  draggingTrackId.value = track.id;
  event.dataTransfer?.setData('text/plain', track.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  reportOperation(`開始拖曳「${track.title}」`);
}

function updateDropTarget(track, event) {
  if (!canReorderPlaylistTracks.value || !draggingTrackId.value) return;
  event.preventDefault();
  const bounds = event.currentTarget?.getBoundingClientRect?.();
  const position =
    bounds && event.clientY > bounds.top + bounds.height / 2
      ? 'after'
      : 'before';
  dropTargetTrackId.value = track.id;
  dropPosition.value = position;
}

function leaveDropTarget(track) {
  if (dropTargetTrackId.value !== track.id) return;
  dropTargetTrackId.value = '';
  dropPosition.value = '';
}

function dropTrack(track, event) {
  if (!canReorderPlaylistTracks.value || !draggingTrackId.value) return;
  event.preventDefault();
  const draggedId = draggingTrackId.value;
  const sourceIndex = orderedEntries.value.findIndex(
    (entry) => entry.track.id === draggedId,
  );
  const targetIndex = orderedEntries.value.findIndex(
    (entry) => entry.track.id === track.id,
  );
  if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
    const next = [...orderedEntries.value];
    const [entry] = next.splice(sourceIndex, 1);
    const targetAfterRemoval = next.findIndex(
      (candidate) => candidate.track.id === track.id,
    );
    const insertIndex =
      dropPosition.value === 'after'
        ? targetAfterRemoval + 1
        : targetAfterRemoval;
    next.splice(insertIndex, 0, entry);
    orderedEntries.value = next;
    reportOperation(`拖曳「${entry.track.title}」完成`);
  }
  clearDragState();
}

function clearDragState() {
  draggingTrackId.value = '';
  dropTargetTrackId.value = '';
  dropPosition.value = '';
}
</script>

<template>
  <div class="demo-track-collection-proposal">
    <section
      class="demo-track-collection-proposal__review"
      aria-labelledby="demo-track-collection-review-title"
    >
      <header class="demo-track-collection-proposal__intro">
        <div class="demo-track-collection-proposal__intro-copy">
          <h3 id="demo-track-collection-review-title">檢視與互動</h3>
          <p>比較各檢視的欄位、排序與曲目狀態。</p>
        </div>

        <div class="demo-track-collection-proposal__controls">
          <div class="demo-track-collection-proposal__control-group">
            <span class="demo-track-collection-proposal__control-label">
              集合性質
            </span>
            <UiSegmentedControl
              :items="PROFILE_OPTIONS"
              :model-value="activeKind"
              aria-label="集合性質"
              @update:model-value="activeKind = $event"
            />
          </div>
          <div class="demo-track-collection-proposal__control-group">
            <span class="demo-track-collection-proposal__control-label">
              狀態樣本
            </span>
            <UiSelect
              id="demo-track-collection-state"
              label="狀態樣本"
              label-hidden
              :options="stateOptions"
              :model-value="statePreset"
              @update:model-value="applyStatePreset"
            />
          </div>
          <div class="demo-track-collection-proposal__control-group">
            <span class="demo-track-collection-proposal__control-label">
              檢視寬度
            </span>
            <UiSegmentedControl
              :items="VIEWPORT_OPTIONS"
              :model-value="viewport"
              aria-label="檢視寬度"
              @update:model-value="viewport = $event"
            />
          </div>
          <UiCheckbox
            id="demo-track-collection-type-scale"
            label="125% 字級壓力"
            :model-value="typeScale"
            @update:model-value="typeScale = $event"
          />
          <UiCheckbox
            v-if="activeKind === 'playlist'"
            id="demo-track-collection-reorder"
            label="播放清單曲目順序可調整"
            :model-value="playlistTrackReorderPreference"
            @update:model-value="playlistTrackReorderPreference = $event"
          />
        </div>
      </header>

      <div class="demo-track-collection-proposal__profile-note">
        <span>{{ activeProfile.description }}</span>
        <span v-if="activeKind === 'playlist' && !canReorderPlaylistTracks">
          排序或關閉播放清單曲目順序調整時，整列拖曳暫停。
        </span>
        <span
          v-if="
            activeProfile.semanticColumns.some(({ role }) => role === 'usage')
          "
        >
          播放次數為 Utawakui 內的示意值。
        </span>
        <span>點選播放中曲目，查看選取與播放狀態。</span>
      </div>

      <div
        class="demo-track-collection-proposal__viewport"
        :class="[
          `demo-track-collection-proposal__viewport--${viewport}`,
          {
            'demo-track-collection-proposal__viewport--type-scale': typeScale,
          },
        ]"
        :data-demo-viewport="viewport"
      >
        <DemoTrackCollectionTable
          :entries="visibleEntries"
          :collection-kind="activeKind"
          :column-preferences="activeColumnPreferences"
          :sort="effectiveTrackRowSort"
          :can-reorder-playlist-tracks="canReorderPlaylistTracks"
          :selected-track-id="selectedTrackId"
          :current-track-id="currentTrackId"
          :playing-track-id="playingTrackId"
          :dragging-track-id="draggingTrackId"
          :drop-target-track-id="dropTargetTrackId"
          :drop-position="dropPosition"
          @toggle-sort="toggleSort"
          @update-column-preferences="updateColumnPreferences"
          @select-track="selectTrack"
          @activate-track="activateTrack"
          @toggle-playback="togglePlayback"
          @navigate-album="navigateAlbum"
          @navigate-artist="navigateArtist"
          @open-menu="openMenu"
          @move-track="moveTrack"
          @drag-start="startDrag"
          @drag-over="updateDropTarget"
          @drag-leave="leaveDropTarget"
          @drop="dropTrack"
          @drag-end="clearDragState"
        />
      </div>

      <p class="demo-track-collection-proposal__feedback" aria-live="polite">
        <span>最近操作</span>
        {{ operationFeedback }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.demo-track-collection-proposal__review,
.demo-track-collection-proposal__intro,
.demo-track-collection-proposal__intro-copy,
.demo-track-collection-proposal__controls,
.demo-track-collection-proposal__control-group {
  min-width: 0;
  display: grid;
}

.demo-track-collection-proposal {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-track-collection-proposal__review {
  gap: var(--ui-space-5);
  padding-block: var(--ui-space-4) var(--ui-space-6);
}

.demo-track-collection-proposal__intro {
  grid-template-columns: minmax(12rem, 0.6fr) minmax(18rem, 1fr);
  align-items: start;
  gap: var(--ui-space-6);
}

.demo-track-collection-proposal__intro-copy {
  gap: var(--ui-space-2);
}

.demo-track-collection-proposal__intro-copy h3,
.demo-track-collection-proposal__intro-copy p,
.demo-track-collection-proposal__feedback {
  margin: 0;
}

.demo-track-collection-proposal__intro-copy h3 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-track-collection-proposal__intro-copy p,
.demo-track-collection-proposal__profile-note,
.demo-track-collection-proposal__feedback {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-track-collection-proposal__controls {
  gap: var(--ui-space-3);
}

.demo-track-collection-proposal__control-group {
  grid-template-columns: 6rem minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-track-collection-proposal__control-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.demo-track-collection-proposal__profile-note {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-4);
  padding-block-end: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-track-collection-proposal__viewport {
  min-width: 0;
  width: 100%;
  justify-self: start;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface);
}

.demo-track-collection-proposal__viewport--medium {
  width: min(100%, 32rem);
}

.demo-track-collection-proposal__viewport--narrow {
  width: min(100%, 26rem);
}

.demo-track-collection-proposal__viewport--minimum {
  width: min(100%, 21rem);
}

.demo-track-collection-proposal__viewport--type-scale {
  --ui-type-body-compact-size: calc(var(--ui-font-size-sm) * 1.25);
  --ui-type-label-size: calc(var(--ui-font-size-sm) * 1.25);
  --ui-type-caption-size: calc(var(--ui-font-size-sm) * 1.25);
}

.demo-track-collection-proposal__feedback {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.demo-track-collection-proposal__feedback span {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

@container app-folder-layout (max-width: 58rem) {
  .demo-track-collection-proposal__intro {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-4);
  }
}

@container app-folder-layout (max-width: 36rem) {
  .demo-track-collection-proposal__control-group {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }
}
</style>
