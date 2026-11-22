<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Check, CircleAlert, Loader2, RotateCcw } from '../../icons/index.js';
import {
  activePhantomPortraitSet,
  canAddPhantomPortraitSet,
  PHANTOM_PORTRAIT_DEFAULTS,
  PHANTOM_PORTRAIT_FIELDS,
  OUTPUT_TRANSLATION_FONT_SCALE,
  isOutputAppearanceFieldVisible,
  isOutputLocalFont,
  isSharedOutputAppearanceField,
  migrateLegacyPhantomPortraitSettings,
  sanitizePhantomPortraitSets,
  sanitizeOutputAppearanceSetting,
  sanitizeOutputTranslationFontScale,
} from '../../../shared/outputAppearance.mjs';
import {
  DEFAULT_MANGA_TAIL_TARGET,
  readMangaTailTarget,
  sanitizeMangaTailCoordinate,
} from '../../../shared/presentation/mangaFrameContract.mjs';
import { normalizeLyricsPresentationPolicyId } from '../../../shared/presentation/lyricsPresentationPolicies.mjs';
import {
  normalizeCaptureSizeId,
  supportedCaptureSizeIdsForTemplate,
} from '../../constants/outputCaptureSizes.js';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsPhantomPortraitEditor from './ObsPhantomPortraitEditor.vue';
import ObsPhantomPortraitGrid from './ObsPhantomPortraitGrid.vue';
import ObsPerformerGuideControls from './ObsPerformerGuideControls.vue';
import ObsFisheyeCameraControls from './ObsFisheyeCameraControls.vue';
import ObsInspectorHeader from './ObsInspectorHeader.vue';
import ObsInspectorTarget from './ObsInspectorTarget.vue';
import ObsMangaBubbleGrid from './ObsMangaBubbleGrid.vue';
import ObsOutputColorPalette from './ObsOutputColorPalette.vue';
import ObsOverlayPreview from './ObsOverlayPreview.vue';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsPropertySection from './ObsPropertySection.vue';
import ObsTemplateFilmstrip from './ObsTemplateFilmstrip.vue';
import ObsTranslationControls from './ObsTranslationControls.vue';
import { useOutputElementTarget } from '../../composables/output/useOutputElementTarget.js';
import { useOutputPerformerGuide } from '../../composables/output/useOutputPerformerGuide.js';
import { useOutputPerformerGuideImage } from '../../composables/output/useOutputPerformerGuideImage.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { useOutputRuntimeContext } from '../../composables/useOutputRuntimeContext.js';
import UiButton from '../ui/UiButton.vue';
import UiFolderInspector from '../ui/UiFolderInspector.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiNotice from '../ui/UiNotice.vue';
import { t } from '../../utils/i18n.js';
import {
  outputInspectorTab,
  outputInspectorTabs,
  sortOutputInspectorFields,
  sortOutputInspectorTabs,
} from '../../utils/outputInspectorTabs.js';
import { phantomPortraitColorToken } from './phantomPortraitPalette.js';

const props = defineProps({
  sideCollapsed: { type: Boolean, default: false },
  compactSideOpen: { type: Boolean, default: false },
  preset: { type: Object, default: null },
  quickSwitchPresets: { type: Array, default: () => [] },
  applyingPreset: { type: Boolean, default: false },
  outputSlot: { type: Object, default: null },
  activeKind: { type: String, default: null },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  previewBackdrop: { type: String, default: 'checker' },
  lyricsPreviewMode: { type: String, default: 'none' },
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
  'applyPreset',
  'refreshProjection',
]);

const draft = reactive({
  captureSize: 'small',
  translationFontScale: OUTPUT_TRANSLATION_FONT_SCALE.defaultValue,
});
const portraitSets = shallowRef({ activeId: '', items: [] });
const portraitEditor = shallowRef(null);
const portraitGrid = useTemplateRef('portraitGrid');
const selectedPortraitSet = computed(() =>
  activePhantomPortraitSet(portraitSets.value),
);
const sideWidth = shallowRef(null);
const tools = useTemplateRef('tools');
const { state: player } = usePlayer();
const { canCueMangaFrame, cueMangaFrame, pendingMangaFrameId } =
  useOutputRuntimeContext();
const performerGuide = useOutputPerformerGuide();
const performerGuideImage = useOutputPerformerGuideImage();
const performerGuideTab = 'performer-guide';
const mangaBubbleTab = 'manga-bubbles';
const translationTab = 'translation';
const filmstripTab = outputInspectorTab('template-filmstrip', {
  folderTone: 'neutral',
});

const appearanceFields = computed(() => props.preset?.appearanceFields ?? []);
const presentationFields = computed(
  () => props.preset?.presentationFields ?? [],
);
const templateFields = computed(() =>
  sortOutputInspectorFields([
    ...appearanceFields.value,
    ...presentationFields.value,
  ]),
);
const elementTargets = computed(() => props.preset?.elementTargets ?? []);
const configurationFields = computed(() => [
  ...templateFields.value,
  ...elementTargets.value.flatMap(({ fields }) => fields),
]);
const templateLocalFields = computed(() =>
  configurationFields.value.filter(
    (field) => !isSharedOutputAppearanceField(field),
  ),
);
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
    ? sortOutputInspectorFields(selectedTarget.value.fields)
    : templateFields.value.filter((field) =>
        isOutputAppearanceFieldVisible(field, draft),
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
  const tabs = outputInspectorTabs(visibleFields.value).map((tab) => ({
    ...tab,
    folderTone: tab.folderTone ?? 'primary',
  }));
  if (props.activeKind === 'lyrics') {
    tabs.push(outputInspectorTab(translationTab, { folderTone: 'secondary' }));
    if (templateId.value === 'fisheye-lens' && !selectedTarget.value) {
      tabs.push(
        outputInspectorTab('camera-effects', { folderTone: 'tertiary' }),
      );
    }
    if (templateId.value === 'manga-frame' && !selectedTarget.value) {
      tabs.push(outputInspectorTab(mangaBubbleTab, { folderTone: 'tertiary' }));
    }
    tabs.push(
      outputInspectorTab(performerGuideTab, { folderTone: 'tertiary' }),
    );
  }
  if (props.quickSwitchPresets.length > 1) tabs.push(filmstripTab);
  return tabs;
});
const orderedInspectorTabs = computed(() =>
  sortOutputInspectorTabs(inspectorTabs.value),
);
const defaultInspectorTabId = computed(() => {
  const tabs = inspectorTabs.value;
  const layout =
    templateId.value === 'ornate-vertical' &&
    tabs.find(({ id }) => id === 'layout');
  return (layout || tabs[0])?.id;
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
  templateLocalFields.value.every((field) => !isFieldModified(field)),
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
    draft.translationFontScale =
      sanitizeOutputTranslationFontScale(settings?.translationFontScale) ??
      OUTPUT_TRANSLATION_FONT_SCALE.defaultValue;
    if (activeTemplateId === 'manga-frame') {
      const { x, y } = performerGuide.guide.value;
      draft.mangaTailX = sanitizeMangaTailCoordinate(settings?.mangaTailX) ?? x;
      draft.mangaTailY = sanitizeMangaTailCoordinate(settings?.mangaTailY) ?? y;
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

onMounted(() => {
  watch(
    [() => props.outputSlot, templateId, () => props.saveStatus],
    ([slot, id, status]) => {
      if (
        id !== 'manga-frame' ||
        slot?.templateId !== id ||
        status !== 'saved' ||
        draft.mangaTailDirection !== 'performer'
      )
        return;
      const current =
        readMangaTailTarget(
          slot.settings?.mangaTailX,
          slot.settings?.mangaTailY,
        ) ?? DEFAULT_MANGA_TAIL_TARGET;
      const { x, y } = performerGuide.saved.value;
      if (current.x === x && current.y === y) return;
      draft.mangaTailX = x;
      draft.mangaTailY = y;
      commitSettings();
    },
    { immediate: true, flush: 'post' },
  );
});

function settingsSnapshot() {
  return {
    ...Object.fromEntries(
      configurationFields.value.map(({ key }) => [key, draft[key]]),
    ),
    ...(templateId.value === 'phantom-thieves' && {
      phantomPortraitSets: portraitSets.value,
    }),
    ...(templateId.value === 'manga-frame' &&
      draft.mangaTailDirection === 'performer' && {
        mangaTailX: draft.mangaTailX,
        mangaTailY: draft.mangaTailY,
      }),
    ...(props.activeKind === 'lyrics' && {
      translationFontScale: draft.translationFontScale,
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
  if (field.key === 'mangaTailDirection' && value === 'performer') {
    const { x, y } = performerGuide.guide.value;
    draft.mangaTailX = x;
    draft.mangaTailY = y;
  }
  emitSettingsChange(field.control === 'select' ? 'immediate' : 'debounced');
}

function commitPerformerGuide(value) {
  performerGuide.commit(value);
  if (
    !value ||
    templateId.value !== 'manga-frame' ||
    draft.mangaTailDirection !== 'performer'
  )
    return;
  const { x, y } = performerGuide.guide.value;
  if (draft.mangaTailX === x && draft.mangaTailY === y) return;
  draft.mangaTailX = x;
  draft.mangaTailY = y;
  commitSettings();
}

function updateCaptureSize(value) {
  if (draft.captureSize === value) return;
  draft.captureSize = value;
  emitSettingsChange('immediate');
}

function updateTranslationFontScale(value) {
  if (draft.translationFontScale === value) return;
  draft.translationFontScale = value;
  emitSettingsChange();
}

function canResetTemplate(item) {
  return (
    templateLocalFields.value.length > 0 &&
    (!item?.folderTone || item.folderTone === 'primary')
  );
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
  resetFields(templateLocalFields.value);
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
            items: orderedInspectorTabs,
            defaultItemId: defaultInspectorTabId,
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
    <template #main="main">
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
            :performer-guide="performerGuide.guide.value"
            :performer-guide-image="performerGuideImage.src.value"
            :custom-performer-guide-image="performerGuideImage.custom.value"
            :editing-performer-guide="
              main?.activeItem?.id === performerGuideTab
            "
            :element-ids="elementIds"
            :selected-element-id="selectedTargetId"
            @update:capture-size="updateCaptureSize"
            @update:preview-backdrop="emit('update:previewBackdrop', $event)"
            @update:lyrics-preview-mode="
              emit('update:lyricsPreviewMode', $event)
            "
            @preview-performer-guide="performerGuide.preview"
            @commit-performer-guide="commitPerformerGuide"
            @refresh-projection="emit('refreshProjection')"
            @select-element="selectTarget"
          />
        </UiScrollRegion>
      </main>
    </template>

    <template #side-header="header">
      <ObsInspectorHeader
        :title="
          header?.item?.label ??
          preset?.name ??
          t('outputPanel.workbench.noTemplate')
        "
        :context="
          header?.item && header.item.id !== filmstripTab.id ? preset?.name : ''
        "
      >
        <template
          v-if="showSaveStatus || canResetTemplate(header?.item)"
          #actions
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
            v-if="canResetTemplate(header?.item)"
            class="obs-slot-workbench__reset"
            :icon="RotateCcw"
            :label="t('outputPanel.workbench.resetTemplate')"
            tooltip-placement="bottom"
            :disabled="isConfigurationAtDefaults"
            @click="resetAppearance"
          />
        </template>
      </ObsInspectorHeader>
    </template>

    <template #side-top="side">
      <UiNotice
        v-if="outputError"
        class="obs-slot-workbench__notice"
        tone="danger"
        :title="t('outputPanel.workbench.notUpdated')"
        :message="outputError"
        compact
      />
      <UiHint
        v-if="activeKind === 'lyrics' && side?.item?.id === filmstripTab.id"
        class="obs-slot-workbench__filmstrip-hint"
      >
        {{ t('outputPanel.workbench.switchTemplateNextLine') }}
      </UiHint>

      <ObsInspectorTarget
        v-if="
          elementTargets.length &&
          side?.item?.id !== translationTab &&
          side?.item?.id !== filmstripTab.id
        "
        id="output-appearance-target"
        :model-value="selectedTargetId"
        :options="targetOptions"
        @update:model-value="selectTarget"
      />
    </template>
    <template #side="{ item, active }">
      <ObsTemplateFilmstrip
        v-if="item?.id === filmstripTab.id && active"
        :key="activeKind"
        :presets="quickSwitchPresets"
        :active-id="preset?.id"
        :busy="applyingPreset"
        @select="emit('applyPreset', $event)"
      />
      <ObsMangaBubbleGrid
        v-if="item?.id === mangaBubbleTab"
        :available="canCueMangaFrame"
        :pending-id="pendingMangaFrameId"
        @select="cueMangaFrame"
      />
      <ObsTranslationControls
        v-if="item?.id === translationTab"
        :font-scale="draft.translationFontScale"
        @update:font-scale="updateTranslationFontScale"
        @commit="commitSettings"
      />
      <ObsPerformerGuideControls
        v-if="item?.id === performerGuideTab && active"
        :guide="performerGuide.guide.value"
        :available="lyricsPreviewMode === 'performer'"
        :custom-image="performerGuideImage.custom.value"
        :image-busy="performerGuideImage.busy.value"
        :image-error="performerGuideImage.error.value"
        :save-image="performerGuideImage.change"
        @commit="commitPerformerGuide"
        @show="emit('update:lyricsPreviewMode', 'performer')"
      />
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
        :track="player.track"
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

.obs-slot-workbench__folder-inspector
  :deep(
    .ui-folder-inspector__tabs
      .ui-tabs__list:has(
        > :is([id$='-performer-guide-tab'], [id$='-template-filmstrip-tab'])
      )
  ) {
  min-block-size: 100%;
}

.obs-slot-workbench__folder-inspector :deep([id$='-performer-guide-tab']),
.obs-slot-workbench__folder-inspector
  :deep(
    .ui-tabs__list:not(:has(> [id$='-performer-guide-tab']))
      > [id$='-template-filmstrip-tab']
  ) {
  margin-block-start: auto;
}

.obs-slot-workbench__folder-inspector
  :deep(
    .ui-scroll-layout__content:has(
      > [role='tabpanel'] > .obs-template-filmstrip
    )
  ) {
  display: flex;
  flex-direction: column;
  min-block-size: 100%;
}

.obs-slot-workbench__folder-inspector
  :deep([role='tabpanel']:has(> .obs-template-filmstrip)) {
  display: grid;
  flex: 1;
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

.obs-slot-workbench__notice {
  margin-block: var(--ui-space-3);
}

.obs-slot-workbench__filmstrip-hint {
  margin-block: var(--ui-space-2) 0;
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
</style>
