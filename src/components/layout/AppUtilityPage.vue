<script setup>
import { onMounted, useTemplateRef } from 'vue';
import { provideUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import { ArrowLeft } from '../../icons/index.js';
import {
  registeredOverlayHostAttributes,
  registeredSurfaceAttributes,
} from '../../utils/rendererSurfaceRegistry.js';
import UiButton from '../ui/UiButton.vue';
import UiSurface from '../ui/UiSurface.vue';

provideUiOverlayHost('app-utility');
const appUtilityAttributes = registeredSurfaceAttributes('app-utility');
const appUtilityOverlayHostAttributes =
  registeredOverlayHostAttributes('app-utility');

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
    v-bind="appUtilityAttributes"
    tag="section"
    class="app-utility-page"
    tone="surface"
    radius="sm"
    aria-labelledby="app-utility-page-title"
  >
    <div v-bind="appUtilityOverlayHostAttributes" class="ui-overlay-host" />
    <header class="app-utility-page__header">
      <UiButton
        class="app-utility-page__back"
        :icon="ArrowLeft"
        variant="ghost"
        @click="emit('back')"
      >
        {{ backLabel }}
      </UiButton>
      <div class="app-utility-page__copy">
        <h1
          id="app-utility-page-title"
          ref="title"
          class="app-utility-page__title"
          tabindex="-1"
        >
          {{ title }}
        </h1>
        <p v-if="description" class="app-utility-page__description">
          {{ description }}
        </p>
      </div>
    </header>

    <div class="app-utility-page__body">
      <slot />
    </div>
  </UiSurface>
</template>

<style scoped>
.app-utility-page {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
  overflow: hidden;
}

.app-utility-page__header {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-3);
}

.app-utility-page__back {
  margin-top: var(--ui-space-1);
}

.app-utility-page__copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.app-utility-page__title,
.app-utility-page__description {
  margin: 0;
}

.app-utility-page__title {
  color: var(--ui-color-text);
  font-size: var(--ui-type-heading-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-heading-line-height);
  text-wrap: balance;
}

.app-utility-page__title:focus {
  outline: none;
}

.app-utility-page__description {
  max-width: 70ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.app-utility-page__body {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 760px) {
  .app-utility-page {
    gap: var(--ui-space-3);
    padding: var(--ui-space-3);
  }

  .app-utility-page__header {
    gap: var(--ui-space-2);
  }
}
</style>
