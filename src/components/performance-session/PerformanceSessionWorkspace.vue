<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import { ArrowLeft, ListPlus, Plus, Trash2 } from '../../icons/index.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import { useAppRightDock } from '../../composables/useAppRightDock.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import { playlistDisplayName } from '../../utils/playlistMenu.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiModal from '../ui/UiModal.vue';
import PerformanceSessionBoard from './PerformanceSessionBoard.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
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
const editorOpen = shallowRef(false);
const playback = usePerformanceSessionPlayback();
const dock = useAppRightDock();
const arrangementDockVisible = computed(
  () =>
    dock.isExpanded.value &&
    dock.topSurface.value === 'queue' &&
    dock.queueVariant.value === 'arrangement',
);
const { state: playerState, toggle: togglePlayback } = usePlayer();
const currentConfirmed = computed(() =>
  state.plan.items.some(
    (item) =>
      item.itemId === playback.currentItem.value?.itemId &&
      item.progress === 'playing',
  ),
);
const pendingAttention = computed(
  () => playback.pendingItems.value.filter((item) => !item.ready).length,
);
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
  if (!editorOpen.value) return null;
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
const sourceLabel = computed(() => state.plan.source?.name ?? '播放安排');
const sourceLang = computed(() =>
  contentLangAttribute(state.plan.source?.name),
);
const selectedCollectionLabel = computed(() =>
  playlistDisplayName(selectedPlaylist.value),
);
const selectedCollectionKindLabel = computed(() =>
  selectedPlaylist.value?.kind === 'album' ? '專輯' : '清單',
);
const collectionActionLabel = computed(() =>
  hasItems.value
    ? '取代安排'
    : selectedPlaylist.value?.kind === 'album'
      ? '從專輯建立'
      : '從清單建立',
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
  editorOpen.value = false;
}

function openManualItem() {
  libraryAddValidationError.value = null;
  creatingManualItem.value = true;
  editorOpen.value = true;
}

async function createManualItem(fields) {
  if (!(await appendManualItem(fields))) return;
  creatingManualItem.value = false;
  editorOpen.value = false;
}

async function selectForReview(itemId) {
  if (!(await selectItem(itemId))) return;
  libraryAddValidationError.value = null;
  creatingManualItem.value = false;
  editorOpen.value = true;
}

async function saveSelectedDisplay(fields) {
  if (!selectedItem.value) return;
  if (await saveDisplay(selectedItem.value.itemId, fields))
    editorOpen.value = false;
}

async function relinkSelected(fields) {
  if (!selectedItem.value) return;
  if (await relinkItem(selectedItem.value.itemId, fields))
    editorOpen.value = false;
}

async function confirmRemoveItem(itemId) {
  const item = state.plan.items.find(
    (candidate) => candidate.itemId === itemId,
  );
  if (!item) return;
  const confirmed = await confirmAction({
    title:
      item.progress === 'queued' ? '從待播移除歌曲？' : '移除這筆播放紀錄？',
    subject: item.displayTitle,
    message: '只會移出這份安排，曲庫歌曲會保留。',
    confirmLabel: '移除歌曲',
    intent: 'danger',
  });
  if (confirmed) removeItem(itemId);
}

async function clearDraft() {
  if (!hasItems.value) return;
  const confirmed = await confirmAction({
    title: '清除播放安排？',
    message:
      '待播、已完成紀錄與手動調整都會清除；安排中正在播放的曲目也會停止。',
    detail: '曲庫歌曲與播放清單會保留。',
    confirmLabel: '清除安排',
    intent: 'danger',
  });
  if (confirmed && (await playback.stop())) clear();
}

async function prepareSelectedCollection() {
  const collection = selectedPlaylist.value;
  if (!collection) return;

  await initialize();
  let replaceCurrent = hasItems.value;
  if (replaceCurrent) {
    replaceCurrent = await confirmAction({
      title: '取代待播安排？',
      subject: selectedCollectionLabel.value,
      meta: `目前：${sourceLabel.value}`,
      message: '現有安排與手動調整會被取代。',
      confirmLabel: '取代安排',
      intent: 'danger',
    });
    if (!replaceCurrent) return;
  }

  if (replaceCurrent && !(await playback.stop())) return;
  let prepared = await replaceFromCollection(collection.id, replaceCurrent);
  if (
    !prepared &&
    !replaceCurrent &&
    state.validationError?.code === 'SESSION_PLAN_REPLACE_REQUIRED'
  ) {
    const confirmed = await confirmAction({
      title: '取代待播安排？',
      message: '目前已有其他安排，取代後手動調整會遺失。',
      confirmLabel: '取代安排',
      intent: 'danger',
    });
    if (confirmed && (await playback.stop()))
      prepared = await replaceFromCollection(collection.id, true);
  }

  if (prepared) {
    librarySearchQuery.value = '';
    creatingManualItem.value = false;
    editorOpen.value = false;
  }
}
</script>

<template>
  <section class="performance-session-workspace" aria-label="播放安排">
    <AppFolderWorkspaceToolbar
      class="performance-session-workspace__toolbar"
      :context="sourceLabel"
      :context-lang="sourceLang"
      meta="安排曲目，隨時播放"
    >
      <template #status>
        <UiChip v-if="pendingAttention" tone="warning"
          >{{ pendingAttention }} 首需處理</UiChip
        >
        <span
          v-if="state.isSaving"
          class="performance-session-workspace__saving"
          role="status"
          >儲存中…</span
        >
      </template>
      <template #actions>
        <UiButton
          :aria-pressed="arrangementDockVisible"
          :aria-label="
            arrangementDockVisible ? '收合播放安排側欄' : '顯示播放安排側欄'
          "
          @click="
            arrangementDockVisible
              ? dock.setExpanded(false)
              : dock.showQueueVariant('arrangement')
          "
          >{{ arrangementDockVisible ? '收合側欄' : '顯示側欄' }}</UiButton
        >
        <UiButton
          v-if="selectedPlaylist"
          :icon="ListPlus"
          :intent="hasItems ? 'danger' : 'neutral'"
          :loading="state.isSaving"
          loading-label="建立中"
          :title="`以目前${selectedCollectionKindLabel}「${selectedCollectionLabel}」建立播放安排`"
          @click="prepareSelectedCollection"
          >{{ collectionActionLabel }}</UiButton
        >
        <UiButton
          :icon="Trash2"
          intent="danger"
          :disabled="!hasItems || state.isSaving || playback.state.busy"
          @click="clearDraft"
          >清除</UiButton
        >
        <UiButton v-if="showReturn" :icon="ArrowLeft" @click="emit('close')"
          >返回</UiButton
        >
      </template>
    </AppFolderWorkspaceToolbar>
    <UiNotice
      v-if="state.error || playback.state.error"
      tone="danger"
      title="播放安排未完成"
      :message="state.error || playback.state.error"
      compact
    />
    <UiNotice
      v-else-if="workspaceValidationError"
      tone="warning"
      title="尚未完成"
      :message="workspaceValidationError.message"
      compact
    />
    <div class="performance-session-workspace__composer">
      <UiSearchBox
        v-model="librarySearchQuery"
        class="performance-session-workspace__search"
        label="搜尋曲庫並加入待播"
        placeholder="搜尋曲名或歌手…"
        :disabled="state.isSaving"
      />
      <UiButton
        :icon="Plus"
        variant="secondary"
        :disabled="state.isSaving"
        @click="openManualItem"
        >新增手動項目</UiButton
      >
      <UiCheckbox
        id="arrangement-continuous"
        label="連續播放"
        :model-value="playback.state.continuous"
        @update:model-value="playback.setContinuous"
      />
    </div>
    <UiNotice
      v-if="libraryAddValidationError"
      tone="warning"
      title="無法加入這首歌曲"
      :message="libraryAddValidationError.message"
      compact
    />
    <PerformanceSessionBoard
      class="performance-session-workspace__grid"
      :current="playback.currentItem.value"
      :player-track="playback.ownsPlayback.value ? null : playerState.track"
      :tracks="tracks"
      :pending-count="playback.pendingItems.value.length"
      :history-items="playback.historyItems.value"
      :phase="playerState.playbackPhase"
      :confirmed="currentConfirmed"
      :can-start="playback.canStart.value"
      :busy="state.isSaving || playback.state.busy"
      @start-first="playback.next"
      @complete="playback.complete"
      @stop="playback.stop"
      @toggle="togglePlayback"
      @duplicate="duplicateItem"
      @remove="confirmRemoveItem"
    >
      <template #pending>
        <UiScrollLayout
          v-if="isSearching && filteredTracks.length"
          class="performance-session-workspace__list-scroll"
          content-tag="ul"
          content-class="performance-session-workspace__search-results"
          aria-label="曲庫搜尋結果"
        >
          <UiTrackRow
            v-for="track in filteredTracks"
            :key="track.id"
            :track="track"
            interactive
            hide-duration
            :action-label="`加入待播：${track.title ?? track.id}`"
            @row-click="addLibraryTrack(track.id)"
          />
        </UiScrollLayout>
        <UiHint v-else-if="isSearching" padded center
          >曲庫中沒有符合的歌曲。</UiHint
        >
        <PerformanceSessionPlanList
          v-else-if="playback.pendingItems.value.length"
          :items="playback.pendingItems.value"
          :tracks="tracks"
          :selected-item-id="editorOpen ? state.plan.reviewCursorItemId : null"
          :saving="state.isSaving || playback.state.busy"
          @select="selectForReview"
          @move="moveItem"
          @duplicate="duplicateItem"
          @remove="confirmRemoveItem"
          @play="playback.start"
          @skip="playback.skip"
        />
        <UiHint v-else padded center
          >搜尋曲庫加入待播；外部伴奏可用「新增手動項目」。</UiHint
        >
      </template>
    </PerformanceSessionBoard>
    <UiModal
      :open="editorOpen"
      :title="creatingManualItem ? '新增手動項目' : '曲目設定'"
      body-mode="workspace"
      max-block-size="medium"
      fixed-height
      :close-disabled="state.isSaving"
      @close="editorOpen = false"
    >
      <PerformanceSessionManualItemForm
        v-if="creatingManualItem"
        :saving="state.isSaving"
        :validation-error="reviewValidationError"
        @cancel="editorOpen = false"
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
    </UiModal>
  </section>
</template>
<style scoped>
.performance-session-workspace {
  container-name: performance-session-workspace;
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.performance-session-workspace__toolbar {
  flex: 0 0 auto;
}
.performance-session-workspace__saving {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
.performance-session-workspace__composer {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}
.performance-session-workspace__search {
  flex: 1;
  min-width: 0;
}
.performance-session-workspace__grid {
  flex: 1;
  min-height: 0;
}
.performance-session-workspace__list-scroll {
  --ui-scroll-layout-padding-block-start: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-block-end: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-inline-start: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-inline-end: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  flex: 1;
  min-height: 0;
}
.performance-session-workspace__list-scroll
  :deep(.performance-session-workspace__search-results) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
  margin: 0;
  list-style: none;
}
</style>
