<script setup>
// Wraps UiMarqueeText in a real <button> so a caller can make marqueeing
// text its own click target, separate from a row's own click handler.
import UiMarqueeText from './UiMarqueeText.vue';

defineProps({
  text: { type: [String, Number], default: '' },
  ariaLabel: { type: String, default: undefined },
});

const emit = defineEmits(['click']);
</script>

<template>
  <button
    type="button"
    class="ui-text-btn"
    :aria-label="ariaLabel"
    @click.stop="emit('click', $event)"
  >
    <UiMarqueeText :text="text" />
  </button>
</template>

<style scoped>
.ui-text-btn {
  display: block;
  /* fit-content (not 100%) so the clickable hit-box hugs the actual text,
     not the full available width — several callers stack this over a
     larger row-level click target (e.g. QueueTrackButton's play button),
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
  text-align: left;
  cursor: pointer;
}

/* Targets UiMarqueeText's own text span directly — it's inline-block, and
   text-decoration set on this button wouldn't paint into it otherwise. */
.ui-text-btn:hover :deep(.ui-marquee__text),
.ui-text-btn:focus-visible :deep(.ui-marquee__text) {
  text-decoration: underline;
}

.ui-text-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-radius-md);
}
</style>
