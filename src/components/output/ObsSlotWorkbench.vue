<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import {
  Check,
  CircleAlert,
  Loader2,
  RotateCcw,
  Video,
} from '../../icons/index.js';
import {
  activePhantomPortraitSet,
  canAddPhantomPortraitSet,
  PHANTOM_PORTRAIT_DEFAULTS,
  PHANTOM_PORTRAIT_FIELDS,
  isOutputLocalFont,
  migrateLegacyPhantomPortraitSettings,
  sanitizePhantomPortraitSets,
  sanitizeOutputAppearanceSetting,
} from '../../../shared/outputAppearance.mjs';
import { normalizeLyricsPresentationPolicyId } from '../../../shared/presentation/lyricsPresentationPolicies.mjs';
import {
  normalizeCaptureSizeId,
  supportedCaptureSizeIdsForTemplate,
} from '../../constants/outputCaptureSizes.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsPhantomPortraitEditor from './ObsPhantomPortraitEditor.vue';
import ObsPhantomPortraitGrid from './ObsPhantomPortraitGrid.vue';
import ObsFisheyeCameraControls from './ObsFisheyeCameraControls.vue';
import ObsOutputColorPalette from './ObsOutputColorPalette.vue';
import ObsOverlayPreview from './ObsOverlayPreview.vue';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsPropertySection from './ObsPropertySection.vue';
import { useOutputElementTarget } from '../../composables/output/useOutputElementTarget.js';
import { usePlayer } from '../../composables/usePlayer.js';
import UiButton from '../ui/UiButton.vue';
import UiFolderInspector from '../ui/UiFolderInspector.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiNotice from '../ui/UiNotice.vue';
import { t } from '../../utils/i18n.js';
import { outputInspectorTabs } from '../../utils/outputInspectorTabs.js';
import { phantomPortraitColorToken } from './phantomPortraitPalette.js';

const props = defineProps({
  sideCollapsed: { type: Boolean, default: false },
  compactSideOpen: { type: Boolean, default: false },
  preset: { type: Object, default: null },
  outputSlot: { type: Object, default: null },
  activeKind: { type: String, default: null },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  previewBackdrop: { type: String, default: 'checker' },
  lyricsPreviewMode: { type: String, default: 'performer' },
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
  'update:sideCollapsed',
  'update:compactSideOpen',
  'update:previewBackdrop',
  'update:lyricsPreviewMode',
  'changeSettings',
  'commitColor',
  'toggleSavedColor',
  'retrySave',
  'refreshProjection',
]);

const draft = reactive({ captureSize: 'small' });
const portraitSets = shallowRef({ activeId: '', items: [] });
const portraitEditor = shallowRef(null);
const portraitGrid = useTemplateRef('portraitGrid');
const selectedPortraitSet = computed(() =>
  activePhantomPortraitSet(portraitSets.value),
);
const sideWidth = shallowRef(null);
const tools = useTemplateRef('tools');
const { state: player } = usePlayer();

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
const portraitFields = computed(() =>
  templateFields.value.filter(({ group }) => group === 'portrait'),
);
const templateId = computed(
  () => props.preset?.id ?? props.outputSlot?.templateId ?? null,
);
const {
  elementIds,
  selectedTarget,
  selectedTargetId,
  selectTarget,
  targetOptions,
} = useOutputElementTarget({ elementTargets, templateId });
const visibleFields = computed(() =>
  selectedTarget.value
    ? sortConfigurationFields(selectedTarget.value.fields)
    : templateFields.value.filter(
        ({ key, group }) =>
          (group !== 'portrait' || draft.phantomMode === 'side-card') &&
          (key !== 'phantomChatShape' || draft.phantomMode === 'chat') &&
          (key !== 'phantomCardStyle' || draft.phantomMode === 'side-card') &&
          (key !== 'phantomRansomFont' || draft.phantomMode === 'ransom'),
      ),
);
const activeColorFieldKey = shallowRef(null);
const colorFields = computed(() =>
  visibleFields.value.filter((field) => field.control === 'color'),
);
const activeColorField = computed(
  () =>
    colorFields.value.find(
      (field) => field.key === activeColorFieldKey.value,
    ) ?? colorFields.value[0],
);
watch(
  [templateId, selectedTargetId],
  () => {
    activeColorFieldKey.value = null;
  },
  { flush: 'sync' },
);
watch([templateId, () => draft.phantomMode], () => {
  portraitEditor.value = null;
});
const configurationFieldGroups = computed(() => {
  const groups = new Map();
  for (const field of visibleFields.value) {
    const id = field.group ?? 'appearance';
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: field.groupLabel ?? t('outputPanel.workbench.appearance'),
        fields: [],
      });
    }
    groups.get(id).fields.push(field);
  }
  return [...groups.values()];
});
const inspectorTabs = computed(() => {
  const tabs = outputInspectorTabs(visibleFields.value);
  if (templateId.value === 'fisheye-lens' && !selectedTarget.value) {
    const order = ['motion', 'display', 'arrangement', 'text', 'color'];
    tabs.sort(
      (left, right) => order.indexOf(left.id) - order.indexOf(right.id),
    );
    const motionIndex = tabs.findIndex(({ id }) => id === 'motion');
    tabs.splice(motionIndex + 1, 0, {
      id: 'camera-effects',
      icon: Video,
      label: t('outputPanel.cameraEffects.label'),
      groups: [],
    });
  }
  return tabs;
});
const useFolderInspector = computed(
  () =>
    inspectorTabs.value.length > 0 &&
    inspectorTabs.value.flatMap(({ groups }) =>
      groups.flatMap(({ fields }) => fields),
    ).length === visibleFields.value.length,
);
const supportedCaptureSizes = computed(() =>
  supportedCaptureSizeIdsForTemplate(templateId.value, props.activeKind),
);
const saveStatusLabel = computed(() => {
  if (props.saveStatus === 'error')
    return t('outputPanel.workbench.saveFailed');
  if (props.saveStatus === 'pending' || props.saveStatus === 'saving') {
    return t('outputPanel.workbench.saving');
  }
  return t('outputPanel.workbench.saved');
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
  return fieldValue(field) !== field.defaultValue;
}

function fieldValue(field) {
  return field.group === 'portrait' && selectedPortraitSet.value
    ? selectedPortraitSet.value[field.key]
    : draft[field.key];
}

function setFieldValue(field, value) {
  const selected = selectedPortraitSet.value;
  if (field.group !== 'portrait' || !selected) {
    draft[field.key] = value;
    return;
  }
  portraitSets.value = {
    ...portraitSets.value,
    items: portraitSets.value.items.map((item) =>
      item.id === selected.id ? { ...item, [field.key]: value } : item,
    ),
  };
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
    const settings =
      activeTemplateId === 'phantom-thieves'
        ? migrateLegacyPhantomPortraitSettings(outputSlot?.settings)
        : outputSlot?.settings;
    portraitSets.value = sanitizePhantomPortraitSets(
      settings?.phantomPortraitSets,
    );
    for (const field of configurationFields.value) {
      draft[field.key] = normalizedControlValue(field, settings);
    }
    draft.captureSize = normalizeCaptureSizeId(
      activeKind,
      settings?.captureSize,
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
    ...(templateId.value === 'phantom-thieves' && {
      phantomPortraitSets: portraitSets.value,
    }),
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
  if (fieldValue(field) === value) return;
  setFieldValue(field, value);
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

function applyPaletteColor(color) {
  const field = activeColorField.value;
  if (!field) return;
  setFieldValue(field, color);
  commitSettings();
  emit('commitColor', color);
}

function resetFields(fields) {
  for (const field of fields) {
    setFieldValue(field, field.defaultValue);
  }
  emitSettingsChange('immediate');
}

function resetAppearance() {
  portraitEditor.value = null;
  resetFields(configurationFields.value);
}

function selectPortraitSet(activeId) {
  if (activeId === portraitSets.value.activeId) return;
  portraitSets.value = { ...portraitSets.value, activeId };
  commitSettings();
}

function portraitEditorValues(values) {
  if (values.phantomPortraitColor || !tools.value) return values;
  const token = phantomPortraitColorToken(
    values.phantomArtistName || player.track?.artist,
    player.track?.id,
  );
  const color = getComputedStyle(tools.value).getPropertyValue(token).trim();
  return { ...values, phantomPortraitColor: color };
}

function startPortraitSet() {
  if (!canAddPhantomPortraitSet(portraitSets.value.items)) return;
  portraitEditor.value = {
    id: null,
    values: portraitEditorValues(PHANTOM_PORTRAIT_DEFAULTS),
  };
}

function editPortraitSet() {
  const selected = selectedPortraitSet.value;
  if (!selected) return;
  portraitEditor.value = {
    id: selected.id,
    values: portraitEditorValues(selected),
  };
}

async function closePortraitEditor(saved = false) {
  portraitEditor.value = null;
  await nextTick();
  portraitGrid.value?.focusAfterEdit(saved);
}

function savePortraitSet(values) {
  const editor = portraitEditor.value;
  if (!editor) return;
  const { items } = portraitSets.value;
  const fields = Object.fromEntries(
    PHANTOM_PORTRAIT_FIELDS.map((key) => [key, values[key]]),
  );
  if (editor.id === null) {
    if (!canAddPhantomPortraitSet(items)) return;
    const id = globalThis.crypto.randomUUID();
    portraitSets.value = { activeId: id, items: [...items, { id, ...fields }] };
  } else {
    portraitSets.value = {
      ...portraitSets.value,
      items: items.map((item) =>
        item.id === editor.id ? { ...item, ...fields } : item,
      ),
    };
  }
  commitSettings();
  if (fields.phantomPortraitColor !== editor.values.phantomPortraitColor) {
    emit('commitColor', fields.phantomPortraitColor);
  }
  closePortraitEditor(true);
}

function removePortraitSet() {
  const { activeId, items } = portraitSets.value;
  if (!activeId) return;
  portraitSets.value = {
    activeId: '',
    items: items.filter(({ id }) => id !== activeId),
  };
  commitSettings();
}
</script>

<template>
  <component
    :is="useFolderInspector ? UiFolderInspector : ObsOutputSplitLayout"
    v-model:side-width="sideWidth"
    class="obs-slot-workbench"
    :aria-label="t('outputPanel.workbench.label')"
    :side-label="t('outputPanel.workbench.side')"
    v-bind="
      useFolderInspector
        ? {
            items: inspectorTabs,
            tabsLabel: t('outputPanel.inspector.label'),
            class:
              'obs-output-folder-inspector obs-slot-workbench__folder-inspector',
          }
        : { sideVariant: 'inspector', resetWidthOnOpen: true }
    "
    :side-collapsed="sideCollapsed"
    :compact-side-open="compactSideOpen"
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
            :lyrics-preview-mode="lyricsPreviewMode"
            :element-ids="elementIds"
            :selected-element-id="selectedTargetId"
            @update:capture-size="updateCaptureSize"
            @update:preview-backdrop="emit('update:previewBackdrop', $event)"
            @update:lyrics-preview-mode="
              emit('update:lyricsPreviewMode', $event)
            "
            @refresh-projection="emit('refreshProjection')"
            @select-element="selectTarget"
          />
        </UiScrollRegion>
      </main>
    </template>

    <template #side-header>
      <div class="obs-slot-workbench__inspector-header">
        <h2 class="obs-slot-workbench__title">
          {{ preset?.name ?? t('outputPanel.workbench.noTemplate') }}
        </h2>
        <div
          v-if="showSaveStatus || configurationFields.length > 0"
          class="obs-slot-workbench__header-actions"
        >
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
              {{ t('outputPanel.workbench.retry') }}
            </UiButton>
          </div>
          <UiIconButton
            v-if="configurationFields.length > 0"
            class="obs-slot-workbench__reset"
            :icon="RotateCcw"
            :label="t('outputPanel.workbench.resetTemplate')"
            tooltip-placement="bottom"
            :disabled="isConfigurationAtDefaults"
            @click="resetAppearance"
          />
        </div>
      </div>
    </template>

    <template #side-top>
      <UiNotice
        v-if="outputError"
        class="obs-slot-workbench__notice"
        tone="danger"
        :title="t('outputPanel.workbench.notUpdated')"
        :message="outputError"
        compact
      />

      <div v-if="elementTargets.length" class="obs-slot-workbench__target">
        <ObsAppearanceControlRow
          control-id="output-appearance-target"
          :label="t('outputPanel.workbench.target')"
          :labels-control="false"
        >
          <UiSelect
            id="output-appearance-target"
            :label="t('outputPanel.workbench.target')"
            :model-value="selectedTargetId"
            :options="targetOptions"
            label-hidden
            @update:model-value="selectTarget"
          />
        </ObsAppearanceControlRow>
      </div>
    </template>
    <template #side="{ item, active }">
      <ObsFisheyeCameraControls
        v-if="item?.id === 'camera-effects' && active"
      />
      <ObsPhantomPortraitGrid
        v-if="item?.id === 'portrait'"
        v-show="!portraitEditor"
        ref="portraitGrid"
        :active="active && !portraitEditor"
        :items="portraitSets.items"
        :active-id="portraitSets.activeId"
        @select="selectPortraitSet"
        @add="startPortraitSet"
        @edit="editPortraitSet"
        @remove="removePortraitSet"
      />
      <ObsPhantomPortraitEditor
        v-if="item?.id === 'portrait' && portraitEditor"
        :fields="portraitFields"
        :values="portraitEditor.values"
        :is-new="portraitEditor.id === null"
        :recent-colors="recentColors"
        :saved-colors="savedColors"
        @save="savePortraitSet"
        @cancel="closePortraitEditor()"
        @toggle-saved-color="emit('toggleSavedColor', $event)"
      />
      <ObsPropertySection
        v-for="group in (item?.groups ?? configurationFieldGroups).filter(
          ({ id }) => id !== 'portrait',
        )"
        :key="group.id"
        :title="group.label"
        :modified="group.fields.some(isFieldModified)"
        @reset="resetFields(group.fields)"
      >
        <template #description>
          <UiHint v-if="group.id === 'template-presentation'">
            {{ t('outputPanel.workbench.presentationHint') }}
          </UiHint>
          <UiHint
            v-if="
              group.id === 'template-presentation' &&
              draft.lyricsPresentationPolicyId === 'broadcast-compact'
            "
          >
            {{ t('outputPanel.workbench.conciseHint') }}
          </UiHint>
          <UiHint
            v-if="group.fields.some(({ key }) => key === 'fisheyeGranularity')"
          >
            {{ t('outputPanel.workbench.fisheyeGranularityHint') }}
          </UiHint>
        </template>
        <ObsAppearanceField
          v-for="field in group.fields"
          :key="field.key"
          :field="field"
          :kinetic-material="draft.kineticMaterial"
          :model-value="fieldValue(field)"
          :disabled="
            field.key === 'lookAmount' && draft.paletteId === 'original'
          "
          :modified="isFieldModified(field)"
          :palette-target="field === activeColorField"
          @activate-color="activeColorFieldKey = field.key"
          @update:model-value="updateAppearanceField(field, $event)"
          @commit="commitSettings"
          @commit-color="emit('commitColor', $event)"
        />
        <ObsOutputColorPalette
          v-if="activeColorField && group.fields.includes(activeColorField)"
          :label="activeColorField.label"
          :model-value="String(fieldValue(activeColorField))"
          :recent-colors="recentColors"
          :saved-colors="savedColors"
          @select="applyPaletteColor"
          @toggle-saved-color="emit('toggleSavedColor', $event)"
        />
      </ObsPropertySection>
    </template>
  </component>
</template>

<style scoped>
.obs-slot-workbench__folder-inspector {
  block-size: 100%;
}

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

.obs-slot-workbench__inspector-header {
  padding-block: var(--ui-space-1);
}

.obs-slot-workbench__header-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
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
  min-width: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
  overflow-wrap: anywhere;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
