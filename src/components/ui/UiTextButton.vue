<script setup>
// Wraps overflow text in a real <button> so a caller can make it its own
// click target, separate from a row's primary action. Marquee remains the
// default; high-volume surfaces can opt into static ellipsis to avoid one
// ResizeObserver and animation lane per row.
import { computed } from 'vue';
import UiMarqueeText from './UiMarqueeText.vue';

const props = defineProps({
  text: { type: [String, Number], default: '' },
  ariaLabel: { type: String, default: undefined },
  overflow: {
    type: String,
    default: 'marquee',
    validator: (value) => ['marquee', 'ellipsis'].includes(value),
  },
});

const emit = defineEmits(['click']);
const displayText = computed(() => String(props.text ?? ''));
</script>

<template>
  <button
    type="button"
    class="ui-text-btn"
    :aria-label="ariaLabel"
    @click.stop="emit('click', $event)"
  >
    <UiMarqueeText v-if="overflow === 'marquee'" :text="displayText" />
    <span v-else class="ui-text-btn__text" :title="displayText">
      {{ displayText }}
    </span>
  </button>
</template>

<style scoped>
.ui-text-btn {
  display: block;
  /* fit-content (not 100%) so the clickable hit-box hugs the actual text,
     not the full available width — several callers stack this over a
     larger row-level click target (e.g. QueueTrackButton's shared row),
     and a full-width invisible click box past a short title would steal
     clicks meant for that underlying target. max-width still caps it to
     the available space so UiMarqueeText's own overflow measurement
     (against its clientWidth) is unaffected — when the title is long
     enough to actually need truncation/marquee, this still fills it. */
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  /* Never font-weight — callers set their own on this class, and resetting
     it here would fight that on cascade order. */
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  text-align: start;
  cursor: pointer;
}

:global(:root[data-ui-system='v2'] .ui-text-btn) {
  -webkit-user-select: none;
  user-select: none;
}

.ui-text-btn__text {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Targets UiMarqueeText's own text span directly — it's inline-block, and
   text-decoration set on this button wouldn't paint into it otherwise. */
.ui-text-btn:not(:disabled):hover :deep(.ui-marquee__text),
.ui-text-btn:focus-visible :deep(.ui-marquee__text),
.ui-text-btn:not(:disabled):hover .ui-text-btn__text,
.ui-text-btn:focus-visible .ui-text-btn__text {
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

:global(:root[data-ui-system='v2'] .ui-text-btn:disabled) {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-text-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-radius-md);
}
</style>
