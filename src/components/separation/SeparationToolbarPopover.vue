<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useSeparationPreparation } from '../../composables/useSeparationPreparation.js';
import { useSeparationQueue } from '../../composables/useSeparationQueue.js';
import { useUiDensity } from '../../composables/useUiDensity.js';
import {
  AudioWaveform,
  Pause,
  Play,
  RotateCcw,
  Square,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiSelect from '../ui/UiSelect.vue';
import SeparationToolbarList from './SeparationToolbarList.vue';
import {
  separationQueueIndicator,
  separationQueueSummary,
} from './separationQueuePresentation.js';
import { separationToolbarPanelStyle } from './separationToolbarLayout.js';

const isOpen = shallowRef(false);
const { tracksById } = useLibrary();
const { openSettings } = useAppView();
const { density } = useUiDensity();
const panelStyle = computed(() => separationToolbarPanelStyle(density.value));

const {
  queue,
  error,
  initialize,
  enqueue,
  pause,
  resume,
  move,
  remove,
  retry,
  clearCompleted,
  cancelActive,
  dispose,
} = useSeparationQueue();
const {
  selectedMode,
  modeOptions,
  prepareAgain,
  isAdding,
  plannedTracks,
  planHint,
  preparePlaylist,
} = useSeparationPreparation({ enqueue });

const indicator = computed(() => separationQueueIndicator(queue.value));
const triggerLabel = computed(() =>
  indicator.value.state === 'idle'
    ? '伴奏處理'
    : `伴奏處理；${indicator.value.label}`,
);
const subtitle = computed(() => separationQueueSummary(queue.value));
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

onMounted(initialize);
onUnmounted(dispose);
</script>

<template>
  <div class="separation-toolbar-popover">
    <UiPopover
      v-model:open="isOpen"
      aria-label="伴奏處理"
      placement="bottom-end"
      :panel-style="panelStyle"
      scroll-axis="vertical"
      scroll-aria-label="伴奏處理清單"
    >
      <template #trigger="{ open, triggerProps }">
        <UiIconButton
          v-bind="triggerProps"
          class="separation-toolbar-popover__trigger"
          :class="`separation-toolbar-popover__trigger--${indicator.state}`"
          data-app-separation-trigger
          :icon="AudioWaveform"
          :label="triggerLabel"
          :title="indicator.label"
          variant="ghost"
          size="md"
          :active="open"
          @click="isOpen = !isOpen"
        />
      </template>

      <template #header>
        <div class="separation-toolbar-popover__title-row">
          <div class="separation-toolbar-popover__copy">
            <strong>伴奏處理</strong>
            <UiHint>{{ subtitle }}</UiHint>
          </div>
          <div
            v-if="activeItems.length > 0 || pendingItems.length > 0"
            class="separation-toolbar-popover__controls"
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
        </div>

        <div class="separation-toolbar-popover__setup">
          <UiSelect
            id="separation-toolbar-mode"
            v-model="selectedMode"
            class="separation-toolbar-popover__mode"
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
            >加入</UiButton
          >
        </div>
        <UiHint class="separation-toolbar-popover__plan">{{ planHint }}</UiHint>

        <UiNotice
          v-if="error"
          class="separation-toolbar-popover__notice"
          tone="warning"
          title="無法更新"
          :message="error"
          action-label="開啟設定"
          compact
          @action="openSettings"
        />
      </template>

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
    </UiPopover>
  </div>
</template>

<style scoped>
.separation-toolbar-popover {
  display: inline-flex;
  min-width: 0;
  app-region: no-drag;
  -webkit-app-region: no-drag;
}

.separation-toolbar-popover__trigger {
  color: var(--ui-color-text-muted);
}

.separation-toolbar-popover__trigger--running {
  color: var(--ui-color-accent);
}

.separation-toolbar-popover__trigger--paused {
  color: var(--ui-color-warning);
}

.separation-toolbar-popover__trigger--attention {
  color: var(--ui-color-danger);
}

.separation-toolbar-popover__title-row {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.separation-toolbar-popover__copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.separation-toolbar-popover__controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ui-space-1);
}

.separation-toolbar-popover__setup {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}

.separation-toolbar-popover__mode {
  min-width: 0;
}

.separation-toolbar-popover__plan {
  margin-top: var(--ui-space-1);
}

.separation-toolbar-popover__notice {
  margin-top: var(--ui-space-2);
}
</style>
