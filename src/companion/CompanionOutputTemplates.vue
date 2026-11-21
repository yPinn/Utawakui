<script setup>
import { computed, reactive, shallowRef, useId, watch } from 'vue';
import templates from '../../shared/outputTemplateValues.json';
import {
  COMPANION_OUTPUT_PORTRAIT,
  COMPANION_OUTPUT_RESET,
  companionOutputFields,
  companionOutputResetPatch,
} from '../../shared/companionOutput.mjs';
import { outputElementTargetsForTemplate } from '../../shared/outputAppearance.mjs';
import { ICON_SIZE, RotateCcw } from '../icons/index.js';
import ObsAppearanceField from '../components/output/ObsAppearanceField.vue';
import ObsInspectorHeader from '../components/output/ObsInspectorHeader.vue';
import ObsInspectorTarget from '../components/output/ObsInspectorTarget.vue';
import ObsPhantomPortraitGrid from '../components/output/ObsPhantomPortraitGrid.vue';
import ObsPropertySection from '../components/output/ObsPropertySection.vue';
import UiFolderTabShape from '../components/ui/UiFolderTabShape.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiTabs from '../components/ui/UiTabs.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import { catalogKey, t } from '../utils/i18n.js';
import {
  localizeAppearanceField,
  outputSlotLabel,
} from '../utils/outputPanelCopy.js';
import {
  outputInspectorTab,
  outputInspectorTabs,
  sortOutputInspectorFields,
  sortOutputInspectorTabs,
} from '../utils/outputInspectorTabs.js';
import { getOutputTemplateThumbnail } from '../utils/outputTemplateThumbnails.js';
import '../styles/features/output.css';

const props = defineProps({
  slots: { type: Array, default: null },
  disabled: { type: Boolean, default: false },
  track: { type: Object, default: null },
  getPortrait: { type: Function, default: null },
  localPortraits: { type: Boolean, default: false },
});
const emit = defineEmits(['change-option']);
const activeKind = shallowRef(templates.slots[0].id);
const categoryId = shallowRef('');
const targetId = shallowRef('');
const drafts = reactive({});
const uid = useId();
const categoryPrefix = `companion-output-category-${uid}`;
const shapeId = `${categoryPrefix}-shape`;
const slotTabs = templates.slots.map(({ id }) => ({
  id,
  label: outputSlotLabel(id),
}));
const slot = computed(
  () => props.slots?.[slotTabs.findIndex(({ id }) => id === activeKind.value)],
);
const templateId = computed(() => slot.value?.templateId);
const appliedTemplateRow = computed(() =>
  templateId.value
    ? {
        id: templateId.value,
        title: t(`outputPanel.templates.${catalogKey(templateId.value)}.name`),
        thumbnailUrl: getOutputTemplateThumbnail(templateId.value),
      }
    : null,
);
const hasPortrait = computed(
  () => slot.value?.portraits && slot.value.options.phantomMode === 'side-card',
);

const fields = computed(() => {
  if (!slot.value) return [];
  return sortOutputInspectorFields(
    companionOutputFields(templateId.value, slot.value.options),
  ).map(localizeAppearanceField);
});
const targets = computed(() =>
  outputElementTargetsForTemplate(templateId.value),
);
const targetOptions = computed(() => [
  { value: '', label: t('outputPanel.workbench.wholeTemplate') },
  ...targets.value.map(({ id }) => ({
    value: id,
    label: t(`outputPanel.appearance.elements.${catalogKey(id)}`),
  })),
]);
const categories = computed(() => {
  const entries = outputInspectorTabs(
    fields.value.filter(
      ({ elementId }) => (elementId ?? '') === targetId.value,
    ),
  );
  if (hasPortrait.value && !targetId.value) {
    const portrait = outputInspectorTab('portrait');
    const sharedIndex = entries.findIndex(
      ({ folderTone }) => folderTone === 'secondary',
    );
    entries.splice(
      sharedIndex === -1 ? entries.length : sharedIndex,
      0,
      portrait,
    );
  }
  return entries;
});
const orderedCategories = computed(() =>
  sortOutputInspectorTabs(categories.value),
);
const activeCategory = computed(
  () =>
    categories.value.find(({ id }) => id === categoryId.value) ??
    categories.value[0],
);
const portraitUrls = reactive(new Map());
const portraitRequests = computed(() => {
  if (!props.getPortrait || activeCategory.value?.id !== 'portrait') return '';
  return JSON.stringify([
    props.track?.id ?? '',
    slot.value.portraits.items
      .filter(({ phantomPortraitPhoto }) => phantomPortraitPhoto)
      .map(({ id, phantomPortraitPhoto }) => [id, phantomPortraitPhoto]),
  ]);
});
watch(portraitRequests, (requests, _, onCleanup) => {
  if (!requests) return;
  const controller = new AbortController();
  onCleanup(() => {
    controller.abort();
    for (const url of portraitUrls.values()) URL.revokeObjectURL(url);
    portraitUrls.clear();
  });
  const [artistTrackId, sets] = JSON.parse(requests);
  const ids = [...(artistTrackId ? [''] : []), ...sets.map(([id]) => id)];
  for (const id of ids) void loadPortrait(id, controller.signal);
});

async function loadPortrait(id, signal) {
  try {
    const blob = await props.getPortrait(id, signal);
    if (blob && !signal.aborted)
      portraitUrls.set(id, URL.createObjectURL(blob));
  } catch {
    // The shared tile keeps its artist or icon fallback when no photo loads.
  }
}

function thumbnailFor(id) {
  return {
    custom: id ? portraitUrls.get(id) : '',
    artist: portraitUrls.get(''),
  };
}
const resetAvailable = computed(
  () =>
    slot.value && Object.keys(companionOutputResetPatch(slot.value)).length > 0,
);
watch(templateId, () => {
  targetId.value = '';
  categoryId.value = '';
  for (const key of Object.keys(drafts)) delete drafts[key];
});
watch(targetId, () => {
  categoryId.value = '';
});

function change(fieldKey, value) {
  if (props.disabled || !templateId.value) return;
  emit('change-option', { templateId: templateId.value, fieldKey, value });
}

function update(field, value) {
  if (field.control === 'range') drafts[field.key] = value;
  if (field.control === 'select') change(field.key, value);
}

function commitRange(field) {
  if (!Object.hasOwn(drafts, field.key)) return;
  const value = drafts[field.key];
  delete drafts[field.key];
  change(field.key, value);
}

function commitColor(field, value) {
  if (/^#[0-9a-f]{6}$/iu.test(value)) change(field.key, value);
}
</script>

<template>
  <div class="companion-output">
    <UiHint v-if="!slot">{{
      t('companion.templates.outputUnavailable')
    }}</UiHint>
    <template v-else>
      <ul
        class="companion-output__summary"
        :aria-label="t('outputPanel.gallery.label')"
      >
        <UiTrackRow
          :track="appliedTemplateRow"
          :artist="t('outputPanel.gallery.applied')"
          overflow="ellipsis"
          thumb-decoding="async"
        >
          <template #trail>
            <UiIconButton
              :icon="RotateCcw"
              :label="t('outputPanel.workbench.resetTemplate')"
              :disabled="disabled || !resetAvailable"
              variant="ghost"
              size="lg"
              @click="change(COMPANION_OUTPUT_RESET, null)"
            />
          </template>
        </UiTrackRow>
      </ul>
      <UiTabs
        v-model:active-id="activeKind"
        :items="slotTabs"
        :aria-label="t('outputPanel.workspace.surface')"
        tab-id-prefix="companion-output-slot"
        panel-id-prefix="companion-output-slot"
        variant="bar"
        distribution="equal"
      />
      <section
        v-for="entry in slotTabs"
        :id="`companion-output-slot-${entry.id}-panel`"
        :key="entry.id"
        :aria-labelledby="`companion-output-slot-${entry.id}-tab`"
        :hidden="entry.id !== activeKind"
        role="tabpanel"
      >
        <div v-if="entry.id === activeKind" class="companion-output__inspector">
          <UiFolderTabShape :shape-id="shapeId" />
          <UiTabs
            :style="{ '--_folder-tab-shape': `url('#${shapeId}')` }"
            :items="orderedCategories"
            :active-id="activeCategory?.id"
            :aria-label="t('outputPanel.inspector.label')"
            :tab-id-prefix="categoryPrefix"
            :panel-id-prefix="categoryPrefix"
            variant="folder"
            folder-orientation="horizontal"
            @update:active-id="categoryId = $event"
          >
            <template #label="{ item }">
              <component :is="item.icon" :size="ICON_SIZE" aria-hidden="true" />
            </template>
          </UiTabs>
          <div class="companion-output__controls">
            <ObsInspectorHeader
              v-if="activeCategory"
              :title="activeCategory.label"
            />
            <ObsInspectorTarget
              v-if="targets.length"
              :id="`companion-output-target-${uid}`"
              v-model="targetId"
              :options="targetOptions"
              stacked
            />
            <section
              v-for="category in orderedCategories"
              :id="`${categoryPrefix}-${category.id}-panel`"
              :key="category.id"
              :aria-labelledby="`${categoryPrefix}-${category.id}-tab`"
              :hidden="category.id !== activeCategory?.id"
              role="tabpanel"
            >
              <fieldset
                v-if="category.id === activeCategory?.id"
                :disabled="disabled"
              >
                <ObsPhantomPortraitGrid
                  v-if="category.id === 'portrait'"
                  :track="track"
                  :items="slot.portraits.items"
                  :active-id="slot.portraits.activeId"
                  :thumbnail-for="localPortraits ? null : thumbnailFor"
                  :disabled="disabled"
                  active
                  selection-only
                  stretch
                  @select="change(COMPANION_OUTPUT_PORTRAIT, $event)"
                />
                <ObsPropertySection
                  v-for="group in category.groups"
                  :key="group.id"
                  :title="group.label"
                >
                  <ObsAppearanceField
                    v-for="field in group.fields"
                    :key="field.key"
                    :id-prefix="`companion-output-${activeKind}`"
                    :field="field"
                    :model-value="
                      drafts[field.key] ?? slot.options[field.key] ?? ''
                    "
                    :modified="slot.options[field.key] !== field.defaultValue"
                    :disabled="
                      disabled ||
                      (field.key === 'lookAmount' &&
                        slot.options.paletteId === 'original')
                    "
                    stacked
                    :kinetic-material="slot.options.kineticMaterial"
                    built-in-fonts-only
                    @update:model-value="update(field, $event)"
                    @commit="commitRange(field)"
                    @commit-color="commitColor(field, $event)"
                  />
                </ObsPropertySection>
              </fieldset>
            </section>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.companion-output {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  min-inline-size: 0;
  min-block-size: 100%;
}

.companion-output > section:not([hidden]) {
  display: grid;
  flex: 1 0 auto;
}

.companion-output__inspector {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr;
}

.companion-output__inspector > svg {
  position: absolute;
}

.companion-output > .ui-tabs,
.companion-output > .ui-hint {
  margin-inline: var(--ui-space-3);
  inline-size: auto;
}

.companion-output__summary {
  --ui-track-row-padding-inline: 0;
  min-inline-size: 0;
  margin: 0;
  padding: 0 var(--ui-space-3);
  list-style: none;
}

.companion-output__controls {
  min-inline-size: 0;
  padding: 0 var(--ui-space-3) var(--ui-space-3);
  background: var(--ui-companion-panel);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.companion-output__controls fieldset {
  min-inline-size: 0;
  border: 0;
  margin: 0;
  padding: 0;
}
</style>
