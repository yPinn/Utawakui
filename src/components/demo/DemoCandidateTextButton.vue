<script setup>
import UiMarqueeText from '../ui/UiMarqueeText.vue';

defineProps({
  text: { type: [String, Number], default: '' },
  ariaLabel: { type: String, default: undefined },
});

const emit = defineEmits(['click']);
</script>

<template>
  <button
    type="button"
    class="demo-candidate-text-btn"
    :aria-label="ariaLabel"
    @click.stop="emit('click', $event)"
  >
    <UiMarqueeText :text="text" />
  </button>
</template>

<style scoped>
.demo-candidate-text-btn {
  display: block;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  text-align: start;
  cursor: pointer;
}

.demo-candidate-text-btn :deep(.ui-marquee__text) {
  text-decoration-line: underline;
  text-decoration-color: color-mix(in srgb, currentcolor 42%, transparent);
  text-decoration-thickness: var(--ui-border-width);
  text-underline-offset: 0.18em;
}

.demo-candidate-text-btn:not(:disabled):hover :deep(.ui-marquee__text) {
  text-decoration-color: currentcolor;
}

.demo-candidate-text-btn:not(:disabled):active :deep(.ui-marquee__text) {
  text-decoration-color: var(--ui-color-accent);
  text-decoration-thickness: var(--ui-focus-width);
}

.demo-candidate-text-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-radius-md);
}

.demo-candidate-text-btn:disabled {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.demo-candidate-text-btn:disabled :deep(.ui-marquee__text) {
  text-decoration-color: transparent;
}
</style>
