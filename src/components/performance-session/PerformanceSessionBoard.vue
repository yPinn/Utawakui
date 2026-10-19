<script setup>
import { computed } from 'vue';
import { Check, Play, Pause, Square } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import PerformanceSessionPlanList from './PerformanceSessionPlanList.vue';

const props = defineProps({
  current: { type: Object, default: null },
  playerTrack: { type: Object, default: null },
  tracks: { type: Array, default: () => [] },
  pendingCount: { type: Number, default: 0 },
  historyItems: { type: Array, default: () => [] },
  phase: { type: String, default: 'idle' },
  confirmed: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  canStart: { type: Boolean, default: false },
  variant: { type: String, default: 'board' },
  idPrefix: { type: String, default: 'arrangement' },
  resultTab: { type: String, default: 'pending' },
});
const emit = defineEmits([
  'startFirst',
  'complete',
  'stop',
  'toggle',
  'duplicate',
  'remove',
]);
const track = computed(() =>
  props.current
    ? (props.tracks.find((track) => track.id === props.current.trackId) ?? {
        id: props.current.itemId,
        title: props.current.displayTitle,
      })
    : props.playerTrack,
);
const phaseLabel = computed(() =>
  props.current?.mode === 'manual'
    ? '手動進行中'
    : ({
        playing: '播放中',
        paused: '已暫停',
        buffering: '載入中',
        seeking: '定位中',
        ended: '播放結束',
        error: '播放失敗',
        idle: '準備播放',
      }[props.phase] ?? '準備播放'),
);
const completedCount = computed(
  () =>
    props.historyItems.filter((item) => item.progress === 'completed').length,
);
const unfinishedCount = computed(
  () => props.historyItems.length - completedCount.value,
);
</script>

<template>
  <div
    class="performance-session-board"
    :class="{ 'performance-session-board--dock': variant === 'dock' }"
  >
    <section
      class="performance-session-board__column performance-session-board__current"
      :aria-labelledby="`${idPrefix}-current-title`"
    >
      <header class="performance-session-board__heading">
        <h2 :id="`${idPrefix}-current-title`">目前播放</h2>
        <span
          v-if="track"
          class="performance-session-board__phase"
          role="status"
          aria-live="polite"
          >{{ phaseLabel }}</span
        >
      </header>
      <template v-if="track">
        <ul class="performance-session-board__identity">
          <UiTrackRow
            :track="track"
            :title="current?.displayTitle"
            :artist="current?.displayArtist"
            current
            hide-duration
            overflow="ellipsis"
          />
        </ul>
        <div class="performance-session-board__actions">
          <UiButton
            v-if="current?.mode !== 'manual'"
            :icon="phase === 'playing' ? Pause : Play"
            :disabled="busy || phase === 'ended'"
            @click="emit('toggle')"
            >{{ phase === 'playing' ? '暫停' : '播放' }}</UiButton
          >
          <UiButton v-if="current" :icon="Square" @click="emit('stop')"
            >停止</UiButton
          >
          <UiButton
            v-if="current"
            :icon="Check"
            variant="accent"
            :disabled="busy || !confirmed"
            @click="emit('complete')"
            >標記完成</UiButton
          >
        </div>
      </template>
      <div v-else class="performance-session-board__empty">
        <UiHint center>尚未開始播放</UiHint>
        <UiButton
          :icon="Play"
          variant="accent"
          :disabled="busy || !canStart"
          @click="emit('startFirst')"
          >播放第一首</UiButton
        >
      </div>
    </section>
    <section
      v-show="variant !== 'dock' || resultTab === 'pending'"
      :id="variant === 'dock' ? 'arrangement-dock-pending-panel' : undefined"
      :role="variant === 'dock' ? 'tabpanel' : undefined"
      :aria-labelledby="
        variant === 'dock'
          ? 'arrangement-dock-pending-tab'
          : `${idPrefix}-queued-title`
      "
      class="performance-session-board__column performance-session-board__pending"
    >
      <header
        v-if="variant !== 'dock'"
        class="performance-session-board__heading"
      >
        <h2 :id="`${idPrefix}-queued-title`">待播</h2>
        <UiChip tone="muted">{{ pendingCount }}</UiChip>
      </header>
      <slot name="pending" />
    </section>
    <section
      v-show="variant !== 'dock' || resultTab === 'history'"
      :id="variant === 'dock' ? 'arrangement-dock-history-panel' : undefined"
      :role="variant === 'dock' ? 'tabpanel' : undefined"
      :aria-labelledby="
        variant === 'dock'
          ? 'arrangement-dock-history-tab'
          : `${idPrefix}-completed-title`
      "
      class="performance-session-board__column"
    >
      <header class="performance-session-board__heading">
        <h2 :id="`${idPrefix}-completed-title`">已完成</h2>
        <UiChip tone="muted">{{ completedCount }}</UiChip>
        <span v-if="unfinishedCount" class="performance-session-board__caption"
          >另有 {{ unfinishedCount }} 首略過／中止</span
        >
      </header>
      <PerformanceSessionPlanList
        v-if="historyItems.length"
        :items="historyItems"
        :tracks="tracks"
        :saving="busy"
        history
        @duplicate="emit('duplicate', $event)"
        @remove="emit('remove', $event)"
      />
      <UiHint v-else padded center>播完的曲目會留在這裡。</UiHint>
    </section>
  </div>
</template>

<style scoped>
.performance-session-board {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.performance-session-board__column {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  min-width: 0;
  min-height: 0;
  padding: var(--ui-space-3);
  border-inline-start: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}
.performance-session-board__pending {
  padding-inline-start: 0;
  border-inline-start: 0;
}
.performance-session-board__column:last-child {
  padding-inline-end: 0;
}
.performance-session-board__current {
  grid-column: 1 / -1;
  grid-row: 1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  padding-inline: 0;
  border-inline-start: 0;
  border-block-end: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}
.performance-session-board__current .performance-session-board__heading {
  flex-direction: column;
  align-items: flex-start;
  padding: 0;
  border: 0;
}
.performance-session-board__current .performance-session-board__actions {
  grid-column: 3;
  grid-row: 1;
  justify-content: flex-end;
}
.performance-session-board__heading {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  min-width: 0;
  padding-block-end: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}
.performance-session-board__heading h2 {
  margin: 0;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.performance-session-board__phase {
  color: var(--ui-color-current);
}
.performance-session-board__phase,
.performance-session-board__caption {
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
.performance-session-board__caption {
  margin: 0;
  color: var(--ui-color-text-muted);
}
.performance-session-board__identity {
  margin: 0;
  padding: 0;
  list-style: none;
}
.performance-session-board__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.performance-session-board__empty {
  grid-column: 2 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.performance-session-board--dock {
  display: flex;
  flex-direction: column;
}
.performance-session-board--dock .performance-session-board__column {
  flex: 1;
  padding-inline: 0;
  border-inline-start: 0;
}
.performance-session-board--dock .performance-session-board__current {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
}
.performance-session-board--dock
  .performance-session-board__current
  .performance-session-board__heading {
  flex-direction: row;
  align-items: center;
}
.performance-session-board--dock
  .performance-session-board__current
  .performance-session-board__actions {
  justify-content: flex-start;
}
@container performance-session-workspace (max-width: 43rem) {
  .performance-session-board__current {
    grid-row: 1;
  }
  .performance-session-board__column {
    gap: var(--ui-space-2);
  }
  .performance-session-board__heading {
    padding-block-end: 0;
    border-block-end: 0;
  }
  .performance-session-board__current {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ui-space-2);
  }
  .performance-session-board__current .performance-session-board__heading {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
  }
  .performance-session-board__current .performance-session-board__actions {
    grid-column: 2;
    grid-row: 2;
    align-items: center;
  }
  .performance-session-board__empty {
    grid-column: 1 / -1;
  }
}
</style>
