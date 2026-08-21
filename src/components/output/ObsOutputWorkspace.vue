<script setup>
import { computed, onMounted, shallowRef, watch } from 'vue';
import { useOutputRuntimeContext } from '../../composables/outputRuntimeContext.js';
import {
  buildOutputTemplateUrls,
  outputPathForTemplate,
} from '../../utils/outputRoutes.js';
import ObsOutputSettings from './ObsOutputSettings.vue';
import ObsTemplateGallery from './ObsTemplateGallery.vue';
import ObsWorkbenchPanel from './ObsWorkbenchPanel.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
  styleSets: { type: Array, default: () => [] },
  configs: { type: Array, default: () => [] },
});

const pages = [
  { id: 'gallery', label: '模板庫' },
  { id: 'workbench', label: '工作台' },
  { id: 'settings', label: '輸出設定' },
];

function orderPresets(presets) {
  return [...presets].sort((a, b) => {
    const orderDelta = (a.order ?? 100) - (b.order ?? 100);
    return orderDelta || a.name.localeCompare(b.name);
  });
}

const activePage = shallowRef('gallery');
const orderedPresets = computed(() => orderPresets(props.presets));
const browsedPresetId = shallowRef(orderedPresets.value[0]?.id ?? null);
const {
  state: outputState,
  selectedProfile,
  start: startOutput,
  stop: stopOutput,
  loadProfiles,
  saveTemplateSelection,
  suggestPorts,
  updateSettings,
} = useOutputRuntimeContext();

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
const browsedPreset = computed(
  () =>
    orderedPresets.value.find(
      (preset) => preset.id === browsedPresetId.value,
    ) ??
    orderedPresets.value[0] ??
    null,
);
const appliedPreset = computed(
  () =>
    orderedPresets.value.find(
      (preset) => preset.id === selectedProfile.value?.templateId,
    ) ??
    orderedPresets.value[0] ??
    null,
);
const workbenchUrls = computed(() =>
  buildOutputTemplateUrls(outputState.status, appliedPreset.value?.id),
);
const browsedPresetSupported = computed(() =>
  Boolean(outputPathForTemplate(browsedPreset.value?.id)),
);
const runtimeBusy = computed(
  () =>
    outputState.isStarting ||
    outputState.isStopping ||
    outputState.isSavingSettings,
);

watch(orderedPresets, (presets) => {
  if (!presets.some((preset) => preset.id === browsedPresetId.value)) {
    browsedPresetId.value = presets[0]?.id ?? null;
  }
});

function selectPage(page) {
  activePage.value = page;
}

function selectPreset(id) {
  browsedPresetId.value = id;
}

async function applyPreset(id) {
  const saved = await saveTemplateSelection(id, seedProfile.value);
  if (saved) browsedPresetId.value = id;
}

async function saveRuntimeSettings(settings) {
  await updateSettings(settings);
}

onMounted(async () => {
  await loadProfiles(seedProfile.value);
  if (selectedProfile.value?.templateId) {
    browsedPresetId.value = selectedProfile.value.templateId;
  }
});
</script>

<template>
  <div class="obs-output-workspace">
    <header class="obs-output-workspace__modebar">
      <div
        class="obs-output-workspace__tabs"
        role="tablist"
        aria-label="OBS 輸出頁面"
      >
        <button
          v-for="page in pages"
          :id="`obs-output-${page.id}-tab`"
          :key="page.id"
          type="button"
          class="obs-output-workspace__tab"
          :class="{
            'obs-output-workspace__tab--active': activePage === page.id,
          }"
          role="tab"
          :aria-selected="activePage === page.id"
          :aria-controls="`obs-output-${page.id}-panel`"
          :tabindex="activePage === page.id ? 0 : -1"
          @click="selectPage(page.id)"
        >
          {{ page.label }}
        </button>
      </div>
      <UiChip tone="gated">對外輸出 Gate</UiChip>
    </header>

    <section
      v-show="activePage === 'gallery'"
      id="obs-output-gallery-panel"
      class="obs-output-workspace__panel"
      role="tabpanel"
      aria-labelledby="obs-output-gallery-tab"
    >
      <ObsTemplateGallery
        :presets="orderedPresets"
        :template-groups="templateGroups"
        :selected-preset-id="browsedPreset?.id ?? null"
        :applied-preset-id="appliedPreset?.id ?? null"
        :output-supported="browsedPresetSupported"
        :is-applying="outputState.isSavingProfile"
        @update:selected-preset-id="selectPreset"
        @apply-preset="applyPreset"
        @open-workbench="selectPage('workbench')"
      />
    </section>

    <section
      v-show="activePage === 'workbench'"
      id="obs-output-workbench-panel"
      class="obs-output-workspace__panel"
      role="tabpanel"
      aria-labelledby="obs-output-workbench-tab"
    >
      <ObsWorkbenchPanel
        :preset="appliedPreset"
        :profile="selectedProfile"
        :style-sets="styleSets"
        :output-status="outputState.status"
        :preview-url="workbenchUrls.previewUrl"
        :obs-url="workbenchUrls.obsUrl"
        :output-error="outputState.error"
        @open-gallery="selectPage('gallery')"
      />
    </section>

    <section
      v-show="activePage === 'settings'"
      id="obs-output-settings-panel"
      class="obs-output-workspace__panel"
      role="tabpanel"
      aria-labelledby="obs-output-settings-tab"
    >
      <ObsOutputSettings
        :status="outputState.status"
        :settings="outputState.settings"
        :suggested-ports="outputState.suggestedPorts"
        :obs-url="workbenchUrls.obsUrl"
        :busy="runtimeBusy"
        :error="outputState.error"
        @save="saveRuntimeSettings"
        @start="startOutput"
        @stop="stopOutput"
        @suggest-ports="suggestPorts"
      />
    </section>
  </div>
</template>

<style scoped>
.obs-output-workspace {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.obs-output-workspace__modebar {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-output-workspace__tabs {
  display: inline-flex;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.obs-output-workspace__tab {
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

.obs-output-workspace__tab:hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.obs-output-workspace__tab:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-output-workspace__tab--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.obs-output-workspace__panel {
  min-height: 0;
  min-width: 0;
}

@media (max-width: 680px) {
  .obs-output-workspace__modebar {
    align-items: flex-start;
    flex-direction: column;
  }

  .obs-output-workspace__tabs {
    max-width: 100%;
    overflow-x: auto;
  }
}
</style>
