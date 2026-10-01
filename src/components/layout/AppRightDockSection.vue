<script setup>
import { useId } from 'vue';
import UiSeparator from '../ui/UiSeparator.vue';

defineProps({
  heading: { type: String, required: true },
  divided: { type: Boolean, default: false },
});

const headingId = `app-right-dock-section-heading-${useId()}`;
</script>

<template>
  <section class="app-right-dock-section" :aria-labelledby="headingId">
    <UiSeparator
      v-if="divided"
      class="app-right-dock-section__divider"
      decorative
    />
    <header class="app-right-dock-section__header">
      <h3 :id="headingId">{{ heading }}</h3>
      <div v-if="$slots.trailing" class="app-right-dock-section__trailing">
        <slot name="trailing" />
      </div>
    </header>
    <div class="app-right-dock-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.app-right-dock-section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-right-dock-content-gap);
}

.app-right-dock-section__header {
  min-inline-size: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.app-right-dock-section__header h3 {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  -webkit-user-select: none;
  user-select: none;
}

.app-right-dock-section__trailing {
  flex: 0 0 auto;
}

.app-right-dock-section__body {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-right-dock-content-gap);
}
</style>
