<script setup>
import { computed, onMounted } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppView } from '../../composables/useAppView.js';
import { useAppRightDock } from '../../composables/useAppRightDock.js';
import PerformanceSessionCurrent from './PerformanceSessionCurrent.vue';
import PerformanceSessionQueueList from './PerformanceSessionQueueList.vue';
import PerformanceSessionCompletedList from './PerformanceSessionCompletedList.vue';
import PerformanceBroadcastStatus from './PerformanceBroadcastStatus.vue';
import { confirmPerformanceSessionItemRemoval } from './performanceSessionItemActions.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiButton from '../ui/UiButton.vue';
import { t } from '../../utils/i18n.js';

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
const { activeView, performanceTool, openPerformancePreparation } =
  useAppView();
const mainPageVisible = computed(
  () =>
    activeView.value === 'performance' && performanceTool.value === 'session',
);
const busy = computed(() => plan.state.isSaving || playback.state.busy);
async function remove(itemId) {
  const item = playback.pendingItems.value.find(
    (item) => item.itemId === itemId,
  );
  if (item && (await confirmPerformanceSessionItemRemoval(confirm, item)))
    await plan.removeItem(itemId);
}
onMounted(plan.initialize);
</script>

<template>
  <div
    v-if="dock.arrangementTab.value === 'history'"
    id="arrangement-dock-history-panel"
    class="performance-session-dock__history"
    role="tabpanel"
    aria-labelledby="arrangement-dock-history-tab"
    tabindex="0"
  >
    <div class="performance-session-dock__info">
      <UiButton @click="openPerformancePreparation('history')">{{
        t('session.history.viewFull')
      }}</UiButton>
      <PerformanceBroadcastStatus />
    </div>
    <PerformanceSessionCompletedList />
  </div>
  <template v-else>
    <UiNotice
      v-if="
        !mainPageVisible &&
        (plan.state.error ||
          (!plan.state.validationError?.field && plan.state.validationError) ||
          playback.state.error)
      "
      compact
      tone="warning"
      :title="t('session.dock.notUpdated')"
      :message="
        plan.state.error ||
        (!plan.state.validationError?.field &&
          plan.state.validationError?.message) ||
        playback.state.error
      "
    />
    <div class="performance-session-dock__info">
      <UiCheckbox
        v-if="!mainPageVisible"
        id="dock-arrangement-continuous"
        :label="t('session.workspace.continuous')"
        :model-value="playback.state.continuous"
        :disabled="!plan.state.plan.sessionId"
        @update:model-value="playback.setContinuous"
      />
      <h3 v-else class="performance-session-dock__heading">
        {{ t('session.planList.order') }}
      </h3>
      <PerformanceBroadcastStatus />
    </div>
    <div
      id="arrangement-dock-pending-panel"
      class="performance-session-dock__playback"
      role="tabpanel"
      aria-labelledby="arrangement-dock-pending-tab"
    >
      <PerformanceSessionCurrent
        v-if="!mainPageVisible"
        :current="playback.currentItem.value"
        :player-track="playback.ownsPlayback.value ? null : player.track"
        :tracks="library.tracks"
        :phase="player.playbackPhase"
        :confirmed="confirmed"
        :busy="busy"
        :can-start="playback.canStart.value"
        :next-item="playback.nextReadyItem.value"
        :has-played="playback.hasPlayed.value"
        @start-first="playback.startNext"
        @toggle="toggle"
        @complete="playback.complete"
        @stop="playback.stop"
      />
      <PerformanceSessionQueueList
        :items="playback.pendingItems.value"
        :tracks="library.tracks"
        :saving="busy"
        :move-item="plan.moveItem"
        @skip="playback.skip"
        @reorder="plan.reorderItem"
        @duplicate="plan.duplicateItem"
        @remove="remove"
      />
    </div>
  </template>
</template>

<style scoped>
.performance-session-dock__info {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-right-dock-content-gap);
  padding-block: var(--ui-right-dock-content-inset);
  min-block-size: calc(
    var(--ui-type-label-size) * var(--ui-type-label-line-height) + 2 *
      (var(--ui-border-width) + var(--ui-right-dock-content-inset))
  );
}
.performance-session-dock__heading {
  margin: 0;
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
.performance-session-dock__playback {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-block-size: 0;
  min-inline-size: 0;
  gap: var(--ui-side-panel-section-gap);
}
.performance-session-dock__history {
  display: flex;
  flex-direction: column;
  gap: var(--ui-right-dock-content-gap);
}
</style>
