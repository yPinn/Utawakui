<script setup>
import { computed } from 'vue';
import { noteName } from '../internal-tools/referencePitchPlot.js';

const props = defineProps({
  history: { type: Array, required: true },
  running: { type: Boolean, required: true },
});

const toMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
const latest = computed(() => {
  const hz = props.history.at(-1)?.hz;
  if (!hz) return '';
  const midi = toMidi(hz);
  const cents = Math.round((midi - Math.round(midi)) * 100);
  return `${noteName(midi)} · ${hz.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} ¢`;
});

const trace = computed(() => {
  const end = props.history.at(-1)?.atMs;
  const commands = [];
  let connected = false;
  for (const { atMs, hz } of props.history) {
    if (!hz) {
      connected = false;
      continue;
    }
    const x = (atMs - end + 5000) / 5;
    const y = 50 - ((toMidi(hz) - 60) * 46) / 24;
    commands.push(`${connected ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(2)}`);
    if (!connected) commands.push('h0');
    connected = true;
  }
  return commands.join(' ');
});
</script>

<template>
  <figure class="mic-pitch">
    <figcaption class="mic-pitch__header">
      <strong>即時麥克風音高</strong>
      <span class="mic-pitch__readout">{{
        latest || (running ? '目前無可判定音高' : '開始測試後顯示音高')
      }}</span>
    </figcaption>
    <div class="mic-pitch__plot">
      <div class="mic-pitch__axis" aria-hidden="true">
        <span>C6</span><span>C5</span><span>C4</span><span>C3</span
        ><span>C2</span>
      </div>
      <svg
        class="mic-pitch__chart"
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="最近五秒的麥克風音高，從 C2 到 C6"
      >
        <path
          class="mic-pitch__grid"
          d="M0 4H1000 M0 27H1000 M0 50H1000 M0 73H1000 M0 96H1000"
          vector-effect="non-scaling-stroke"
        />
        <path
          class="mic-pitch__trace"
          :d="trace"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
    <div class="mic-pitch__time" aria-hidden="true">
      <span>5 秒前</span><span>現在</span>
    </div>
  </figure>
</template>

<style scoped>
.mic-pitch {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-2);
  margin: 0;
  padding-block-end: var(--ui-space-3);
  padding-inline-end: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}
.mic-pitch__header,
.mic-pitch__time {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ui-space-2);
}
.mic-pitch__readout,
.mic-pitch__axis,
.mic-pitch__time {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
}
.mic-pitch__plot {
  display: grid;
  grid-template-columns: var(--ui-space-6) minmax(0, 1fr);
  gap: var(--ui-space-2);
  block-size: 8rem;
}
.mic-pitch__axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  line-height: 1;
}
.mic-pitch__time {
  padding-inline-start: calc(var(--ui-space-6) + var(--ui-space-2));
}
.mic-pitch__chart {
  inline-size: 100%;
  block-size: 100%;
  background: var(--ui-color-canvas);
}
.mic-pitch__grid,
.mic-pitch__trace {
  fill: none;
}
.mic-pitch__grid {
  stroke: var(--ui-color-border);
}
.mic-pitch__trace {
  stroke: var(--ui-color-accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
