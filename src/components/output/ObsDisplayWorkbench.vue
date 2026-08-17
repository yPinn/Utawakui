<script setup>
import { computed, shallowRef, watch } from 'vue';
import ObsPresetShowcase from './ObsPresetShowcase.vue';
import ObsSavedConfigList from './ObsSavedConfigList.vue';
import ObsSelectedPresetPanel from './ObsSelectedPresetPanel.vue';
import ObsStyleSetPanel from './ObsStyleSetPanel.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  styleSets: { type: Array, default: () => [] },
  configs: { type: Array, default: () => [] },
});

const workbenchPages = [
  { id: 'gallery', label: '模板庫' },
  { id: 'workbench', label: '工作台' },
];

function orderPresets(presets) {
  return [...presets].sort((a, b) => {
    const aOrder = a.order ?? 100;
    const bOrder = b.order ?? 100;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
}

const activePage = shallowRef('gallery');
const orderedPresets = computed(() => orderPresets(props.presets));
const selectedPresetId = shallowRef(orderedPresets.value[0]?.id ?? null);
const selectedPreset = computed(
  () =>
    orderedPresets.value.find(
      (preset) => preset.id === selectedPresetId.value,
    ) ??
    orderedPresets.value[0] ??
    null,
);

watch(orderedPresets, (presets) => {
  if (!presets.some((preset) => preset.id === selectedPresetId.value)) {
    selectedPresetId.value = presets[0]?.id ?? null;
  }
});

function selectPage(page) {
  activePage.value = page;
}
</script>

<template>
  <div class="obs-display-workbench">
    <header class="obs-display-workbench__modebar">
      <div
        class="obs-display-workbench__tabs"
        role="tablist"
        aria-label="OBS 顯示模式"
      >
        <button
          v-for="page in workbenchPages"
          :id="`obs-display-${page.id}-tab`"
          :key="page.id"
          type="button"
          class="obs-display-workbench__tab"
          :class="{
            'obs-display-workbench__tab--active': activePage === page.id,
          }"
          role="tab"
          :aria-selected="activePage === page.id"
          :aria-controls="`obs-display-${page.id}-panel`"
          :tabindex="activePage === page.id ? 0 : -1"
          @click="selectPage(page.id)"
        >
          {{ page.label }}
        </button>
      </div>
      <UiChip tone="gated">對外輸出 Gate</UiChip>
    </header>

    <section
      v-show="activePage === 'workbench'"
      id="obs-display-workbench-panel"
      class="obs-display-workbench__panel obs-display-workbench__panel--workbench"
      role="tabpanel"
      aria-labelledby="obs-display-workbench-tab"
    >
      <main class="obs-display-workbench__main" aria-label="OBS 外觀工作台">
        <ObsSelectedPresetPanel
          :preset="selectedPreset"
          @open-gallery="selectPage('gallery')"
        />
        <ObsStyleSetPanel :sets="styleSets" />
      </main>
      <ObsSavedConfigList :configs="configs" />
    </section>

    <section
      v-show="activePage === 'gallery'"
      id="obs-display-gallery-panel"
      class="obs-display-workbench__panel obs-display-workbench__panel--gallery"
      role="tabpanel"
      aria-labelledby="obs-display-gallery-tab"
    >
      <div class="obs-display-workbench__gallery">
        <ObsPresetShowcase
          :presets="orderedPresets"
          :selected-preset-id="selectedPreset?.id ?? null"
          @update:selected-preset-id="selectedPresetId = $event"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.obs-display-workbench {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.obs-display-workbench__modebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-display-workbench__tabs {
  display: inline-flex;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.obs-display-workbench__tab {
  min-height: var(--ui-control-height);
  padding: var(--ui-space-1) var(--ui-space-3);
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
}

.obs-display-workbench__tab:hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.obs-display-workbench__tab:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-display-workbench__tab--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.obs-display-workbench__panel {
  min-height: 0;
  min-width: 0;
}

.obs-display-workbench__panel--workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
  gap: var(--ui-space-4);
}

.obs-display-workbench__panel--gallery,
.obs-display-workbench__main {
  min-height: 0;
  min-width: 0;
}

.obs-display-workbench__main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.obs-display-workbench__gallery {
  min-height: 0;
  height: 100%;
}

@media (max-width: 1040px) {
  .obs-display-workbench__panel--workbench {
    grid-template-columns: 1fr;
    overflow: auto;
  }
}

@media (max-width: 680px) {
  .obs-display-workbench__modebar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
