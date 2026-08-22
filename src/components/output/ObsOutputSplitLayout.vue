<script setup>
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
      <slot name="side" />
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
  container-type: inline-size;
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
  display: grid;
  padding-inline: var(--ui-space-4) var(--ui-space-3);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
  overflow: auto;
}

.obs-output-split-layout--side-detail .obs-output-split-layout__side {
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-content: start;
  gap: var(--ui-space-3);
}

.obs-output-split-layout--side-inspector .obs-output-split-layout__side {
  align-content: start;
  gap: 0;
}

@container (width < 48rem) {
  .obs-output-split-layout {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .obs-output-split-layout__side {
    padding-block-start: var(--ui-space-4);
    padding-inline: 0;
    border-block-start: var(--ui-border-width) solid var(--ui-color-border);
    border-inline-start: 0;
    overflow: visible;
  }
}
</style>
