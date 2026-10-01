<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useSeparationPreparation } from '../../composables/useSeparationPreparation.js';
import { useSeparationQueue } from '../../composables/useSeparationQueue.js';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from '../../icons/index.js';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import {
  separationItemLabel,
  separationQueueSummary,
} from './separationQueuePresentation.js';

defineProps({
  active: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const { tracksById } = useLibrary();
const { openSettings } = useAppView();

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
  <AppRightDockPanel
    class="separation-queue-panel"
    title="伴奏處理"
    :subtitle="subtitle"
    close-label="關閉伴奏處理"
    aria-label="伴奏處理"
    @close="emit('close')"
  >
    <section class="separation-queue-panel__setup" aria-label="加入歌曲">
      <UiSelect
        id="separation-queue-mode"
        v-model="selectedMode"
        class="separation-queue-panel__mode"
        label="模式"
        :options="modeOptions"
      />

      <UiCheckbox
        id="separation-queue-prepare-again"
        v-model="prepareAgain"
        label="重新準備已有伴奏"
      />

      <div class="separation-queue-panel__add-row">
        <UiButton
          variant="accent"
          :disabled="plannedTracks.length === 0"
          :loading="isAdding"
          loading-label="加入中"
          @click="preparePlaylist"
        >
          加入處理
        </UiButton>
        <UiHint>{{ planHint }}</UiHint>
      </div>
    </section>

    <UiNotice
      v-if="error"
      tone="warning"
      title="無法更新"
      :message="error"
      action-label="開啟設定"
      compact
      @action="openSettings"
    />

    <section
      v-if="activeItems.length > 0 || pendingItems.length > 0"
      class="separation-queue-panel__controls"
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
    </section>

    <UiHint v-if="!hasQueueItems" class="separation-queue-panel__empty">
      尚未加入處理
    </UiHint>

    <AppRightDockSection
      v-if="activeItems.length > 0"
      class="separation-queue-panel__section"
      heading="處理中"
      divided
    >
      <ul class="separation-queue-panel__list">
        <UiTrackRow
          v-for="item in activeItems"
          :key="item.itemId"
          :track="trackFor(item)"
          hide-duration
        >
          <template #trail>
            <span class="separation-queue-panel__state">
              {{ separationItemLabel(item) }}
            </span>
          </template>
        </UiTrackRow>
      </ul>
      <UiProgress
        v-for="item in activeItems"
        :key="`${item.itemId}-progress`"
        label="進度"
        :value="item.percent ?? 0"
        :value-text="separationItemLabel(item)"
        :indeterminate="!Number.isFinite(item.percent)"
      />
    </AppRightDockSection>

    <AppRightDockSection
      v-if="pendingItems.length > 0"
      class="separation-queue-panel__section"
      heading="接下來"
      divided
    >
      <ul class="separation-queue-panel__list">
        <UiTrackRow
          v-for="(item, index) in pendingItems"
          :key="item.itemId"
          :track="trackFor(item)"
          hide-duration
        >
          <template #lead>
            <span class="separation-queue-panel__order" aria-hidden="true">
              {{ index + 1 }}
            </span>
          </template>
          <template #trail>
            <span class="separation-queue-panel__row-actions">
              <UiIconButton
                :icon="ChevronUp"
                :label="`將 ${trackFor(item).title} 往前移`"
                :disabled="index === 0"
                @click="move(item.itemId, -1)"
              />
              <UiIconButton
                :icon="ChevronDown"
                :label="`將 ${trackFor(item).title} 往後移`"
                :disabled="index === pendingItems.length - 1"
                @click="move(item.itemId, 1)"
              />
              <UiIconButton
                :icon="Trash2"
                :label="`從清單移除 ${trackFor(item).title}`"
                @click="remove(item.itemId)"
              />
            </span>
          </template>
        </UiTrackRow>
      </ul>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="attentionItems.length > 0"
      class="separation-queue-panel__section"
      heading="未完成"
      divided
    >
      <ul class="separation-queue-panel__list">
        <UiTrackRow
          v-for="item in attentionItems"
          :key="item.itemId"
          :track="trackFor(item)"
          hide-duration
        >
          <template #trail>
            <span class="separation-queue-panel__row-actions">
              <UiIconButton
                :icon="RotateCcw"
                :label="`重試 ${trackFor(item).title}`"
                @click="retry(item.itemId)"
              />
              <UiIconButton
                :icon="Trash2"
                :label="`清除 ${trackFor(item).title}`"
                @click="remove(item.itemId)"
              />
            </span>
          </template>
        </UiTrackRow>
      </ul>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="completedItems.length > 0"
      class="separation-queue-panel__section"
      heading="已完成"
      divided
    >
      <template #trailing>
        <UiIconButton
          :icon="Trash2"
          label="清除完成紀錄"
          @click="clearCompleted"
        />
      </template>
      <ul class="separation-queue-panel__list">
        <UiTrackRow
          v-for="item in completedItems"
          :key="item.itemId"
          :track="trackFor(item)"
          hide-duration
        >
          <template #trail>
            <span class="separation-queue-panel__state">
              {{ separationItemLabel(item) }}
            </span>
          </template>
        </UiTrackRow>
      </ul>
    </AppRightDockSection>
  </AppRightDockPanel>
</template>

<style scoped>
.separation-queue-panel__setup {
  display: grid;
  gap: var(--ui-space-3);
}

.separation-queue-panel__add-row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
}

.separation-queue-panel__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-3);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.separation-queue-panel__empty {
  padding-block: var(--ui-space-5);
  text-align: center;
}

.separation-queue-panel__list {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.separation-queue-panel__order {
  min-width: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.separation-queue-panel__state {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.separation-queue-panel__row-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}

@media (max-width: 35rem) {
  .separation-queue-panel__add-row {
    grid-template-columns: 1fr;
  }
}
</style>
