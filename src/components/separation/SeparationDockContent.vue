<script setup>
import { computed } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useSeparationPreparation } from '../../composables/useSeparationPreparation.js';
import UiButton from '../ui/UiButton.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import SeparationPreparationList from './SeparationPreparationList.vue';
import SeparationToolbarList from './SeparationToolbarList.vue';

const props = defineProps({
  separationController: { type: Object, required: true },
});
const emit = defineEmits(['navigate']);

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
  sourceOptions,
  sourceTracks,
  unpreparedTracks,
  preparedTracks,
  planHint,
  isBusy,
  isStarting,
  startUnpreparedTracks,
  restartPreparedTracks,
} = useSeparationPreparation({ enqueue, queue, tracksById });

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
        <UiButton
          variant="accent"
          :disabled="isBusy || unpreparedTracks.length === 0"
          :loading="isStarting"
          loading-label="開始中"
          @click="startUnpreparedTracks"
        >
          開始準備
        </UiButton>
      </div>
    </div>
    <UiHint v-if="unpreparedTracks.length > 0">{{ planHint }}</UiHint>

    <UiNotice
      v-if="error"
      tone="warning"
      title="無法更新"
      :message="error"
      action-label="開啟設定"
      compact
      @action="openSettings"
    />

    <SeparationPreparationList
      v-if="unpreparedTracks.length > 0 || preparedTracks.length > 0"
      :unprepared-tracks="unpreparedTracks"
      :prepared-tracks="preparedTracks"
      :busy="isBusy"
      @restart-prepared="restartPreparedTracks"
      @navigate="emit('navigate', $event)"
    />
    <UiHint v-else-if="sourceTracks.length === 0" padded center>
      此來源沒有曲目
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

.separation-dock-content__source,
.separation-dock-content__mode {
  min-inline-size: 0;
}

.separation-dock-content__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
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
