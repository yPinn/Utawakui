<script setup>
import { onMounted, useTemplateRef } from 'vue';
import { ArrowLeft } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiSurface from '../ui/UiSurface.vue';

defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  backLabel: { type: String, default: '返回先前頁面' },
});

const emit = defineEmits(['back']);
const titleElement = useTemplateRef('title');

onMounted(() => titleElement.value?.focus());
</script>

<template>
  <UiSurface
    tag="section"
    class="app-utility-frame"
    tone="surface"
    radius="sm"
    aria-labelledby="app-utility-frame-title"
  >
    <header class="app-utility-frame__header">
      <UiButton
        class="app-utility-frame__back"
        :icon="ArrowLeft"
        variant="ghost"
        @click="emit('back')"
      >
        {{ backLabel }}
      </UiButton>
      <div class="app-utility-frame__copy">
        <h1
          id="app-utility-frame-title"
          ref="title"
          class="app-utility-frame__title"
          tabindex="-1"
        >
          {{ title }}
        </h1>
        <p v-if="description" class="app-utility-frame__description">
          {{ description }}
        </p>
      </div>
    </header>

    <div class="app-utility-frame__body">
      <slot />
    </div>
  </UiSurface>
</template>

<style scoped>
.app-utility-frame {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
  overflow: hidden;
}

.app-utility-frame__header {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-3);
}

.app-utility-frame__back {
  margin-top: var(--ui-space-1);
}

.app-utility-frame__copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.app-utility-frame__title,
.app-utility-frame__description {
  margin: 0;
}

.app-utility-frame__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
  text-wrap: balance;
}

.app-utility-frame__title:focus {
  outline: none;
}

.app-utility-frame__description {
  max-width: 70ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.app-utility-frame__body {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 760px) {
  .app-utility-frame {
    gap: var(--ui-space-3);
    padding: var(--ui-space-3);
  }

  .app-utility-frame__header {
    gap: var(--ui-space-2);
  }
}
</style>
