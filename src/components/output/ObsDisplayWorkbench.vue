<script setup>
import { computed, onMounted, shallowRef, watch } from 'vue';
import { useOutputRuntimeContext } from '../../composables/outputRuntimeContext.js';
import {
  buildOutputTemplateUrls,
  outputPathForTemplate,
} from '../../utils/outputRoutes.js';
import ObsPresetShowcase from './ObsPresetShowcase.vue';
import ObsSavedConfigList from './ObsSavedConfigList.vue';
import ObsSelectedPresetPanel from './ObsSelectedPresetPanel.vue';
import ObsStyleSetPanel from './ObsStyleSetPanel.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
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
const {
  state: outputState,
  selectedProfile,
  start: startOutput,
  stop: stopOutput,
  loadProfiles,
  saveTemplateSelection,
} = useOutputRuntimeContext();
const selectedPreset = computed(
  () =>
    orderedPresets.value.find(
      (preset) => preset.id === selectedPresetId.value,
    ) ??
    orderedPresets.value[0] ??
    null,
);
const seedProfile = computed(() => {
  const profile =
    props.configs.find((candidate) => candidate.active) ?? props.configs[0];
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    templateId: profile.templateId,
    styleSetIds: profile.styleSetIds ?? [],
    settings: profile.settings ?? {},
  };
});
const outputUrls = computed(() =>
  buildOutputTemplateUrls(outputState.status, selectedPreset.value?.id),
);
const outputBusy = computed(
  () => outputState.isStarting || outputState.isStopping,
);
const outputSupported = computed(() =>
  Boolean(outputPathForTemplate(selectedPreset.value?.id)),
);
const displayedConfigs = computed(() => {
  if (!outputState.profilesLoaded) return props.configs;
  return outputState.profiles.map((profile) => {
    const template = orderedPresets.value.find(
      (preset) => preset.id === profile.templateId,
    );
    return {
      ...profile,
      summary: template?.summary ?? '已保存的輸出配置。',
      source: template?.name ?? profile.templateId,
      updatedAt: '已保存',
      status: '已保存',
      active: profile.id === outputState.selectedProfileId,
    };
  });
});

watch(orderedPresets, (presets) => {
  if (!presets.some((preset) => preset.id === selectedPresetId.value)) {
    selectedPresetId.value = presets[0]?.id ?? null;
  }
});

function selectPage(page) {
  activePage.value = page;
}

function selectPreset(id) {
  selectedPresetId.value = id;
  saveTemplateSelection(id, seedProfile.value);
}

onMounted(async () => {
  await loadProfiles(seedProfile.value);
  const persistedTemplateId = selectedProfile.value?.templateId;
  if (
    orderedPresets.value.some((preset) => preset.id === persistedTemplateId)
  ) {
    selectedPresetId.value = persistedTemplateId;
  }
});
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
      <ObsSavedConfigList :configs="displayedConfigs" />
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
          :template-groups="templateGroups"
          :selected-preset-id="selectedPreset?.id ?? null"
          :output-status="outputState.status"
          :output-busy="outputBusy"
          :output-error="outputState.error"
          :output-supported="outputSupported"
          :preview-url="outputUrls.previewUrl"
          :obs-url="outputUrls.obsUrl"
          @update:selected-preset-id="selectPreset"
          @start-output="startOutput"
          @stop-output="stopOutput"
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
