<script setup>
import { useId } from 'vue';

defineProps({
  heading: { type: String, required: true },
  tone: {
    type: String,
    default: 'raised',
    validator: (value) => ['plain', 'raised', 'accent'].includes(value),
  },
});

const headingId = `track-context-block-heading-${useId()}`;
</script>

<template>
  <section
    class="track-context-block"
    :class="`track-context-block--${tone}`"
    :aria-labelledby="headingId"
  >
    <header class="track-context-block__header">
      <h3 :id="headingId">{{ heading }}</h3>
      <div v-if="$slots.trailing" class="track-context-block__trailing">
        <slot name="trailing"></slot>
      </div>
    </header>
    <div class="track-context-block__body">
      <slot></slot>
    </div>
  </section>
</template>

<style scoped>
.track-context-block {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-right-dock-content-inset);
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-radius-md);
}

.track-context-block--plain {
  padding-inline: 0;
}

.track-context-block--raised {
  border-color: var(--ui-color-border);
  background: var(--ui-color-surface-raised);
}

.track-context-block--accent {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-selected);
}

.track-context-block__header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.track-context-block__header h3 {
  min-width: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  -webkit-user-select: none;
  user-select: none;
}

.track-context-block__trailing {
  flex: 0 0 auto;
}

.track-context-block__body {
  min-width: 0;
}
</style>
