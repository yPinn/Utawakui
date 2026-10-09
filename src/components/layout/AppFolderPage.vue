<script setup>
import { nextTick, useTemplateRef, watch } from 'vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import AppLooseLeafEdge from './AppLooseLeafEdge.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  mode: {
    type: String,
    default: 'document',
    validator: (value) => ['document', 'workspace'].includes(value),
  },
  bodyLabel: { type: String, default: '頁面內容' },
  documentKey: { type: [String, Number], default: undefined },
});

const scrollLayout = useTemplateRef('scrollLayout');

watch(
  () => props.documentKey,
  async (nextKey, previousKey) => {
    if (nextKey === undefined || nextKey === previousKey) return;
    await nextTick();
    scrollLayout.value?.scrollTo({ top: 0, behavior: 'auto' });
  },
);
</script>

<template>
  <section
    v-bind="$attrs"
    class="app-folder-page"
    :class="{ 'app-folder-page--with-header': $slots.header }"
    :data-page-mode="props.mode"
    tabindex="-1"
  >
    <UiScrollLayout
      v-if="props.mode === 'document'"
      ref="scrollLayout"
      class="app-folder-page__scroll"
      axis="vertical"
      viewport-class="app-folder-page__viewport"
      content-class="app-folder-page__document"
      role="region"
      :aria-label="props.bodyLabel"
      tabindex="0"
    >
      <div class="app-folder-page__sheet">
        <AppLooseLeafEdge />

        <header v-if="$slots.header" class="app-folder-page__header">
          <slot name="header" />
        </header>

        <div class="app-folder-page__body app-folder-page__body--document">
          <slot />
        </div>
      </div>

      <div
        v-if="$slots.extension || $slots.floating"
        class="app-folder-page__extension"
        :class="{
          'app-folder-page__extension--floating': $slots.floating,
        }"
      >
        <slot name="extension" />
      </div>

      <div v-if="$slots.floating" class="app-folder-page__floating">
        <slot name="floating" />
      </div>
    </UiScrollLayout>
    <template v-else>
      <header v-if="$slots.header" class="app-folder-page__header">
        <slot name="header" />
      </header>

      <div class="app-folder-page__body app-folder-page__body--workspace">
        <slot />
      </div>
    </template>
  </section>
</template>

<style scoped>
.app-folder-page {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
  border-radius: var(--ui-radius-xs);
  background: transparent;
  color: var(--ui-color-text);
  outline: none;
}

.app-folder-page[data-page-mode='workspace'] {
  background: var(--ui-folder-page-background);
}

.app-folder-page--with-header[data-page-mode='workspace'] {
  grid-template-rows: auto minmax(0, 1fr);
}

.app-folder-page:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.app-folder-page__header {
  min-width: 0;
  padding: var(--ui-folder-document-inset);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.app-folder-page__sheet .app-folder-page__header {
  padding-inline-start: calc(
    var(--ui-folder-document-inset) + var(--ui-folder-sheet-binding-gutter)
  );
}

.app-folder-page__header :deep(.ui-page-header) {
  margin-bottom: 0;
}

.app-folder-page__header :deep(.ui-page-header__row) {
  min-width: 0;
  gap: var(--ui-space-4);
}

.app-folder-page__scroll {
  --ui-scroll-layout-padding-block-end: var(
    --ui-folder-sheet-frame-block-end-gap
  );
  --ui-scroll-layout-padding-inline-end: var(--ui-folder-sheet-scrollbar-gap);

  min-height: 0;
  height: 100%;
}

:deep(.app-folder-page__document) {
  position: relative;
  block-size: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: max-content max-content;
  isolation: isolate;
  overflow: visible;
}

.app-folder-page__sheet {
  position: relative;
  z-index: 0;
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  inline-size: 100%;
  max-inline-size: var(--ui-folder-sheet-max-inline-size);
  min-block-size: max(100%, var(--ui-folder-sheet-min-block-size));
  overflow: hidden;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-folder-page-background);
  color: var(--ui-color-text);
}

.app-folder-page__extension {
  position: relative;
  grid-column: 1;
  grid-row: 2;
  z-index: 0;
  min-width: 0;
  overflow: visible;
}

.app-folder-page__extension--floating {
  min-block-size: var(--ui-folder-artifact-folder-min-height);
}

.app-folder-page__floating {
  position: relative;
  grid-column: 1;
  grid-row: 1 / 3;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  pointer-events: none;
}

.app-folder-page__body {
  box-sizing: border-box;
  min-width: 0;
}

.app-folder-page__body--document {
  padding-block-start: var(--ui-folder-document-inset);
  padding-block-end: var(--ui-folder-document-block-end-inset);
  padding-inline-start: calc(
    var(--ui-folder-document-inset) + var(--ui-folder-sheet-binding-gutter)
  );
  padding-inline-end: var(--ui-folder-document-inset);
}

.app-folder-page__body--workspace {
  min-height: 0;
  height: 100%;
  padding: var(--ui-folder-document-inset);
  overflow: hidden;
}

@container app-folder-layout (max-width: 36rem) {
  .app-folder-page {
    --ui-folder-document-inset: var(--ui-space-4);
    --ui-folder-document-block-end-inset: var(--ui-space-5);
    --ui-folder-section-gap: var(--ui-space-3);
    --ui-folder-sheet-frame-block-end-gap: var(--ui-space-3);
    --ui-folder-sheet-binding-gutter: var(--ui-space-5);
    --ui-folder-sheet-hole-size: var(--ui-space-2);
    --ui-folder-sheet-hole-edge-inset: var(--ui-space-2);
  }

  .app-folder-page__header :deep(.ui-page-header__row) {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--ui-space-3);
  }
}
</style>
