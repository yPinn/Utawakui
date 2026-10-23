<script setup>
import {
  computed,
  onBeforeUnmount,
  reactive,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Check, CircleAlert, Loader2 } from '../../icons/index.js';
import {
  isOutputLocalFont,
  sanitizeOutputAppearanceSetting,
} from '../../../shared/outputAppearance.mjs';
import { normalizeLyricsPresentationPolicyId } from '../../../shared/presentation/lyricsPresentationPolicies.mjs';
import {
  normalizeCaptureSizeId,
  supportedCaptureSizeIdsForTemplate,
} from '../../constants/outputCaptureSizes.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsOverlayPreview from './ObsOverlayPreview.vue';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsPropertySection from './ObsPropertySection.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  sideWidth: { type: Number, default: null },
  sideCollapsed: { type: Boolean, default: false },
  compactSideOpen: { type: Boolean, default: false },
  preset: { type: Object, default: null },
  outputSlot: { type: Object, default: null },
  activeKind: { type: String, default: null },
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
  'update:sideWidth',
  'update:sideCollapsed',
  'update:compactSideOpen',
  'update:previewBackdrop',
  'update:showLyricsGuide',
  'changeSettings',
  'commitColor',
  'toggleSavedColor',
  'retrySave',
  'refreshProjection',
]);

const draft = reactive({ captureSize: 'small' });
const tools = useTemplateRef('tools');

const appearanceFields = computed(() => props.preset?.appearanceFields ?? []);
const presentationFields = computed(
  () => props.preset?.presentationFields ?? [],
);
function configurationFieldRank(field, key, fallback) {
  return Number.isFinite(field?.[key]) ? field[key] : fallback;
}

function sortConfigurationFields(fields) {
  return [...fields].sort((left, right) => {
    const groupDelta =
      configurationFieldRank(left, 'groupOrder', 100) -
      configurationFieldRank(right, 'groupOrder', 100);
    if (groupDelta !== 0) return groupDelta;
    const fieldDelta =
      configurationFieldRank(left, 'order', 100) -
      configurationFieldRank(right, 'order', 100);
    if (fieldDelta !== 0) return fieldDelta;
    return String(left.key).localeCompare(String(right.key));
  });
}

const templateFields = computed(() =>
  sortConfigurationFields([
    ...appearanceFields.value,
    ...presentationFields.value,
  ]),
);
const elementTargets = computed(() => props.preset?.elementTargets ?? []);
const configurationFields = computed(() => [
  ...templateFields.value,
  ...elementTargets.value.flatMap(({ fields }) => fields),
]);
const selectedTargetId = shallowRef('template');
const selectedTarget = computed(() =>
  elementTargets.value.find(({ id }) => id === selectedTargetId.value),
);
const targetOptions = computed(() => [
  { value: 'template', label: '整個模板' },
  ...elementTargets.value.map(({ id, label }) => ({ value: id, label })),
]);
const visibleFields = computed(() =>
  selectedTarget.value
    ? sortConfigurationFields(selectedTarget.value.fields)
    : templateFields.value,
);
const configurationFieldGroups = computed(() => {
  const groups = new Map();
  for (const field of visibleFields.value) {
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
const templateId = computed(
  () => props.preset?.id ?? props.outputSlot?.templateId ?? null,
);
watch(templateId, () => {
  selectedTargetId.value = 'template';
});
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
const saveStatusIcon = computed(() => {
  if (props.saveStatus === 'error') return CircleAlert;
  if (props.saveStatus === 'saved') return Check;
  return Loader2;
});
const saveStatusTone = computed(() => {
  if (props.saveStatus === 'error') return 'danger';
  if (props.saveStatus === 'saved') return 'success';
  return 'accent';
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

function isFieldModified(field) {
  return draft[field.key] !== field.defaultValue;
}

const isConfigurationAtDefaults = computed(() =>
  configurationFields.value.every((field) => !isFieldModified(field)),
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

function resetFields(fields) {
  for (const field of fields) {
    draft[field.key] = field.defaultValue;
  }
  emitSettingsChange('immediate');
}

function resetAppearance() {
  resetFields(configurationFields.value);
}
</script>

<template>
  <ObsOutputSplitLayout
    aria-label="輸出工作台"
    side-label="輸出設定"
    side-variant="inspector"
    :side-width="sideWidth"
    :side-collapsed="sideCollapsed"
    :compact-side-open="compactSideOpen"
    @update:side-width="emit('update:sideWidth', $event)"
    @update:side-collapsed="emit('update:sideCollapsed', $event)"
    @update:compact-side-open="emit('update:compactSideOpen', $event)"
  >
    <template #tools
      ><div ref="tools" class="obs-slot-workbench__tools"
    /></template>
    <template #main>
      <main class="obs-slot-workbench__canvas">
        <UiScrollRegion
          class="obs-slot-workbench__stage"
          axis="both"
          viewport-class="obs-slot-workbench__stage-viewport"
        >
          <ObsOverlayPreview
            :tools-target="tools"
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
            <UiStatusIcon
              :icon="saveStatusIcon"
              :tone="saveStatusTone"
              :spinning="saveStatusIcon === Loader2"
              :label="saveStatusLabel"
            />
          </span>
          <UiButton v-if="saveStatus === 'error'" @click="emit('retrySave')">
            重試
          </UiButton>
        </div>
      </header>
    </template>

    <template #side>
      <UiNotice
        v-if="outputError"
        class="obs-slot-workbench__notice"
        tone="danger"
        title="輸出未更新"
        :message="outputError"
        compact
      />

      <div v-if="elementTargets.length" class="obs-slot-workbench__target">
        <ObsAppearanceControlRow
          control-id="output-appearance-target"
          label="調整對象"
          :labels-control="false"
        >
          <UiSelect
            id="output-appearance-target"
            label="調整對象"
            :model-value="selectedTargetId"
            :options="targetOptions"
            label-hidden
            @update:model-value="selectedTargetId = $event"
          />
        </ObsAppearanceControlRow>
      </div>

      <ObsPropertySection
        v-for="group in configurationFieldGroups"
        :key="group.id"
        :title="group.label"
        :modified="group.fields.some(isFieldModified)"
        @reset="resetFields(group.fields)"
      >
        <template #description>
          <UiHint v-if="group.id === 'template-presentation'">
            只調整此模板的歌詞呈現。製作資訊請在歌詞的「共用文字處理」逐行確認；來源、對唱與和聲不會在此處改寫。
          </UiHint>
          <UiHint
            v-if="
              group.id === 'template-presentation' &&
              draft.lyricsPresentationPolicyId === 'broadcast-compact'
            "
          >
            轉播精簡會省略部分重複詞與語助詞。需要保留實唱與和聲文字時，請選擇平衡分行或忠實原文。
          </UiHint>
        </template>
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
          :modified="isFieldModified(field)"
          @update:model-value="updateAppearanceField(field, $event)"
          @commit="commitSettings"
          @commit-color="emit('commitColor', $event)"
          @toggle-saved-color="emit('toggleSavedColor', $event)"
        />
      </ObsPropertySection>
    </template>

    <template #side-footer>
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
  grid-template-rows: minmax(0, 1fr);
  background: var(--ui-color-canvas);
}

.obs-slot-workbench__tools {
  min-width: 0;
  flex: 1;
}

.obs-slot-workbench__inspector-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-slot-workbench__notice {
  margin-block: var(--ui-space-3);
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
.obs-slot-workbench__target {
  padding-block: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-slot-workbench__reset {
  justify-self: start;
  margin-block-start: var(--ui-space-2);
}

.obs-slot-workbench__inspector-header {
  padding-block: var(--ui-space-1);
}

.obs-slot-workbench__save-state {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  white-space: nowrap;
}

.obs-slot-workbench__title {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.obs-slot-workbench__title {
  font-size: var(--ui-type-title-size);
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
