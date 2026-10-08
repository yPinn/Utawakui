<script setup>
import { computed, onBeforeUnmount, reactive, shallowRef, watch } from 'vue';
import { Palette } from '../../icons/index.js';
import {
  isOutputLocalFont,
  sanitizeOutputAppearanceSetting,
} from '../../../shared/outputAppearance.mjs';
import { normalizeLyricsPresentationPolicyId } from '../../../shared/presentation/lyricsPresentationPolicies.mjs';
import {
  normalizeCaptureSizeId,
  supportedCaptureSizeIdsForTemplate,
} from '../../constants/outputCaptureSizes.js';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsOverlayPreview from './ObsOverlayPreview.vue';
import ObsOutputRuntimeStatus from './ObsOutputRuntimeStatus.vue';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import UiButton from '../ui/UiButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  outputSlot: { type: Object, default: null },
  activeKind: { type: String, default: null },
  slotDefinitions: { type: Array, default: () => [] },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  previewBackdrop: { type: String, default: 'checker' },
  showLyricsGuide: { type: Boolean, default: true },
  outputError: { type: String, default: '' },
  recentColors: { type: Array, default: () => [] },
  savedColors: { type: Array, default: () => [] },
  saveStatus: {
    type: String,
    default: 'saved',
    validator: (value) =>
      ['pending', 'saving', 'saved', 'error'].includes(value),
  },
});

const emit = defineEmits([
  'update:activeKind',
  'update:previewBackdrop',
  'update:showLyricsGuide',
  'changeSettings',
  'commitColor',
  'toggleSavedColor',
  'retrySave',
  'openGallery',
  'refreshProjection',
]);

const draft = reactive({ captureSize: 'small' });

const appearanceFields = computed(() => props.preset?.appearanceFields ?? []);
const presentationFields = computed(
  () => props.preset?.presentationFields ?? [],
);
function configurationFieldRank(field, key, fallback) {
  return Number.isFinite(field?.[key]) ? field[key] : fallback;
}

const configurationFields = computed(() =>
  [...appearanceFields.value, ...presentationFields.value].sort(
    (left, right) => {
      const groupDelta =
        configurationFieldRank(left, 'groupOrder', 100) -
        configurationFieldRank(right, 'groupOrder', 100);
      if (groupDelta !== 0) return groupDelta;
      const fieldDelta =
        configurationFieldRank(left, 'order', 100) -
        configurationFieldRank(right, 'order', 100);
      if (fieldDelta !== 0) return fieldDelta;
      return String(left.key).localeCompare(String(right.key));
    },
  ),
);
const configurationFieldGroups = computed(() => {
  const groups = new Map();
  for (const field of configurationFields.value) {
    const id = field.group ?? 'appearance';
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: field.groupLabel ?? '外觀',
        fields: [],
      });
    }
    groups.get(id).fields.push(field);
  }
  return [...groups.values()];
});
const kindOptions = computed(() =>
  props.slotDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
  })),
);
const templateId = computed(
  () => props.preset?.id ?? props.outputSlot?.templateId ?? null,
);
const supportedCaptureSizes = computed(() =>
  supportedCaptureSizeIdsForTemplate(templateId.value, props.activeKind),
);
const saveStatusLabel = computed(() => {
  if (props.saveStatus === 'error') return '儲存失敗';
  if (props.saveStatus === 'pending' || props.saveStatus === 'saving') {
    return '儲存中…';
  }
  return '已儲存';
});
const showSaveStatus = shallowRef(props.saveStatus !== 'saved');
let saveStatusTimer = null;

function normalizedControlValue(field, settings) {
  if (field.settingKind === 'lyrics-presentation') {
    return normalizeLyricsPresentationPolicyId(
      templateId.value,
      settings?.[field.key],
    );
  }
  const storedValue = sanitizeOutputAppearanceSetting(
    field.key,
    settings?.[field.key],
    { templateId: templateId.value },
  );
  const allowedValues = Array.isArray(field.options)
    ? new Set(field.options.map((option) => option.id))
    : null;
  if (
    storedValue !== undefined &&
    (isOutputLocalFont(storedValue) ||
      !allowedValues ||
      allowedValues.has(storedValue))
  ) {
    return storedValue;
  }
  return field.defaultValue;
}

const isConfigurationAtDefaults = computed(() =>
  configurationFields.value.every(
    (field) => draft[field.key] === field.defaultValue,
  ),
);

watch(
  [
    () => props.activeKind,
    () => props.outputSlot,
    templateId,
    () => props.saveStatus,
  ],
  ([activeKind, outputSlot, activeTemplateId, saveStatus]) => {
    if (saveStatus !== 'saved') return;
    for (const field of configurationFields.value) {
      draft[field.key] = normalizedControlValue(field, outputSlot?.settings);
    }
    draft.captureSize = normalizeCaptureSizeId(
      activeKind,
      outputSlot?.settings?.captureSize,
      activeTemplateId,
    );
  },
  { immediate: true, deep: true },
);

watch(
  () => props.saveStatus,
  (status, previousStatus) => {
    clearTimeout(saveStatusTimer);
    if (status !== 'saved') {
      showSaveStatus.value = true;
      return;
    }
    if (previousStatus === undefined || previousStatus === 'saved') {
      showSaveStatus.value = false;
      return;
    }
    showSaveStatus.value = true;
    saveStatusTimer = setTimeout(() => {
      showSaveStatus.value = false;
    }, 1800);
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(saveStatusTimer));

function settingsSnapshot() {
  return {
    ...Object.fromEntries(
      configurationFields.value.map(({ key }) => [key, draft[key]]),
    ),
    captureSize: draft.captureSize,
  };
}

function emitSettingsChange(mode = 'debounced') {
  emit('changeSettings', {
    settings: settingsSnapshot(),
    mode,
  });
}

function updateAppearanceField(field, value) {
  if (draft[field.key] === value) return;
  draft[field.key] = value;
  emitSettingsChange(field.control === 'select' ? 'immediate' : 'debounced');
}

function updateCaptureSize(value) {
  if (draft.captureSize === value) return;
  draft.captureSize = value;
  emitSettingsChange('immediate');
}

function commitSettings() {
  emitSettingsChange('immediate');
}

function resetAppearance() {
  for (const field of configurationFields.value) {
    draft[field.key] = field.defaultValue;
  }
  emitSettingsChange('immediate');
}
</script>

<template>
  <ObsOutputSplitLayout
    aria-label="輸出工作台"
    side-label="輸出設定"
    side-variant="inspector"
  >
    <template #main>
      <main class="obs-slot-workbench__canvas">
        <header class="obs-slot-workbench__canvas-header">
          <UiSegmentedControl
            :items="kindOptions"
            :model-value="activeKind"
            aria-label="目前編輯的 Overlay 類型"
            @update:model-value="emit('update:activeKind', $event)"
          />
          <UiButton :icon="Palette" @click="emit('openGallery')">
            更換模板
          </UiButton>
        </header>

        <UiScrollRegion
          class="obs-slot-workbench__stage"
          axis="both"
          viewport-class="obs-slot-workbench__stage-viewport"
        >
          <ObsOverlayPreview
            :preset="preset"
            :active-kind="activeKind"
            :capture-size="draft.captureSize"
            :supported-capture-sizes="supportedCaptureSizes"
            :preview-url="previewUrl"
            :obs-url="obsUrl"
            :preview-backdrop="previewBackdrop"
            :show-lyrics-guide="showLyricsGuide"
            @update:capture-size="updateCaptureSize"
            @update:preview-backdrop="emit('update:previewBackdrop', $event)"
            @update:show-lyrics-guide="emit('update:showLyricsGuide', $event)"
            @refresh-projection="emit('refreshProjection')"
          />
        </UiScrollRegion>
      </main>
    </template>

    <template #side-header>
      <header class="obs-slot-workbench__inspector-header">
        <h2 class="obs-slot-workbench__title">
          {{ preset?.name ?? '未選擇模板' }}
        </h2>
        <div
          v-if="showSaveStatus"
          class="obs-slot-workbench__save-state"
          :data-state="saveStatus"
        >
          <span role="status" aria-live="polite" aria-atomic="true">
            {{ saveStatusLabel }}
          </span>
          <UiButton v-if="saveStatus === 'error'" @click="emit('retrySave')">
            重試
          </UiButton>
        </div>
      </header>
    </template>

    <template #side>
      <ObsOutputRuntimeStatus
        :output-status="outputStatus"
        :error="outputError"
      />

      <section
        v-for="group in configurationFieldGroups"
        :key="group.id"
        class="obs-slot-workbench__section"
      >
        <h3 class="obs-slot-workbench__section-title">{{ group.label }}</h3>
        <div class="obs-slot-workbench__fields">
          <ObsAppearanceField
            v-for="field in group.fields"
            :key="field.key"
            :field="field"
            :model-value="draft[field.key]"
            :recent-colors="recentColors"
            :saved-colors="savedColors"
            :disabled="
              field.key === 'lookAmount' && draft.paletteId === 'original'
            "
            @update:model-value="updateAppearanceField(field, $event)"
            @commit="commitSettings"
            @commit-color="emit('commitColor', $event)"
            @toggle-saved-color="emit('toggleSavedColor', $event)"
          />
        </div>
      </section>

      <UiButton
        v-if="configurationFields.length > 0"
        class="obs-slot-workbench__reset"
        :disabled="isConfigurationAtDefaults"
        @click="resetAppearance"
      >
        恢復模板預設
      </UiButton>
    </template>
  </ObsOutputSplitLayout>
</template>

<style scoped>
.obs-slot-workbench__canvas {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.obs-slot-workbench__canvas-header,
.obs-slot-workbench__inspector-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-slot-workbench__stage {
  min-height: 0;
  min-width: 0;
}

.obs-slot-workbench__stage :deep(.obs-slot-workbench__stage-viewport) {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
  justify-items: center;
}

.obs-slot-workbench__inspector-header,
.obs-slot-workbench__section {
  padding-block: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-slot-workbench__reset {
  justify-self: start;
  margin-block-start: var(--ui-space-2);
}

.obs-slot-workbench__inspector-header {
  padding-block-start: 0;
}

.obs-slot-workbench__save-state {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
}

.obs-slot-workbench__save-state[data-state='pending'],
.obs-slot-workbench__save-state[data-state='saving'] {
  color: var(--ui-color-accent);
}

.obs-slot-workbench__save-state[data-state='error'] {
  color: var(--ui-color-danger);
}

.obs-slot-workbench__section {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-slot-workbench__title,
.obs-slot-workbench__section-title {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.obs-slot-workbench__title {
  font-size: var(--ui-font-size-lg);
}

.obs-slot-workbench__section-title {
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-slot-workbench__fields {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}
</style>
