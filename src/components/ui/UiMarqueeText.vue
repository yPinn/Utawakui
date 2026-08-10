<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

const props = defineProps({
  text: { type: [String, Number], default: '' },
});

const rootRef = ref(null);
const textRef = ref(null);
const isOverflowing = shallowRef(false);
const distance = shallowRef(0);

const displayText = computed(() => String(props.text ?? ''));
const marqueeDuration = computed(() => {
  const seconds = distance.value / 26 + 4;
  return `${Math.min(16, Math.max(7, seconds)).toFixed(2)}s`;
});
const marqueeStyle = computed(() => ({
  '--ui-marquee-distance': `${distance.value}px`,
  '--ui-marquee-duration': marqueeDuration.value,
}));

let resizeObserver;
let frameId = 0;

function measure() {
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(() => {
    const root = rootRef.value;
    const text = textRef.value;
    if (!root || !text) return;

    const overflow = Math.ceil(text.scrollWidth - root.clientWidth);
    distance.value = Math.max(0, overflow + 16);
    isOverflowing.value = overflow > 1;
  });
}

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measure);
    if (rootRef.value) resizeObserver.observe(rootRef.value);
    if (textRef.value) resizeObserver.observe(textRef.value);
  }
  measure();
});

onUnmounted(() => {
  cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
});

watch(displayText, async () => {
  await nextTick();
  measure();
});
</script>

<template>
  <span
    ref="rootRef"
    class="ui-marquee"
    :class="{ 'ui-marquee--overflow': isOverflowing }"
    :style="marqueeStyle"
    :title="displayText"
  >
    <span ref="textRef" class="ui-marquee__text">{{ displayText }}</span>
  </span>
</template>

<style scoped>
.ui-marquee {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.ui-marquee__text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

.ui-marquee--overflow .ui-marquee__text {
  max-width: none;
  padding-right: 1rem;
  will-change: transform;
  animation: ui-marquee-scroll var(--ui-marquee-duration) ease-in-out 0.8s
    infinite alternate;
}

@keyframes ui-marquee-scroll {
  0%,
  20% {
    transform: translateX(0);
  }

  80%,
  100% {
    transform: translateX(calc(var(--ui-marquee-distance) * -1));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-marquee--overflow .ui-marquee__text {
    max-width: 100%;
    padding-right: 0;
    animation: none;
    will-change: auto;
  }
}
</style>
