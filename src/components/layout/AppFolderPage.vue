<script setup>
import UiScrollLayout from '../ui/UiScrollLayout.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  mode: {
    type: String,
    default: 'document',
    validator: (value) => ['document', 'workspace'].includes(value),
  },
  bodyLabel: { type: String, default: '頁面內容' },
});
</script>

<template>
  <section
    v-bind="$attrs"
    class="app-folder-page"
    :class="{ 'app-folder-page--with-header': $slots.header }"
    :data-page-mode="props.mode"
    tabindex="-1"
  >
    <header v-if="$slots.header" class="app-folder-page__header">
      <slot name="header" />
    </header>

    <UiScrollLayout
      v-if="props.mode === 'document'"
      class="app-folder-page__scroll"
      axis="vertical"
      viewport-class="app-folder-page__body app-folder-page__body--document"
      content-style="block-size: 100%"
      role="region"
      :aria-label="props.bodyLabel"
      tabindex="0"
    >
      <slot />
    </UiScrollLayout>
    <div v-else class="app-folder-page__body app-folder-page__body--workspace">
      <slot />
    </div>
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
  background: var(--ui-folder-page-background);
  color: var(--ui-color-text);
  outline: none;
}

.app-folder-page--with-header {
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

.app-folder-page__header :deep(.ui-page-header) {
  margin-bottom: 0;
}

.app-folder-page__header :deep(.ui-page-header__row) {
  min-width: 0;
  gap: var(--ui-space-4);
}

.app-folder-page__scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-folder-document-inset);
  --ui-scroll-layout-padding-block-end: var(
    --ui-folder-document-block-end-inset
  );
  --ui-scroll-layout-padding-inline-start: var(--ui-folder-document-inset);
  --ui-scroll-layout-padding-inline-end: var(--ui-folder-document-inset);

  min-height: 0;
  height: 100%;
}

.app-folder-page__body {
  box-sizing: border-box;
  min-width: 0;
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
  }

  .app-folder-page__header :deep(.ui-page-header__row) {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--ui-space-3);
  }
}
</style>
