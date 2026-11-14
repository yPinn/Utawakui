<script setup>
defineProps({
  peaks: { type: String, default: '' },
  energy: { type: String, default: '' },
  muted: Boolean,
});
</script>

<template>
  <g class="waveform-signal" :class="{ 'is-muted': muted }">
    <path :d="peaks" class="waveform-signal__peaks" />
    <path :d="energy" class="waveform-signal__energy" />
  </g>
</template>

<style scoped>
.waveform-signal {
  color: var(--waveform-signal-color, var(--ui-color-accent));
  pointer-events: none;
}
.waveform-signal.is-muted {
  color: var(--ui-color-text-muted);
}
.waveform-signal__peaks,
.waveform-signal__energy {
  fill: none;
  stroke: currentColor;
  stroke-width: var(--waveform-signal-stroke-width, 1);
  vector-effect: non-scaling-stroke;
}
.waveform-signal__peaks {
  stroke-opacity: var(--waveform-signal-peak-opacity, 0.4);
}
.is-muted .waveform-signal__peaks {
  stroke-opacity: 0.22;
}
.is-muted .waveform-signal__energy {
  stroke-opacity: 0.4;
}
</style>
