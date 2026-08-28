<script setup>
import { computed, onMounted, reactive, watch } from 'vue';
import { useOutputRuntimeContext } from '../../composables/useOutputRuntimeContext.js';
import { useOutputWorkspaceNavigation } from '../../composables/useOutputWorkspaceNavigation.js';
import { buildAllOutputSlotUrls } from '../../utils/outputRoutes.js';
import ObsOutputSettings from './ObsOutputSettings.vue';
import ObsOutputTabs from './ObsOutputTabs.vue';
import ObsTemplateGallery from './ObsTemplateGallery.vue';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
  previewScene: { type: Object, default: () => ({}) },
  slotDefinitions: { type: Array, default: () => [] },
  slotDefaults: { type: Object, default: () => ({}) },
  appearanceOptions: { type: Object, default: () => ({}) },
});

const pages = [
  { id: 'workbench', label: '工作台' },
  { id: 'gallery', label: '模板庫' },
  { id: 'settings', label: '輸出設定' },
];

function orderPresets(presets) {
  return [...presets].sort((a, b) => {
    const orderDelta = (a.order ?? 100) - (b.order ?? 100);
    return orderDelta || a.name.localeCompare(b.name);
  });
}

const orderedPresets = computed(() => orderPresets(props.presets));
const availableKindIds = computed(() =>
  props.slotDefinitions.map((definition) => definition.id),
);
const {
  activePage,
  activeKind,
  selectPage,
  selectKind: rememberKind,
  ensureAvailableKind,
} = useOutputWorkspaceNavigation();
const browsedPresetIds = reactive(
  Object.fromEntries(
    props.templateGroups.map((group) => [
      group.kind,
      group.templates[0]?.id ?? null,
    ]),
  ),
);
const {
  state: outputState,
  initialize: initializeOutput,
  refreshProjection,
  refreshStatus: refreshOutputStatus,
  start: startOutput,
  stop: stopOutput,
  loadSlots,
  saveSlotSettings,
  saveTemplateSelection,
  updateSettings,
} = useOutputRuntimeContext();

const browsedPreset = computed(
  () =>
    orderedPresets.value.find(
      (preset) => preset.id === browsedPresetIds[activeKind.value],
    ) ??
    orderedPresets.value.find((preset) => preset.kind === activeKind.value) ??
    null,
);
const activeSlot = computed(
  () =>
    outputState.slots[activeKind.value] ??
    props.slotDefaults[activeKind.value] ??
    null,
);
const appliedPreset = computed(
  () =>
    orderedPresets.value.find(
      (preset) => preset.id === activeSlot.value?.templateId,
    ) ?? null,
);
const appliedPresetIds = computed(() =>
  Object.fromEntries(
    props.slotDefinitions.map((slot) => [
      slot.id,
      outputState.slots[slot.id]?.templateId ??
        props.slotDefaults[slot.id]?.templateId ??
        null,
    ]),
  ),
);
const outputUrls = computed(() => buildAllOutputSlotUrls(outputState.status));
const workbenchUrls = computed(() => outputUrls.value[activeKind.value] ?? {});
const runtimeBusy = computed(
  () =>
    outputState.isStarting ||
    outputState.isStopping ||
    outputState.isSavingSettings ||
    outputState.isSavingSlot,
);

watch(availableKindIds, ensureAvailableKind, { immediate: true });

watch([orderedPresets, () => outputState.slots], ([presets]) => {
  for (const definition of props.slotDefinitions) {
    const currentId = browsedPresetIds[definition.id];
    if (!presets.some((preset) => preset.id === currentId)) {
      browsedPresetIds[definition.id] =
        outputState.slots[definition.id]?.templateId ??
        props.slotDefaults[definition.id]?.templateId ??
        presets.find((preset) => preset.kind === definition.id)?.id ??
        null;
    }
  }
});

function selectPreset(id) {
  const preset = orderedPresets.value.find((candidate) => candidate.id === id);
  if (!preset || !rememberKind(preset.kind, availableKindIds.value)) return;
  browsedPresetIds[preset.kind] = id;
}

function selectKind(kind) {
  rememberKind(kind, availableKindIds.value);
}

async function applyPreset(id) {
  const preset = orderedPresets.value.find((candidate) => candidate.id === id);
  if (!preset || preset.availability?.available === false) return;
  const saved = await saveTemplateSelection(
    preset.kind,
    preset.id,
    props.slotDefaults[preset.kind],
  );
  if (saved) browsedPresetIds[preset.kind] = id;
}

async function saveAppearance(settings) {
  await saveSlotSettings(
    activeKind.value,
    settings,
    props.slotDefaults[activeKind.value],
  );
}

async function saveRuntimeSettings(settings) {
  await updateSettings(settings);
}

onMounted(async () => {
  await initializeOutput();
  await refreshOutputStatus();
  await loadSlots(props.slotDefaults);
  await refreshProjection();
  for (const definition of props.slotDefinitions) {
    const templateId = outputState.slots[definition.id]?.templateId;
    if (templateId) browsedPresetIds[definition.id] = templateId;
  }
});
</script>

<template>
  <div class="obs-output-workspace">
    <header class="obs-output-workspace__modebar">
      <ObsOutputTabs
        :items="pages"
        :active-id="activePage"
        aria-label="OBS 輸出頁面"
        tab-id-prefix="obs-output"
        panel-id-prefix="obs-output"
        variant="panel"
        @update:active-id="selectPage"
      />
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
        :preview-scene="previewScene"
        :active-kind="activeKind"
        :selected-preset-id="browsedPreset?.id ?? null"
        :applied-preset-ids="appliedPresetIds"
        :is-applying="outputState.isSavingSlot"
        @update:active-kind="selectKind"
        @update:selected-preset-id="selectPreset"
        @apply-preset="applyPreset"
        @open-workbench="selectPage('workbench')"
      />
    </section>

    <section
      v-if="activePage === 'workbench'"
      id="obs-output-workbench-panel"
      class="obs-output-workspace__panel"
      role="tabpanel"
      aria-labelledby="obs-output-workbench-tab"
    >
      <ObsSlotWorkbench
        :preset="appliedPreset"
        :output-slot="activeSlot"
        :active-kind="activeKind"
        :slot-definitions="slotDefinitions"
        :appearance-options="appearanceOptions"
        :output-status="outputState.status"
        :preview-url="workbenchUrls.previewUrl"
        :obs-url="workbenchUrls.obsUrl"
        :output-error="outputState.error"
        :is-saving="outputState.isSavingSlot"
        @update:active-kind="selectKind"
        @save-settings="saveAppearance"
        @open-gallery="selectPage('gallery')"
        @refresh-projection="refreshProjection"
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
        :busy="runtimeBusy"
        :error="outputState.error"
        @save="saveRuntimeSettings"
        @start="startOutput"
        @stop="stopOutput"
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

.obs-output-workspace__panel {
  min-height: 0;
  min-width: 0;
}

@media (max-width: 680px) {
  .obs-output-workspace__modebar {
    align-items: flex-start;
    flex-direction: column;
  }

  :deep(.obs-output-tabs) {
    max-width: 100%;
  }
}
</style>
