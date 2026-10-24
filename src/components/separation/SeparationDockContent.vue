<script setup>
import { computed, shallowRef, watch } from 'vue';
import { Info, ListPlus } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useSeparationPreparation } from '../../composables/useSeparationPreparation.js';
import UiCombobox from '../ui/UiCombobox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import PreparationReviewLayout from '../preparation/PreparationReviewLayout.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import SeparationPreparationList from './SeparationPreparationList.vue';
import SeparationToolbarList from './SeparationToolbarList.vue';
import {
  estimateSeparationOutput,
  separationSourceStatus,
} from './separationQueuePresentation.js';

const props = defineProps({
  active: { type: Boolean, default: false },
  separationController: { type: Object, required: true },
});
const emit = defineEmits(['navigate']);
const previewOpen = shallowRef(false);

const { tracksById } = useLibrary();
const { ensureLoaded: ensureArtistIndex } = useArtistIndex();
ensureArtistIndex();
const { openSettings } = useAppView();
const {
  queue,
  error,
  enqueue,
  pause,
  resume,
  move,
  remove,
  retry,
  clearPending,
  clearCompleted,
  cancelActive,
} = props.separationController;
const {
  selectedMode,
  modeOptions,
  selectedSourceId,
  selectedCollection,
  sourceOptions,
  sourceTracks,
  unpreparedTracks,
  preparedTracks,
  isBusy,
  isStarting,
  startUnpreparedTracks,
  startUnpreparedTrack,
  restartPreparedTracks,
} = useSeparationPreparation({ enqueue, queue, tracksById });

const sourceLabel = computed(() => {
  const options = sourceOptions.value.flatMap(
    (option) => option.options ?? [option],
  );
  const selectedOption = options.find(
    ({ value }) => value === selectedSourceId.value,
  );
  return (
    selectedCollection.value?.name ||
    selectedOption?.primaryLabel ||
    selectedOption?.label ||
    ''
  );
});

const sourceStatus = computed(() =>
  separationSourceStatus(
    sourceTracks.value,
    queue.value?.items ?? [],
    selectedMode.value,
  ),
);

const storageHint = computed(() => {
  const estimate = estimateSeparationOutput(unpreparedTracks.value);
  return estimate.label && estimate.knownTracks === estimate.totalTracks
    ? `最多新增${estimate.label}`
    : '';
});

watch([() => props.active, selectedSourceId], () => {
  previewOpen.value = false;
});

function navigateFromPreview(destination) {
  previewOpen.value = false;
  emit('navigate', destination);
}

const activeItems = computed(() =>
  (queue.value?.items ?? []).filter(({ status }) =>
    ['checking', 'running'].includes(status),
  ),
);
const pendingItems = computed(() =>
  (queue.value?.items ?? []).filter(({ status }) => status === 'pending'),
);
const attentionItems = computed(() =>
  (queue.value?.items ?? []).filter(({ status }) =>
    ['failed', 'cancelled'].includes(status),
  ),
);
const completedItems = computed(() =>
  (queue.value?.items ?? []).filter(({ status }) =>
    ['completed', 'skipped'].includes(status),
  ),
);
const hasQueueItems = computed(() => Boolean(queue.value?.items.length));
const isPaused = computed(() => queue.value?.status === 'paused');
const isPausing = computed(() => queue.value?.status === 'pausing');

function trackFor(item) {
  return (
    tracksById.value.get(item.trackId) ?? {
      id: item.trackId,
      title: '找不到歌曲',
      artist: '可能已從曲庫移除',
    }
  );
}
</script>

<template>
  <div class="separation-dock-content">
    <UiModal
      :open="previewOpen"
      title="伴奏處理"
      size="wide"
      max-block-size="medium"
      body-mode="workspace"
      :selectable="false"
      @close="previewOpen = false"
    >
      <PreparationReviewLayout
        :source="sourceLabel"
        :count="sourceTracks.length"
        :entity-kind="
          selectedCollection?.kind === 'album' ? 'album' : 'playlist'
        "
        :release-type="selectedCollection?.resolvedRelease?.type || 'unknown'"
        :release-date="selectedCollection?.resolvedRelease?.date"
        :cover-url="selectedCollection?.coverUrl || ''"
        :description="selectedCollection?.description || ''"
        :tracks="sourceTracks"
        :hint="storageHint"
        list-label="伴奏處理曲目"
      >
        <SeparationPreparationList
          v-if="unpreparedTracks.length > 0 || preparedTracks.length > 0"
          :unprepared-tracks="unpreparedTracks"
          :prepared-tracks="preparedTracks"
          :busy="isBusy"
          @start-track="startUnpreparedTrack"
          @restart-prepared="restartPreparedTracks"
          @navigate="navigateFromPreview"
        />
        <UiHint v-else padded center>
          {{
            sourceTracks.length === 0
              ? '此來源沒有曲目。'
              : '曲目已加入處理佇列。'
          }}
        </UiHint>
      </PreparationReviewLayout>
    </UiModal>
    <div class="separation-dock-content__setup">
      <UiCombobox
        id="separation-dock-source"
        v-model="selectedSourceId"
        class="separation-dock-content__source"
        label="來源"
        label-hidden
        :items="sourceOptions"
        :editable="false"
      >
        <template #option="{ item }">
          <span class="separation-dock-content__source-option">
            <span class="separation-dock-content__source-option-primary">
              {{ item.primaryLabel ?? item.label }}
            </span>
            <span
              v-if="item.secondaryLabel"
              class="separation-dock-content__source-option-secondary"
            >
              {{ item.secondaryLabel }}
            </span>
          </span>
        </template>
      </UiCombobox>
      <div class="separation-dock-content__actions">
        <UiSelect
          id="separation-dock-mode"
          v-model="selectedMode"
          class="separation-dock-content__mode"
          label="模式"
          label-hidden
          :options="modeOptions"
        />
        <UiIconButton
          :icon="Info"
          label="預覽處理曲目"
          aria-haspopup="dialog"
          :aria-expanded="previewOpen"
          @click="previewOpen = true"
        />
        <UiIconButton
          :icon="ListPlus"
          label="加入處理佇列"
          variant="accent"
          :disabled="isBusy || unpreparedTracks.length === 0"
          :loading="isStarting"
          loading-label="加入中"
          @click="startUnpreparedTracks"
        />
      </div>
    </div>
    <UiHint
      v-if="sourceStatus.length > 0"
      class="separation-dock-content__status"
      aria-label="目前來源處理狀態"
      role="status"
    >
      <span v-for="item in sourceStatus" :key="item.id">
        {{ item.label }} {{ item.count }}
      </span>
    </UiHint>

    <UiNotice
      v-if="error"
      tone="warning"
      title="無法更新"
      :message="error"
      action-label="開啟設定"
      compact
      @action="openSettings"
    />

    <UiHint v-if="sourceTracks.length === 0" padded center>
      此來源沒有曲目。
    </UiHint>

    <SeparationToolbarList
      v-if="hasQueueItems"
      :active-items="activeItems"
      :pending-items="pendingItems"
      :attention-items="attentionItems"
      :completed-items="completedItems"
      :track-for="trackFor"
      :paused="isPaused"
      :pausing="isPausing"
      @move="move"
      @remove="remove"
      @retry="retry"
      @pause="pause"
      @resume="resume"
      @clear-pending="clearPending"
      @cancel-active="cancelActive"
      @clear-completed="clearCompleted"
      @navigate="emit('navigate', $event)"
    />
  </div>
</template>

<style scoped>
.separation-dock-content {
  display: grid;
  gap: var(--ui-space-3);
  min-inline-size: 0;
}

.separation-dock-content__setup {
  display: grid;
  gap: var(--ui-space-2);
}

.separation-dock-content__status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-2);
  -webkit-user-select: none;
  user-select: none;
}

.separation-dock-content__status span {
  white-space: nowrap;
}

.separation-dock-content__source,
.separation-dock-content__mode {
  min-inline-size: 0;
}

.separation-dock-content__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.separation-dock-content__source-option {
  inline-size: 100%;
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.separation-dock-content__source-option-primary,
.separation-dock-content__source-option-secondary {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.separation-dock-content__source-option-primary {
  color: var(--ui-color-text);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.separation-dock-content__source-option-secondary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
</style>
