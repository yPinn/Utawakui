<script setup>
import { computed, onMounted } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppRightDock } from '../../composables/useAppRightDock.js';
import PerformanceSessionCurrent from './PerformanceSessionCurrent.vue';
import PerformanceSessionQueueList from './PerformanceSessionQueueList.vue';
import PerformanceSessionCompletedList from './PerformanceSessionCompletedList.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiNotice from '../ui/UiNotice.vue';

const plan = usePerformanceSessionPlan();
const playback = usePerformanceSessionPlayback();
const dock = useAppRightDock();
const { state: library } = useLibrary();
const { state: player, toggle } = usePlayer();
const { confirm } = useAppConfirmation();
const confirmed = computed(() =>
  plan.state.plan.items.some(
    (item) =>
      item.itemId === playback.currentItem.value?.itemId &&
      item.progress === 'playing',
  ),
);
const busy = computed(() => plan.state.isSaving || playback.state.busy);
async function remove(itemId) {
  if (
    await confirm({
      title: '移除安排項目？',
      message: '只移除這次安排的項目，不會刪除曲庫歌曲。',
      confirmLabel: '移除',
      intent: 'danger',
    })
  )
    await plan.removeItem(itemId);
}
onMounted(plan.initialize);
</script>

<template>
  <PerformanceSessionCompletedList
    v-if="dock.arrangementTab.value === 'history'"
  />
  <template v-else>
    <UiNotice
      v-if="
        plan.state.error || plan.state.validationError || playback.state.error
      "
      compact
      tone="warning"
      title="播放安排未更新"
      :message="
        plan.state.error ||
        plan.state.validationError?.message ||
        playback.state.error
      "
    />
    <UiCheckbox
      id="dock-arrangement-continuous"
      label="連續播放"
      :model-value="playback.state.continuous"
      @update:model-value="playback.setContinuous"
    />
    <div
      id="arrangement-dock-pending-panel"
      class="performance-session-dock__playback"
      role="tabpanel"
      aria-labelledby="arrangement-dock-pending-tab"
    >
      <PerformanceSessionCurrent
        :current="playback.currentItem.value"
        :player-track="playback.ownsPlayback.value ? null : player.track"
        :tracks="library.tracks"
        :phase="player.playbackPhase"
        :confirmed="confirmed"
        :busy="busy"
        :can-start="playback.canStart.value"
        @start-first="playback.next"
        @toggle="toggle"
        @complete="playback.complete"
        @stop="playback.stop"
      />
      <PerformanceSessionQueueList
        :items="playback.pendingItems.value"
        :tracks="library.tracks"
        :saving="busy"
        @play="playback.start"
        @skip="playback.skip"
        @move="plan.moveItem"
        @reorder="plan.reorderItem"
        @duplicate="plan.duplicateItem"
        @remove="remove"
      />
    </div>
  </template>
</template>

<style scoped>
.performance-session-dock__playback {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-block-size: 0;
  min-inline-size: 0;
  gap: var(--ui-side-panel-section-gap);
}
</style>
