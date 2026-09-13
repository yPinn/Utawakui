<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useAttrs,
  useTemplateRef,
  watch,
} from 'vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  text: { type: [String, Number], default: '' },
});

const attrs = useAttrs();
const rootRef = useTemplateRef('root');
const textRef = useTemplateRef('text');
const isOverflowing = shallowRef(false);
const isPointerSelecting = shallowRef(false);
const distance = shallowRef(0);
const motionPhase = shallowRef('idle');

const MARQUEE_BUFFER_PX = 16;
const MARQUEE_SPEED_PX_PER_SECOND = 48;
const MARQUEE_MIN_DURATION_SECONDS = 1.8;
const MARQUEE_MAX_DURATION_SECONDS = 5;
const displayText = computed(() => String(props.text ?? ''));
const marqueeDuration = computed(() => {
  const seconds = distance.value / MARQUEE_SPEED_PX_PER_SECOND;
  return `${Math.min(
    MARQUEE_MAX_DURATION_SECONDS,
    Math.max(MARQUEE_MIN_DURATION_SECONDS, seconds),
  ).toFixed(2)}s`;
});
const marqueeStyle = computed(() => ({
  '--demo-marquee-distance': `${distance.value}px`,
  '--demo-marquee-duration': marqueeDuration.value,
  '--demo-marquee-buffer': `${MARQUEE_BUFFER_PX}px`,
}));

let resizeObserver;
let frameId = 0;
let focusOwner;

function resetReveal() {
  motionPhase.value = 'idle';
}

function isMarqueeAnimation(event) {
  return event.animationName.startsWith('demo-marquee-scroll-');
}

function handleAnimationStart(event) {
  if (isMarqueeAnimation(event)) motionPhase.value = 'moving';
}

function handleAnimationEnd(event) {
  if (isMarqueeAnimation(event)) motionPhase.value = 'end';
}

function handleAnimationCancel(event) {
  if (isMarqueeAnimation(event)) resetReveal();
}

function measure() {
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(() => {
    const root = rootRef.value;
    const text = textRef.value;
    if (!root || !text) return;

    const appliedBuffer = isOverflowing.value ? MARQUEE_BUFFER_PX : 0;
    const naturalScrollWidth = text.scrollWidth - appliedBuffer;
    const overflow = Math.ceil(naturalScrollWidth - root.clientWidth);

    distance.value = Math.max(0, overflow + MARQUEE_BUFFER_PX);
    isOverflowing.value = overflow > 1;
    if (!isOverflowing.value) resetReveal();
  });
}

function beginPointerSelection(event) {
  if (event.pointerType === 'mouse' && event.button === 0) {
    isPointerSelecting.value = true;
  }
}

function endPointerSelection() {
  isPointerSelecting.value = false;
}

function resetPointerReveal() {
  endPointerSelection();
  resetReveal();
}

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measure);
    if (rootRef.value) resizeObserver.observe(rootRef.value);
  }

  measure();
  document.fonts?.ready?.then(measure);

  focusOwner = rootRef.value?.closest('[data-marquee-focus-owner]');
  focusOwner?.addEventListener('focus', resetReveal, true);
  focusOwner?.addEventListener('blur', resetReveal, true);
});

onUnmounted(() => {
  cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  focusOwner?.removeEventListener('focus', resetReveal, true);
  focusOwner?.removeEventListener('blur', resetReveal, true);
});

watch(displayText, async () => {
  await nextTick();
  measure();
});
</script>

<template>
  <span
    ref="root"
    v-bind="attrs"
    class="demo-candidate-marquee"
    :class="{
      'demo-candidate-marquee--overflow': isOverflowing,
      'demo-candidate-marquee--selecting': isPointerSelecting,
      'demo-candidate-marquee--moving': motionPhase === 'moving',
      'demo-candidate-marquee--end': motionPhase === 'end',
    }"
    :dir="attrs.dir ?? 'auto'"
    :style="marqueeStyle"
    :title="attrs.title ?? (isOverflowing ? displayText : undefined)"
    @pointerenter="resetReveal"
    @pointerdown="beginPointerSelection"
    @pointerup="endPointerSelection"
    @pointercancel="endPointerSelection"
    @pointerleave="resetPointerReveal"
  >
    <span
      ref="text"
      class="demo-candidate-marquee__text"
      @animationstart="handleAnimationStart"
      @animationend="handleAnimationEnd"
      @animationcancel="handleAnimationCancel"
    >
      {{ displayText }}
    </span>
  </span>
</template>

<style>
/* The focus owner lives outside this component's scoped subtree. Keep this
   development-only recipe global and class-qualified so keyboard focus can
   trigger the same one-pass reveal without adding a prop or tab stop. */
[data-marquee-focus-owner]:focus-visible
  .demo-candidate-marquee--overflow
  .demo-candidate-marquee__text {
  animation: demo-marquee-scroll-ltr var(--demo-marquee-duration) linear 0.2s 1
    both;
}

[data-marquee-focus-owner]:has(:focus-visible)
  .demo-candidate-marquee--overflow
  .demo-candidate-marquee__text {
  animation: demo-marquee-scroll-ltr var(--demo-marquee-duration) linear 0.2s 1
    both;
}

[data-marquee-focus-owner]:focus-visible
  .demo-candidate-marquee--overflow:dir(rtl)
  .demo-candidate-marquee__text {
  animation-name: demo-marquee-scroll-rtl;
}

[data-marquee-focus-owner]:has(:focus-visible)
  .demo-candidate-marquee--overflow:dir(rtl)
  .demo-candidate-marquee__text {
  animation-name: demo-marquee-scroll-rtl;
}

@keyframes demo-marquee-scroll-ltr {
  0% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(calc(var(--demo-marquee-distance) * -1));
  }
}

@keyframes demo-marquee-scroll-rtl {
  0% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(var(--demo-marquee-distance));
  }
}
</style>

<style scoped>
.demo-candidate-marquee {
  min-inline-size: 0;
  max-inline-size: 100%;
  display: block;
  overflow: hidden;
  white-space: nowrap;
}

.demo-candidate-marquee__text {
  max-inline-size: 100%;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

.demo-candidate-marquee--overflow .demo-candidate-marquee__text {
  max-inline-size: none;
  padding-inline-end: var(--demo-marquee-buffer);
}

.demo-candidate-marquee--overflow {
  --demo-marquee-fade-size: 0.75rem;
  -webkit-mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--demo-marquee-fade-size)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--demo-marquee-fade-size)),
    transparent 100%
  );
}

.demo-candidate-marquee--overflow:dir(rtl) {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--demo-marquee-fade-size),
    #000 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--demo-marquee-fade-size),
    #000 100%
  );
}

.demo-candidate-marquee--overflow.demo-candidate-marquee--moving {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--demo-marquee-fade-size),
    #000 calc(100% - var(--demo-marquee-fade-size)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--demo-marquee-fade-size),
    #000 calc(100% - var(--demo-marquee-fade-size)),
    transparent 100%
  );
}

.demo-candidate-marquee--overflow.demo-candidate-marquee--end {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--demo-marquee-fade-size),
    #000 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--demo-marquee-fade-size),
    #000 100%
  );
}

.demo-candidate-marquee--overflow.demo-candidate-marquee--end:dir(rtl) {
  -webkit-mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--demo-marquee-fade-size)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--demo-marquee-fade-size)),
    transparent 100%
  );
}

.demo-candidate-marquee--selecting .demo-candidate-marquee__text {
  animation-play-state: paused;
}

@media (hover: hover) and (pointer: fine) {
  .demo-candidate-marquee--overflow:hover .demo-candidate-marquee__text {
    animation: demo-marquee-scroll-ltr var(--demo-marquee-duration) linear 0.2s
      1 both;
  }

  .demo-candidate-marquee--overflow:dir(rtl):hover
    .demo-candidate-marquee__text {
    animation-name: demo-marquee-scroll-rtl;
  }
}

:global(:root[data-ui-motion='reduced']) .demo-candidate-marquee--overflow {
  -webkit-mask-image: none;
  mask-image: none;
}

:global(:root[data-ui-motion='reduced'])
  .demo-candidate-marquee--overflow
  .demo-candidate-marquee__text {
  max-inline-size: 100%;
  padding-inline-end: 0;
  animation: none !important;
  will-change: auto;
}

@media (prefers-reduced-motion: reduce) {
  .demo-candidate-marquee--overflow {
    -webkit-mask-image: none;
    mask-image: none;
  }

  .demo-candidate-marquee--overflow .demo-candidate-marquee__text {
    max-inline-size: 100%;
    padding-inline-end: 0;
    animation: none !important;
    will-change: auto;
  }
}
</style>
