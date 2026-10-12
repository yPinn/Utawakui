<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import { ArrowLeft, ListPlus, Plus, Trash2 } from '../../icons/index.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { playlistDisplayName } from '../../utils/playlistMenu.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import PerformanceSessionManualItemForm from './PerformanceSessionManualItemForm.vue';
import PerformanceSessionPlanEditor from './PerformanceSessionPlanEditor.vue';
import PerformanceSessionPlanList from './PerformanceSessionPlanList.vue';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  showReturn: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const { confirm: confirmAction } = useAppConfirmation();
const {
  state,
  selectedItem,
  initialize,
  appendLibraryTrack,
  appendManualItem,
  saveDisplay,
  relinkItem,
  moveItem,
  duplicateItem,
  removeItem,
  selectItem,
  clear,
  replaceFromCollection,
} = usePerformanceSessionPlan();
const { selectedPlaylist } = usePlaylists();

const librarySearchQuery = shallowRef('');
const mobilePane = shallowRef('list');
const creatingManualItem = shallowRef(false);
const libraryAddValidationError = shallowRef(null);
const hasItems = computed(() => state.plan.summary.total > 0);
const normalizedLibrarySearch = computed(() =>
  librarySearchQuery.value.trim().toLocaleLowerCase(),
);
const isSearching = computed(() => normalizedLibrarySearch.value.length > 0);
const filteredTracks = computed(() => {
  const query = normalizedLibrarySearch.value;
  if (!query) return [];
  return props.tracks
    .filter((track) =>
      [track.title, track.artist, track.id].some((value) =>
        String(value ?? '')
          .toLocaleLowerCase()
          .includes(query),
      ),
    )
    .slice(0, 50);
});
const reviewValidationError = computed(() => {
  const error = state.validationError;
  if (!error || libraryAddValidationError.value) return null;
  if (error.field) return error;
  return [
    'SESSION_PLAN_ITEM_NOT_FOUND',
    'SESSION_PLAN_STALE_REVISION',
  ].includes(error.code)
    ? error
    : null;
});
const workspaceValidationError = computed(() =>
  reviewValidationError.value || libraryAddValidationError.value
    ? null
    : state.validationError,
);
const sourceLabel = computed(() => state.plan.source?.name ?? '臨時場次');
const selectedCollectionLabel = computed(() =>
  playlistDisplayName(selectedPlaylist.value),
);
const selectedCollectionKindLabel = computed(() =>
  selectedPlaylist.value?.kind === 'album' ? '專輯' : '清單',
);
const collectionActionLabel = computed(() =>
  selectedPlaylist.value?.kind === 'album' ? '從專輯建立' : '從清單建立',
);

onMounted(initialize);

async function addLibraryTrack(trackId) {
  if (!(await appendLibraryTrack(trackId))) {
    libraryAddValidationError.value = state.validationError;
    return;
  }
  libraryAddValidationError.value = null;
  librarySearchQuery.value = '';
  creatingManualItem.value = false;
  mobilePane.value = 'review';
}

function openManualItem() {
  libraryAddValidationError.value = null;
  creatingManualItem.value = true;
  mobilePane.value = 'review';
}

async function createManualItem(fields) {
  if (!(await appendManualItem(fields))) return;
  creatingManualItem.value = false;
  mobilePane.value = 'review';
}

async function selectForReview(itemId) {
  if (!(await selectItem(itemId))) return;
  libraryAddValidationError.value = null;
  creatingManualItem.value = false;
  mobilePane.value = 'review';
}

function saveSelectedDisplay(fields) {
  if (!selectedItem.value) return;
  saveDisplay(selectedItem.value.itemId, fields);
}

function relinkSelected(fields) {
  if (!selectedItem.value) return;
  relinkItem(selectedItem.value.itemId, fields);
}

async function confirmRemoveItem(itemId) {
  const item = state.plan.items.find(
    (candidate) => candidate.itemId === itemId,
  );
  if (!item) return;
  const confirmed = await confirmAction({
    title: '從待唱移除這首歌？',
    message: `「${item.displayTitle}」會從這份場次安排移除。`,
    detail: '這不會刪除曲庫中的歌曲。',
    confirmLabel: '從待唱移除',
    intent: 'danger',
  });
  if (confirmed) removeItem(itemId);
}

async function clearDraft() {
  if (!hasItems.value) return;
  const confirmed = await confirmAction({
    title: '清除場次草稿？',
    message: '目前待唱安排中的所有項目會被清除。',
    detail: '這不會刪除曲庫歌曲或播放清單。',
    confirmLabel: '清除草稿',
    intent: 'danger',
  });
  if (confirmed) clear();
}

async function prepareSelectedCollection() {
  const collection = selectedPlaylist.value;
  if (!collection) return;

  await initialize();
  let replaceCurrent = hasItems.value;
  if (replaceCurrent) {
    replaceCurrent = await confirmAction({
      title: '取代待唱安排？',
      message: `「${selectedCollectionLabel.value}」會取代「${sourceLabel.value}」。`,
      detail: '目前待唱安排的手動調整會遺失。',
      confirmLabel: '取代安排',
      intent: 'danger',
    });
    if (!replaceCurrent) return;
  }

  let prepared = await replaceFromCollection(collection.id, replaceCurrent);
  if (
    !prepared &&
    !replaceCurrent &&
    state.validationError?.code === 'SESSION_PLAN_REPLACE_REQUIRED'
  ) {
    const confirmed = await confirmAction({
      title: '取代另一份待唱安排？',
      message: '目前已有另一份待唱安排。',
      detail: '取代後，原安排的手動調整會遺失。',
      confirmLabel: '取代安排',
      intent: 'danger',
    });
    if (confirmed) prepared = await replaceFromCollection(collection.id, true);
  }

  if (prepared) {
    librarySearchQuery.value = '';
    creatingManualItem.value = false;
    mobilePane.value = 'list';
  }
}
</script>

<template>
  <section
    class="performance-session-workspace"
    :class="{
      'performance-session-workspace--reviewing': mobilePane === 'review',
    }"
    aria-label="待唱安排"
  >
    <UiPageHeader
      class="performance-session-workspace__page-header"
      title="待唱安排"
    >
      <template #description>
        {{ sourceLabel }} · 只安排尚未開始的曲目。
      </template>
      <template #actions>
        <UiButton
          v-if="selectedPlaylist"
          :icon="ListPlus"
          :loading="state.isSaving"
          loading-label="建立中"
          :title="`以目前${selectedCollectionKindLabel}「${selectedCollectionLabel}」建立待唱安排`"
          @click="prepareSelectedCollection"
        >
          {{ collectionActionLabel }}
        </UiButton>
        <UiButton
          :icon="Trash2"
          intent="danger"
          :disabled="!hasItems || state.isSaving"
          @click="clearDraft"
        >
          清除
        </UiButton>
        <UiButton v-if="showReturn" :icon="ArrowLeft" @click="emit('close')">
          返回
        </UiButton>
      </template>
    </UiPageHeader>

    <div class="performance-session-workspace__summary" aria-label="待唱狀態">
      <UiChip tone="accent">{{ state.plan.summary.total }} 首</UiChip>
      <UiChip
        v-if="hasItems && state.plan.summary.needsAttention === 0"
        tone="success"
      >
        全部可演出
      </UiChip>
      <UiChip v-else-if="state.plan.summary.needsAttention" tone="warning">
        {{ state.plan.summary.needsAttention }} 首需處理
      </UiChip>
      <span
        v-if="state.isSaving"
        class="performance-session-workspace__saving"
        role="status"
      >
        儲存中…
      </span>
    </div>

    <UiNotice
      v-if="state.error"
      tone="danger"
      title="場次草稿未更新"
      :message="state.error"
      compact
    />
    <UiNotice
      v-else-if="workspaceValidationError"
      tone="warning"
      title="尚未完成"
      :message="workspaceValidationError.message"
      compact
    />

    <div class="performance-session-workspace__grid">
      <section
        class="performance-session-workspace__list-pane"
        aria-label="待唱清單"
      >
        <div class="performance-session-workspace__composer">
          <UiSearchBox
            v-model="librarySearchQuery"
            label="搜尋曲庫並加入待唱"
            placeholder="搜尋曲名或歌手…"
            :disabled="state.isSaving"
          />
          <UiButton
            :icon="Plus"
            variant="secondary"
            :disabled="state.isSaving"
            @click="openManualItem"
          >
            新增手動項目
          </UiButton>
        </div>

        <UiNotice
          v-if="libraryAddValidationError"
          tone="warning"
          title="無法加入這首歌曲"
          :message="libraryAddValidationError.message"
          compact
        />

        <UiScrollRegion
          v-if="isSearching"
          class="performance-session-workspace__list-scroll"
          aria-label="曲庫搜尋結果"
        >
          <ul
            v-if="filteredTracks.length"
            class="performance-session-workspace__search-results"
          >
            <UiTrackRow
              v-for="track in filteredTracks"
              :key="track.id"
              :track="track"
              interactive
              :action-label="`加入待唱：${track.title ?? track.id}`"
              @row-click="addLibraryTrack(track.id)"
            />
          </ul>
          <UiHint v-else padded center> 曲庫中沒有符合的歌曲。 </UiHint>
        </UiScrollRegion>

        <UiScrollRegion
          v-else-if="hasItems"
          class="performance-session-workspace__list-scroll"
          aria-label="待唱清單"
        >
          <PerformanceSessionPlanList
            :items="state.plan.items"
            :selected-item-id="state.plan.reviewCursorItemId"
            :saving="state.isSaving"
            @select="selectForReview"
            @move="moveItem"
            @duplicate="duplicateItem"
            @remove="confirmRemoveItem"
          />
        </UiScrollRegion>

        <UiHint v-else padded center>
          搜尋曲庫加入第一首待唱曲目；其他來源可用「新增手動項目」。
        </UiHint>
      </section>

      <section
        class="performance-session-workspace__review-pane"
        aria-label="待唱項目設定"
      >
        <UiButton
          class="performance-session-workspace__mobile-back"
          :icon="ArrowLeft"
          @click="mobilePane = 'list'"
        >
          返回待唱清單
        </UiButton>
        <PerformanceSessionManualItemForm
          v-if="creatingManualItem"
          :saving="state.isSaving"
          :validation-error="reviewValidationError"
          @cancel="creatingManualItem = false"
          @create="createManualItem"
        />
        <PerformanceSessionPlanEditor
          v-else
          :item="selectedItem"
          :tracks="tracks"
          :saving="state.isSaving"
          :validation-error="reviewValidationError"
          @save-display="saveSelectedDisplay"
          @relink="relinkSelected"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.performance-session-workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.performance-session-workspace__page-header {
  margin-block-end: var(--ui-folder-section-gap);
}

.performance-session-workspace__summary {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-3);
}

.performance-session-workspace__saving {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.performance-session-workspace__grid {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(360px, 1.2fr) minmax(320px, 0.8fr);
  min-height: 0;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.performance-session-workspace__list-pane,
.performance-session-workspace__review-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.performance-session-workspace__list-pane {
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
}

.performance-session-workspace__composer {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ui-space-2);
  align-items: center;
  padding-bottom: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.performance-session-workspace__list-scroll {
  flex: 1;
  min-height: 0;
}

.performance-session-workspace__search-results {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0 var(--ui-scrollbar-lane-size) 0 0;
  list-style: none;
}

.performance-session-workspace__mobile-back {
  display: none;
  align-self: flex-start;
  margin: var(--ui-space-3) var(--ui-space-3) 0;
}

@media (max-width: 780px) {
  .performance-session-workspace__grid {
    display: block;
  }

  .performance-session-workspace__list-pane,
  .performance-session-workspace__review-pane {
    height: 100%;
  }

  .performance-session-workspace__list-pane {
    border-inline-end: 0;
  }

  .performance-session-workspace__review-pane {
    display: none;
  }

  .performance-session-workspace--reviewing
    .performance-session-workspace__list-pane {
    display: none;
  }

  .performance-session-workspace--reviewing
    .performance-session-workspace__review-pane,
  .performance-session-workspace__mobile-back {
    display: flex;
  }

  .performance-session-workspace__composer {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
