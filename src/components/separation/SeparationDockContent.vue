<script setup>
import { computed } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useSeparationPreparation } from '../../composables/useSeparationPreparation.js';
import { Pause, Play, RotateCcw, Square } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import SeparationToolbarList from './SeparationToolbarList.vue';

const props = defineProps({
  separationController: { type: Object, required: true },
});

const { tracksById } = useLibrary();
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
  clearCompleted,
  cancelActive,
} = props.separationController;
const {
  selectedMode,
  modeOptions,
  prepareAgain,
  isAdding,
  plannedTracks,
  planHint,
  preparePlaylist,
} = useSeparationPreparation({ enqueue });

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
      <UiSelect
        id="separation-dock-mode"
        v-model="selectedMode"
        class="separation-dock-content__mode"
        label="模式"
        label-hidden
        :options="modeOptions"
      />
      <UiIconButton
        :icon="RotateCcw"
        label="已有伴奏也重新準備"
        :active="prepareAgain"
        :aria-pressed="prepareAgain"
        @click="prepareAgain = !prepareAgain"
      />
      <UiButton
        variant="accent"
        :disabled="plannedTracks.length === 0"
        :loading="isAdding"
        loading-label="加入中"
        @click="preparePlaylist"
      >
        加入
      </UiButton>
    </div>
    <UiHint>{{ planHint }}</UiHint>

    <UiNotice
      v-if="error"
      tone="warning"
      title="無法更新"
      :message="error"
      action-label="開啟設定"
      compact
      @action="openSettings"
    />

    <div
      v-if="activeItems.length > 0 || pendingItems.length > 0"
      class="separation-dock-content__controls"
      aria-label="處理控制"
    >
      <UiIconButton
        v-if="isPaused"
        :icon="Play"
        label="繼續"
        variant="accent"
        @click="resume"
      />
      <UiIconButton
        v-else
        :icon="Pause"
        :label="isPausing ? '等待暫停' : '完成這首後暫停'"
        :disabled="isPausing || pendingItems.length === 0"
        @click="pause"
      />
      <UiIconButton
        v-if="activeItems.length > 0"
        :icon="Square"
        label="停止這首"
        @click="cancelActive"
      />
    </div>

    <SeparationToolbarList
      v-if="hasQueueItems"
      :active-items="activeItems"
      :pending-items="pendingItems"
      :attention-items="attentionItems"
      :completed-items="completedItems"
      :track-for="trackFor"
      @move="move"
      @remove="remove"
      @retry="retry"
      @cancel-active="cancelActive"
      @clear-completed="clearCompleted"
    />
    <UiHint v-else padded center>尚未加入處理</UiHint>
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
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.separation-dock-content__mode {
  min-inline-size: 0;
}

.separation-dock-content__controls {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding-block: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}
</style>
