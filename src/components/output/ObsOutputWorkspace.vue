<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { useOutputRuntimeContext } from '../../composables/useOutputRuntimeContext.js';
import { useOutputWorkspaceNavigation } from '../../composables/useOutputWorkspaceNavigation.js';
import { useOutputAppearanceAutosave } from '../../composables/output/useOutputAppearanceAutosave.js';
import { Settings } from '../../icons/index.js';
import { buildAllOutputSlotUrls } from '../../utils/outputRoutes.js';
import ObsOutputRuntimeStatus from './ObsOutputRuntimeStatus.vue';
import ObsTemplateGallery from './ObsTemplateGallery.vue';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';
import AppFolderPage from '../layout/AppFolderPage.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTabs from '../ui/UiTabs.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
  previewScene: { type: Object, default: () => ({}) },
  slotDefinitions: { type: Array, default: () => [] },
  slotDefaults: { type: Object, default: () => ({}) },
});

function orderPresets(presets) {
  return [...presets].sort((a, b) => {
    const orderDelta = (a.order ?? 100) - (b.order ?? 100);
    return orderDelta || a.name.localeCompare(b.name);
  });
}

const orderedPresets = computed(() => orderPresets(props.presets));
const modeItems = [
  { id: 'workbench', label: '編輯' },
  { id: 'gallery', label: '模板' },
];
const kindTabs = computed(() =>
  props.slotDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
  })),
);
const availableKindIds = computed(() =>
  props.slotDefinitions.map((definition) => definition.id),
);
const {
  activePage,
  activeKind,
  previewBackdrop,
  showLyricsGuide,
  selectPage: rememberPage,
  selectKind: rememberKind,
  ensureAvailableKind,
  selectPreviewBackdrop,
  setLyricsGuideVisible,
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
  saveRecentColor,
  saveSlotSettings,
  saveTemplateSelection,
  toggleSavedColor,
} = useOutputRuntimeContext();
const appearanceAutosave = useOutputAppearanceAutosave({
  save: ({ kind, settings }) =>
    saveSlotSettings(kind, settings, props.slotDefaults[kind]),
});
const appearanceSaveStatus = appearanceAutosave.status;
const { openSettings } = useAppView();

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
        presets.find((preset) => preset.kind === definition.id)?.id ??
        outputState.slots[definition.id]?.templateId ??
        props.slotDefaults[definition.id]?.templateId ??
        null;
    }
  }
});

function selectPreset(id) {
  const preset = orderedPresets.value.find((candidate) => candidate.id === id);
  if (!preset || !rememberKind(preset.kind, availableKindIds.value)) return;
  browsedPresetIds[preset.kind] = id;
}

async function selectPage(page) {
  if (page !== activePage.value && activePage.value === 'workbench') {
    const flushed = await appearanceAutosave.flush();
    if (!flushed) return false;
  }
  return rememberPage(page);
}

async function selectKind(kind) {
  if (kind !== activeKind.value) {
    const flushed = await appearanceAutosave.flush();
    if (!flushed) return false;
  }
  return rememberKind(kind, availableKindIds.value);
}

async function applyPreset(id) {
  const preset = orderedPresets.value.find((candidate) => candidate.id === id);
  if (!preset || preset.availability?.available === false) return;
  const flushed = await appearanceAutosave.flush();
  if (!flushed) return;
  const saved = await saveTemplateSelection(
    preset.kind,
    preset.id,
    props.slotDefaults[preset.kind],
  );
  if (saved) browsedPresetIds[preset.kind] = id;
}

function queueAppearanceSave(change) {
  if (!change?.settings) return Promise.resolve(false);
  return appearanceAutosave.schedule(
    {
      kind: activeKind.value,
      settings: change.settings,
    },
    { immediate: change.mode === 'immediate' },
  );
}

onMounted(async () => {
  await initializeOutput();
  await refreshOutputStatus();
  await loadSlots(props.slotDefaults);
  await refreshProjection();
});

onBeforeUnmount(() => {
  void appearanceAutosave.flush();
});
</script>

<template>
  <AppFolderPage mode="workspace" body-label="輸出工作區">
    <template #header>
      <div class="obs-output-workspace__header">
        <UiTabs
          class="obs-output-workspace__kinds"
          :items="kindTabs"
          :active-id="activeKind"
          aria-label="輸出畫面"
          tab-id-prefix="output-kind"
          panel-id-prefix="output-kind"
          variant="bar"
          @update:active-id="selectKind"
        />
        <div class="obs-output-workspace__header-end">
          <UiSegmentedControl
            :items="modeItems"
            :model-value="activePage"
            aria-label="編輯或挑選模板"
            @update:model-value="selectPage"
          />
          <ObsOutputRuntimeStatus
            :output-status="outputState.status"
            :busy="runtimeBusy"
            @start="startOutput"
            @stop="stopOutput"
          />
          <UiIconButton
            :icon="Settings"
            label="輸出設定"
            @click="openSettings('output')"
          />
        </div>
      </div>
    </template>

    <div
      :id="`output-kind-${activeKind}-panel`"
      class="obs-output-workspace"
      role="tabpanel"
      :aria-labelledby="`output-kind-${activeKind}-tab`"
    >
      <section
        v-show="activePage === 'gallery'"
        id="obs-output-gallery-panel"
        class="obs-output-workspace__panel"
      >
        <ObsTemplateGallery
          :presets="orderedPresets"
          :template-groups="templateGroups"
          :preview-scene="previewScene"
          :active-kind="activeKind"
          :selected-preset-id="browsedPreset?.id ?? null"
          :applied-preset-ids="appliedPresetIds"
          :is-applying="outputState.isSavingSlot"
          @update:selected-preset-id="selectPreset"
          @apply-preset="applyPreset"
        />
      </section>

      <section
        v-if="activePage === 'workbench'"
        id="obs-output-workbench-panel"
        class="obs-output-workspace__panel"
      >
        <ObsSlotWorkbench
          :preset="appliedPreset"
          :output-slot="activeSlot"
          :active-kind="activeKind"
          :preview-url="workbenchUrls.previewUrl"
          :obs-url="workbenchUrls.obsUrl"
          :preview-backdrop="previewBackdrop"
          :show-lyrics-guide="showLyricsGuide"
          :output-error="outputState.error || outputState.preferenceError"
          :recent-colors="outputState.preferences.recentColors"
          :saved-colors="outputState.preferences.savedColors"
          :save-status="appearanceSaveStatus"
          @update:preview-backdrop="selectPreviewBackdrop"
          @update:show-lyrics-guide="setLyricsGuideVisible"
          @change-settings="queueAppearanceSave"
          @commit-color="saveRecentColor"
          @toggle-saved-color="toggleSavedColor"
          @retry-save="appearanceAutosave.retry"
          @refresh-projection="refreshProjection"
        />
      </section>
    </div>
  </AppFolderPage>
</template>

<style scoped>
.obs-output-workspace {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.obs-output-workspace__header {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3) var(--ui-space-4);
}

.obs-output-workspace__header-end {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  margin-inline-start: auto;
}

.obs-output-workspace__kinds.ui-tabs--bar {
  width: auto;
}

.obs-output-workspace__panel {
  min-height: 0;
  min-width: 0;
}
</style>
