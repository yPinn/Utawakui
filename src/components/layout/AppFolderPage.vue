<script setup>
import { nextTick, useTemplateRef, watch } from 'vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import AppLooseLeafEdge from './AppLooseLeafEdge.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  surface: {
    type: String,
    default: 'paper',
    validator: (value) => ['paper', 'canvas'].includes(value),
  },
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
    :data-workspace-surface="
      props.mode === 'workspace' ? props.surface : undefined
    "
    tabindex="-1"
  >
    <UiScrollLayout
      v-if="props.mode === 'document'"
      ref="scrollLayout"
      class="app-folder-page__scroll"
      axis="vertical"
      edge-shadow="end"
      viewport-class="app-folder-page__viewport"
      content-class="app-folder-page__document"
      role="region"
      :aria-label="props.bodyLabel"
      tabindex="0"
    >
      <div class="app-folder-page__sheet" data-folder-artifact-region="paper">
        <AppLooseLeafEdge />

        <header v-if="$slots.header" class="app-folder-page__header">
          <slot name="header" />
        </header>

        <div class="app-folder-page__body app-folder-page__body--document">
          <slot />
        </div>
      </div>

      <div
        v-if="$slots.extension || $slots.floating || $slots['folder-tools']"
        class="app-folder-page__extension"
        :class="{ 'app-folder-page__extension--floating': $slots.floating }"
        data-folder-artifact-region="bottom"
      >
        <slot name="extension" />
        <div v-if="$slots['folder-tools']" class="app-folder-page__tools">
          <slot name="folder-tools" />
        </div>
      </div>

      <div v-if="$slots.floating" class="app-folder-page__floating">
        <slot name="floating" />
      </div>
    </UiScrollLayout>
    <!-- Same loose-leaf paper as documents, but bounded: tools scroll inside. -->
    <div
      v-else
      class="app-folder-page__sheet app-folder-page__sheet--workspace"
    >
      <AppLooseLeafEdge v-if="props.surface !== 'canvas'" />

      <header v-if="$slots.header" class="app-folder-page__header">
        <slot name="header" />
      </header>

      <div class="app-folder-page__body app-folder-page__body--workspace">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.app-folder-page {
  /* Contains page-local layers; overlay hosts stay outside as siblings. */
  isolation: isolate;
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
  z-index: var(--ui-layer-base);
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  inline-size: 100%;
  max-inline-size: var(--ui-folder-sheet-max-inline-size);
  min-block-size: max(100%, var(--ui-folder-sheet-min-block-size));
  /* clip, not hidden: hidden would make the sheet a scroll container and
     detach sticky page chrome from the Folder scroll viewport. */
  overflow: clip;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-folder-page-background);
  color: var(--ui-color-text);
}

/* Must follow the sheet rule: workspaces fill the Folder at a fixed height. */
.app-folder-page__sheet--workspace {
  max-inline-size: none;
  min-block-size: 0;
  block-size: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.app-folder-page--with-header .app-folder-page__sheet--workspace {
  grid-template-rows: auto minmax(0, 1fr);
}

.app-folder-page__extension {
  position: relative;
  grid-column: 1;
  grid-row: 2;
  z-index: var(--ui-layer-base);
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
  z-index: var(--ui-layer-raised);
  min-width: 0;
  min-height: 0;
  overflow: visible;
  pointer-events: none;
}

.app-folder-page__tools {
  position: relative;
  z-index: var(--ui-layer-base);
  box-sizing: border-box;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-block-start: var(--ui-space-2);
  padding-inline-end: var(--ui-folder-document-inset);
  pointer-events: auto;
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
  padding-inline-start: calc(
    var(--ui-folder-document-inset) + var(--ui-folder-sheet-binding-gutter)
  );
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
.app-folder-page[data-workspace-surface='canvas'] .app-folder-page__sheet {
  max-inline-size: none;
  background: var(--ui-color-surface);
}

.app-folder-page[data-workspace-surface='canvas'] .app-folder-page__header,
.app-folder-page[data-workspace-surface='canvas'] .app-folder-page__body {
  padding: var(--ui-space-4);
}
</style>
