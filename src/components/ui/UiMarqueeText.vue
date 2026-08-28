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

// Trailing gap the scrolling text leaves before it reverses — the CSS
// padding-right must equal this exactly for the marquee's travel distance
// to look right, so it's set as a CSS custom property from here rather
// than duplicated as a separate `1rem` literal in the stylesheet.
const MARQUEE_BUFFER_PX = 16;

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
  '--ui-marquee-buffer': `${MARQUEE_BUFFER_PX}px`,
}));

let resizeObserver;
let frameId = 0;

function measure() {
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(() => {
    const root = rootRef.value;
    const text = textRef.value;
    if (!root || !text) return;

    // text.scrollWidth already includes the MARQUEE_BUFFER_PX padding-right
    // that .ui-marquee--overflow applies once isOverflowing is true — back
    // it out before recomputing, or a re-measure of an already-overflowing
    // row (e.g. after a legitimate ancestor resize) double-counts the
    // buffer into `distance` on top of the one added below.
    const appliedBuffer = isOverflowing.value ? MARQUEE_BUFFER_PX : 0;
    const naturalScrollWidth = text.scrollWidth - appliedBuffer;
    const overflow = Math.ceil(naturalScrollWidth - root.clientWidth);
    distance.value = Math.max(0, overflow + MARQUEE_BUFFER_PX);
    isOverflowing.value = overflow > 1;
  });
}

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measure);
    // Only the root, not the text span: text's own rendered size changes
    // *as a result of* isOverflowing toggling (.ui-marquee--overflow flips
    // its max-width/padding), so observing it too turns this into a
    // feedback loop — measure() flips isOverflowing on, which resizes the
    // text, which the observer reports back as a resize, which flips it
    // off again, forever, faster than the animation's 0.8s start delay
    // ever completes. The text's only two legitimate size inputs (content
    // change, font swap) are already covered by the displayText watcher
    // below and the document.fonts.ready hook.
    if (rootRef.value) resizeObserver.observe(rootRef.value);
  }
  measure();
  // A row that mounts before its font finishes loading measures against
  // fallback-font metrics; scrollWidth changes once the real font swaps in,
  // but nothing re-triggers ResizeObserver for a font-only change, so a
  // borderline-overflowing CJK/Latin-mixed string can get stuck reporting
  // "not overflowing" forever. document.fonts is unavailable under Vitest's
  // plain-Node environment, hence the guard.
  document.fonts?.ready?.then(measure);
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
  padding-right: var(--ui-marquee-buffer);
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

:global(
  :root[data-ui-motion='reduced'] .ui-marquee--overflow .ui-marquee__text
) {
  max-width: 100%;
  padding-right: 0;
  animation: none;
  will-change: auto;
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
