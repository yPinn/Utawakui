<script setup>
import { computed, reactive, watch } from 'vue';
import { Palette } from '../../icons/index.js';
import { sanitizeOutputAppearanceSetting } from '../../../shared/outputAppearance.mjs';
import {
  captureSizeForKind,
  normalizeCaptureSizeId,
  supportedCaptureSizeIdsForTemplate,
} from '../../constants/outputCaptureSizes.js';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsOverlayPreview from './ObsOverlayPreview.vue';
import ObsOutputBrief from './ObsOutputBrief.vue';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsOutputTabs from './ObsOutputTabs.vue';
import UiButton from '../ui/UiButton.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  outputSlot: { type: Object, default: null },
  activeKind: { type: String, default: null },
  slotDefinitions: { type: Array, default: () => [] },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  outputError: { type: String, default: '' },
  saveStatus: {
    type: String,
    default: 'saved',
    validator: (value) =>
      ['pending', 'saving', 'saved', 'error'].includes(value),
  },
});

const emit = defineEmits([
  'update:activeKind',
  'changeSettings',
  'retrySave',
  'openGallery',
  'refreshProjection',
]);

const draft = reactive({ captureSize: 'small' });

const appearanceFields = computed(() => props.preset?.appearanceFields ?? []);
const appearanceFieldGroups = computed(() => {
  const groups = new Map();
  for (const field of appearanceFields.value) {
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
const kindTabs = computed(() =>
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

function normalizedControlValue(field, settings) {
  const storedValue = sanitizeOutputAppearanceSetting(
    field.key,
    settings?.[field.key],
  );
  const allowedValues = Array.isArray(field.options)
    ? new Set(field.options.map((option) => option.id))
    : null;
  if (
    storedValue !== undefined &&
    (!allowedValues || allowedValues.has(storedValue))
  ) {
    return storedValue;
  }
  return field.defaultValue;
}

const isAppearanceAtDefaults = computed(() =>
  appearanceFields.value.every(
    (field) => draft[field.key] === field.defaultValue,
  ),
);

const capturePreset = computed(() =>
  captureSizeForKind(props.activeKind, draft.captureSize, templateId.value),
);
const isWidgetCapture = computed(() => props.activeKind !== 'lyrics');

watch(
  [
    () => props.activeKind,
    () => props.outputSlot,
    templateId,
    () => props.saveStatus,
  ],
  ([activeKind, outputSlot, activeTemplateId, saveStatus]) => {
    if (saveStatus !== 'saved') return;
    for (const field of appearanceFields.value) {
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

function settingsSnapshot() {
  return {
    ...Object.fromEntries(
      appearanceFields.value.map(({ key }) => [key, draft[key]]),
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
  for (const field of appearanceFields.value) {
    draft[field.key] = field.defaultValue;
  }
  emitSettingsChange('immediate');
}
</script>

<template>
  <ObsOutputSplitLayout
    aria-label="OBS 外觀工作台"
    side-label="外觀設定"
    side-variant="inspector"
  >
    <template #main>
      <main class="obs-slot-workbench__canvas">
        <header class="obs-slot-workbench__canvas-header">
          <ObsOutputTabs
            :items="kindTabs"
            :active-id="activeKind"
            aria-label="目前編輯的 Overlay 類型"
            tab-id-prefix="output-workbench-kind"
            variant="bar"
            @update:active-id="emit('update:activeKind', $event)"
          />
          <UiButton :icon="Palette" @click="emit('openGallery')">
            模板
          </UiButton>
        </header>

        <div class="obs-slot-workbench__stage">
          <section
            class="obs-slot-workbench__capture-guide"
            aria-label="OBS 擷取尺寸建議"
          >
            <span class="obs-slot-workbench__capture-guide-label">
              OBS 擷取建議
            </span>
            <strong class="obs-slot-workbench__capture-dimensions">
              {{ capturePreset.width }} × {{ capturePreset.height }} px
            </strong>
            <span class="obs-slot-workbench__capture-guide-copy">
              {{
                isWidgetCapture
                  ? `${capturePreset.label}型 Widget；僅顯示此模板支援的尺寸`
                  : 'Lyrics 固定 FHD'
              }}
            </span>
          </section>
          <ObsOverlayPreview
            :preset="preset"
            :active-kind="activeKind"
            :capture-size="draft.captureSize"
            :supported-capture-sizes="supportedCaptureSizes"
            :preview-url="previewUrl"
            :obs-url="obsUrl"
            @update:capture-size="updateCaptureSize"
            @refresh-projection="emit('refreshProjection')"
          />
        </div>
      </main>
    </template>

    <template #side>
      <header class="obs-slot-workbench__inspector-header">
        <h2 class="obs-slot-workbench__title">
          {{ preset?.name ?? '未選擇模板' }}
        </h2>
        <div class="obs-slot-workbench__save-state" :data-state="saveStatus">
          <span role="status" aria-live="polite" aria-atomic="true">
            {{ saveStatusLabel }}
          </span>
          <UiButton v-if="saveStatus === 'error'" @click="emit('retrySave')">
            重試
          </UiButton>
        </div>
      </header>

      <ObsOutputBrief
        :preset="preset"
        :output-status="outputStatus"
        :error="outputError"
      />

      <section
        v-for="group in appearanceFieldGroups"
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
            @update:model-value="updateAppearanceField(field, $event)"
            @commit="commitSettings"
          />
        </div>
      </section>

      <UiButton
        v-if="appearanceFields.length > 0"
        class="obs-slot-workbench__reset"
        :disabled="isAppearanceAtDefaults"
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-items: stretch;
  justify-items: center;
  gap: var(--ui-space-3);
  overflow: auto;
}

.obs-slot-workbench__capture-guide {
  width: min(100%, var(--ui-output-workbench-stage-max-width));
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  align-self: start;
}

.obs-slot-workbench__capture-guide-label,
.obs-slot-workbench__capture-guide-copy {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-slot-workbench__capture-guide-label {
  font-weight: var(--ui-font-weight-strong);
  white-space: nowrap;
}

.obs-slot-workbench__capture-guide-copy {
  min-width: 0;
  margin-inline-start: auto;
  text-align: end;
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
  gap: var(--ui-space-1);
}

.obs-slot-workbench__title,
.obs-slot-workbench__section-title {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-slot-workbench__title {
  font-size: var(--ui-font-size-lg);
}

.obs-slot-workbench__section-title {
  font-size: var(--ui-font-size-md);
}

.obs-slot-workbench__fields {
  min-width: 0;
  display: grid;
}

.obs-slot-workbench__capture-dimensions {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@container (width < 48rem) {
  .obs-slot-workbench__stage {
    overflow: visible;
  }

  .obs-slot-workbench__capture-guide {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .obs-slot-workbench__capture-guide-copy {
    flex-basis: 100%;
    margin-inline-start: 0;
    text-align: start;
  }
}
</style>
