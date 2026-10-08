<script setup>
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineProps({
  ariaLabel: { type: String, required: true },
  mainVariant: {
    type: String,
    default: 'fluid',
    validator: (value) => ['fluid', 'gallery'].includes(value),
  },
  sideLabel: { type: String, required: true },
  sideVariant: {
    type: String,
    default: 'inspector',
    validator: (value) => ['detail', 'inspector'].includes(value),
  },
  sideVisible: { type: Boolean, default: true },
});
</script>

<template>
  <section
    class="obs-output-split-layout"
    :class="[
      `obs-output-split-layout--main-${mainVariant}`,
      `obs-output-split-layout--side-${sideVariant}`,
      { 'obs-output-split-layout--no-side': !sideVisible },
    ]"
    :aria-label="ariaLabel"
  >
    <div class="obs-output-split-layout__main">
      <slot name="main" />
    </div>

    <aside
      v-if="sideVisible"
      class="obs-output-split-layout__side"
      :aria-label="sideLabel"
    >
      <div class="obs-output-split-layout__side-header">
        <slot name="side-header" />
      </div>
      <UiScrollRegion
        class="obs-output-split-layout__side-scroll"
        axis="vertical"
        viewport-class="obs-output-split-layout__side-viewport"
      >
        <slot name="side" />
      </UiScrollRegion>
      <div class="obs-output-split-layout__side-footer">
        <slot name="side-footer" />
      </div>
    </aside>
  </section>
</template>

<style scoped>
.obs-output-split-layout {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    var(--ui-output-workbench-inspector-width);
  gap: var(--ui-space-4);
}

.obs-output-split-layout--main-gallery {
  grid-template-columns:
    minmax(var(--ui-output-gallery-column-min), 1fr)
    var(--ui-output-gallery-detail-width);
}

.obs-output-split-layout--no-side {
  grid-template-columns: minmax(0, 1fr);
}

.obs-output-split-layout__main,
.obs-output-split-layout__side {
  min-height: 0;
  min-width: 0;
}

.obs-output-split-layout__main {
  display: grid;
}

.obs-output-split-layout__side {
  --ui-output-side-visual-inset-start: var(--ui-space-4);
  --ui-output-side-visual-inset-end: var(--ui-space-3);
  --ui-output-side-focus-safe-inset: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-output-side-scrollbar-visual-reserve: calc(
    var(--ui-scrollbar-lane-size) - var(--ui-scrollbar-thumb-inset)
  );
  --ui-output-side-content-inset-start: max(
    var(--ui-output-side-visual-inset-start),
    var(--ui-output-side-focus-safe-inset)
  );
  --ui-output-side-content-inset-end: calc(
    max(
        var(--ui-output-side-visual-inset-end),
        var(--ui-output-side-scrollbar-visual-reserve)
      ) +
      var(--ui-output-side-focus-safe-inset)
  );

  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding-inline: 0;
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-output-split-layout__side-header,
.obs-output-split-layout__side-footer {
  min-inline-size: 0;
  padding-inline: var(--ui-output-side-content-inset-start)
    var(--ui-output-side-content-inset-end);
}

.obs-output-split-layout__side-scroll {
  min-height: 0;
}

.obs-output-split-layout__side-scroll
  :deep(.obs-output-split-layout__side-viewport) {
  padding-inline: var(--ui-output-side-content-inset-start)
    var(--ui-output-side-content-inset-end);
  padding-block-end: var(--ui-output-side-focus-safe-inset);
  scroll-padding: var(--ui-output-side-focus-safe-inset)
    var(--ui-output-side-content-inset-end)
    var(--ui-output-side-focus-safe-inset)
    var(--ui-output-side-content-inset-start);
}

.obs-output-split-layout--side-detail
  .obs-output-split-layout__side-scroll
  :deep(.obs-output-split-layout__side-viewport) {
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.obs-output-split-layout--side-inspector
  .obs-output-split-layout__side-scroll
  :deep(.obs-output-split-layout__side-viewport) {
  display: grid;
  align-content: start;
  gap: 0;
}

@container app-folder-layout (width < 40rem) {
  .obs-output-split-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 2fr) minmax(0, 1fr);
  }

  .obs-output-split-layout--main-gallery {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }

  .obs-output-split-layout--no-side {
    grid-template-rows: minmax(0, 1fr);
  }

  .obs-output-split-layout__side {
    --ui-output-side-visual-inset-start: 0rem;
    --ui-output-side-visual-inset-end: 0rem;

    padding-block-start: var(--ui-space-4);
    border-block-start: var(--ui-border-width) solid var(--ui-color-border);
    border-inline-start: 0;
  }
}
</style>
