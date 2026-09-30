<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { FEATURE_IDS } from '../../constants/featureGates.js';
import { useAppView } from '../../composables/useAppView.js';
import { useFeatureGateAccess } from '../../composables/useFeatureGateAccess.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { useSeparationQueue } from '../../composables/useSeparationQueue.js';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Square,
  X,
} from '../../icons/index.js';
import AppRightDockHeader from '../layout/AppRightDockHeader.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import {
  buildSeparationPlan,
  estimateSeparationOutput,
  separationItemLabel,
  separationQueueSummary,
} from './separationQueuePresentation.js';

defineProps({
  active: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const { tracksById } = useLibrary();
const { currentTrack, queuedTracks, sourceUpcomingTracks } = usePlaybackQueue();
const { requireFeatureGate } = useFeatureGateAccess();
const { openSettings } = useAppView();
const selectedMode = shallowRef('general');
const prepareAgain = shallowRef(false);
const isAdding = shallowRef(false);

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

const plannedTracks = computed(() =>
  buildSeparationPlan({
    currentTrack: currentTrack.value,
    queuedTracks: queuedTracks.value,
    sourceUpcomingTracks: sourceUpcomingTracks.value,
  }),
);
const plannedOutput = computed(() =>
  estimateSeparationOutput(plannedTracks.value),
);
const planHint = computed(() => {
  if (plannedTracks.value.length === 0) return '播放清單目前沒有歌曲';
  const count = `${plannedTracks.value.length} 首`;
  if (!plannedOutput.value.label) return count;
  const prefix =
    plannedOutput.value.knownTracks === plannedOutput.value.totalTracks
      ? '最多新增'
      : '已知長度';
  return `${count} · ${prefix} ${plannedOutput.value.label}`;
});
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

async function preparePlaylist() {
  if (plannedTracks.value.length === 0 || isAdding.value) return;
  const enabled = await requireFeatureGate(FEATURE_IDS.AUDIO_PROCESSING_FLOW, {
    label: '伴奏功能',
    title: '需要啟用伴奏功能',
    message: '請先到設定完成初次準備，再回來加入歌曲。',
    source: 'separation',
    operation: 'enqueue',
  });
  if (!enabled) return;

  isAdding.value = true;
  try {
    await enqueue(
      plannedTracks.value.map(({ id }) => id),
      selectedMode.value,
      prepareAgain.value,
    );
  } finally {
    isAdding.value = false;
  }
}

onMounted(initialize);
onUnmounted(dispose);
</script>

<template>
  <section class="separation-queue-panel" aria-label="伴奏處理">
    <AppRightDockHeader
      title="伴奏處理"
      :subtitle="subtitle"
      close-label="關閉伴奏處理"
      @close="emit('close')"
    />

    <UiScrollRegion class="separation-queue-panel__scroll" axis="vertical">
      <div class="separation-queue-panel__content">
        <section class="separation-queue-panel__setup" aria-label="加入歌曲">
          <p class="separation-queue-panel__intro">
            把目前播放清單加入後，會依照順序逐首準備。
          </p>

          <label class="separation-queue-panel__mode">
            <span>處理方式</span>
            <select v-model="selectedMode" aria-label="伴奏處理方式">
              <option value="general">效果較好</option>
              <option value="quick">較快完成</option>
            </select>
          </label>

          <UiCheckbox
            id="separation-queue-prepare-again"
            v-model="prepareAgain"
            label="已有伴奏也重新準備"
          />

          <div class="separation-queue-panel__add-row">
            <UiButton
              variant="accent"
              :disabled="plannedTracks.length === 0"
              :loading="isAdding"
              loading-label="正在加入"
              @click="preparePlaylist"
            >
              準備播放清單
            </UiButton>
            <UiHint>{{ planHint }}</UiHint>
          </div>
        </section>

        <UiNotice
          v-if="error"
          tone="warning"
          title="目前無法更新"
          :message="error"
          action-label="前往設定"
          compact
          @action="openSettings"
        />

        <section
          v-if="activeItems.length > 0 || pendingItems.length > 0"
          class="separation-queue-panel__controls"
          aria-label="處理控制"
        >
          <UiButton
            v-if="isPaused"
            :icon="Play"
            variant="secondary"
            @click="resume"
          >
            繼續處理
          </UiButton>
          <UiButton
            v-else
            :icon="Pause"
            variant="secondary"
            :disabled="isPausing || pendingItems.length === 0"
            @click="pause"
          >
            {{ isPausing ? '這首完成後會暫停' : '跑完這首就暫停' }}
          </UiButton>
          <UiButton
            v-if="activeItems.length > 0"
            :icon="Square"
            @click="cancelActive"
          >
            停止這首
          </UiButton>
        </section>

        <UiHint v-if="!hasQueueItems" class="separation-queue-panel__empty">
          還沒有要準備的歌曲
        </UiHint>

        <section
          v-if="activeItems.length > 0"
          class="separation-queue-panel__section"
          aria-labelledby="separation-active-heading"
        >
          <h3 id="separation-active-heading">處理中</h3>
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
            label="目前進度"
            :value="item.percent ?? 0"
            :value-text="separationItemLabel(item)"
            :indeterminate="!Number.isFinite(item.percent)"
          />
        </section>

        <section
          v-if="pendingItems.length > 0"
          class="separation-queue-panel__section"
          aria-labelledby="separation-pending-heading"
        >
          <h3 id="separation-pending-heading">接下來</h3>
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
                    :icon="X"
                    :label="`移除 ${trackFor(item).title}`"
                    @click="remove(item.itemId)"
                  />
                </span>
              </template>
            </UiTrackRow>
          </ul>
        </section>

        <section
          v-if="attentionItems.length > 0"
          class="separation-queue-panel__section"
          aria-labelledby="separation-attention-heading"
        >
          <h3 id="separation-attention-heading">需要處理</h3>
          <ul class="separation-queue-panel__list">
            <UiTrackRow
              v-for="item in attentionItems"
              :key="item.itemId"
              :track="trackFor(item)"
              hide-duration
            >
              <template #trail>
                <span class="separation-queue-panel__row-actions">
                  <UiButton variant="secondary" @click="retry(item.itemId)">
                    再試一次
                  </UiButton>
                  <UiIconButton
                    :icon="X"
                    :label="`清除 ${trackFor(item).title} 的紀錄`"
                    @click="remove(item.itemId)"
                  />
                </span>
              </template>
            </UiTrackRow>
          </ul>
        </section>

        <section
          v-if="completedItems.length > 0"
          class="separation-queue-panel__section"
          aria-labelledby="separation-completed-heading"
        >
          <header class="separation-queue-panel__section-header">
            <h3 id="separation-completed-heading">已完成</h3>
            <UiButton @click="clearCompleted">清除紀錄</UiButton>
          </header>
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
        </section>
      </div>
    </UiScrollRegion>
  </section>
</template>

<style scoped>
.separation-queue-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--ui-color-surface);
}

.separation-queue-panel__scroll {
  min-height: 0;
  flex: 1;
}

.separation-queue-panel__content {
  display: grid;
  gap: var(--ui-space-5);
  padding: var(--ui-right-dock-content-inset);
}

.separation-queue-panel__setup {
  display: grid;
  gap: var(--ui-space-3);
}

.separation-queue-panel__intro {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.separation-queue-panel__mode {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.separation-queue-panel__mode select {
  box-sizing: border-box;
  width: 100%;
  height: var(--ui-control-height);
  min-width: 0;
  padding-inline: var(--ui-space-2) var(--ui-space-5);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.separation-queue-panel__mode select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
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

.separation-queue-panel__section {
  display: grid;
  gap: var(--ui-space-3);
}

.separation-queue-panel__section + .separation-queue-panel__section {
  padding-top: var(--ui-space-5);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.separation-queue-panel__section h3 {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.separation-queue-panel__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
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
  font-size: var(--ui-font-size-xs);
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
