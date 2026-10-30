<script setup>
import { computed } from 'vue';

const props = defineProps({
  history: { type: Array, default: () => [] },
  activityOptions: { type: Object, default: null },
  activityEnabled: { type: Boolean, default: false },
});
const points = computed(() => {
  const end = props.history.at(-1)?.atMs ?? 0;
  return props.history
    .map(
      (s) =>
        `${Math.max(0, Math.min(1000, (s.atMs - end + 10000) / 10))},${-s.dbfs * 1.8}`,
    )
    .join(' ');
});
</script>

<template>
  <figure class="mic-history">
    <figcaption>
      最近 10 秒分析後電平
      <span v-if="activityEnabled && activityOptions"
        >虛線：開 {{ activityOptions.openThreshold }}／關
        {{ activityOptions.closeThreshold }} dBFS</span
      ><span v-else>活動門檻未啟用</span>
    </figcaption>
    <div class="mic-history__plot">
      <div class="mic-history__axis" aria-hidden="true">
        <span>0</span><span>−50</span><span>−100</span>
      </div>
      <svg
        viewBox="0 0 1000 180"
        preserveAspectRatio="none"
        role="img"
        aria-label="最近十秒的分析後電平歷史，固定零至負一百分貝刻度"
      >
        <path
          d="M0 0H1000 M0 90H1000 M0 180H1000"
          class="mic-history__grid"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-if="activityEnabled && activityOptions"
          :d="`M0 ${-activityOptions.openThreshold * 1.8}H1000 M0 ${-activityOptions.closeThreshold * 1.8}H1000`"
          class="mic-history__threshold"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          :points="points"
          class="mic-history__signal"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span v-if="!history.length" class="mic-history__empty"
        >開始輸入後顯示電平歷史</span
      >
    </div>
    <p>較早 <span>現在</span></p>
  </figure>
</template>

<style scoped>
.mic-history {
  min-inline-size: 0;
  margin: 0;
  display: grid;
  gap: var(--ui-space-2);
}
.mic-history figcaption,
.mic-history > p {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ui-space-2);
}
.mic-history figcaption span,
.mic-history > p,
.mic-history__axis,
.mic-history__empty {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.mic-history > p {
  margin: 0;
  padding-inline-start: var(--ui-space-6);
}
.mic-history__plot {
  position: relative;
  display: grid;
  grid-template-columns: 4ch minmax(0, 1fr);
  gap: var(--ui-space-2);
  block-size: 8rem;
}
.mic-history__axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}
.mic-history svg {
  inline-size: 100%;
  block-size: 100%;
  overflow: hidden;
  background: var(--ui-color-canvas);
}
.mic-history__grid {
  fill: none;
  stroke: var(--ui-color-border);
}
.mic-history__threshold {
  fill: none;
  stroke: var(--ui-color-text-muted);
  stroke-dasharray: 5 5;
}
.mic-history__signal {
  fill: none;
  stroke: var(--ui-color-accent);
  stroke-width: 2;
}
.mic-history__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
</style>
