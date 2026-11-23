<script setup>
import { computed, shallowRef } from 'vue';
import OUTPUT_TEMPLATES from '../../../shared/outputTemplateValues.json';
import {
  outputFontFamilyCss,
  sanitizeOutputLocalFont,
} from '../../../shared/outputAppearance.mjs';
import { useLocalFonts } from '../../composables/output/useLocalFonts.js';
import { Info, RefreshCw } from '../../icons/index.js';
import { isOutputLocalFontAvailable } from '../../utils/outputLocalFonts.js';
import UiCombobox from '../ui/UiCombobox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import { catalogKey, t } from '../../utils/i18n.js';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Object], required: true },
  options: { type: Array, default: () => [] },
  defaultValue: { type: String, default: 'sans' },
  templateId: { type: String, default: '' },
  kineticMaterial: { type: String, default: undefined },
  builtInOnly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  previewActionTarget: { type: String, default: undefined },
});

const emit = defineEmits(['update:modelValue']);
// These phrases are displayed in each script regardless of the UI locale.
const FONT_SAMPLES = Object.freeze([
  // eslint-disable-next-line no-restricted-syntax -- font specimen, not UI copy
  { lang: 'zh-Hant', text: '星光照亮舞臺' },
  { lang: 'en', text: 'Tonight on stage' },
  // eslint-disable-next-line no-restricted-syntax -- font specimen, not UI copy
  { lang: 'ja', text: '星がステージを照らす' },
  { lang: 'ko', text: '별빛이 무대를 비춘다' },
]);
const catalog = useLocalFonts();
const previewOpen = shallowRef(false);
const savedLocalFont = computed(() =>
  props.builtInOnly ? undefined : sanitizeOutputLocalFont(props.modelValue),
);
const selectedLocalFont = computed(() => {
  const saved = savedLocalFont.value;
  if (!saved) return undefined;
  const postscriptName = saved.postscriptName.toLocaleLowerCase();
  const family = saved.family.toLocaleLowerCase();
  return (
    catalog.fonts.value.find(
      (font) => font.postscriptName.toLocaleLowerCase() === postscriptName,
    ) ??
    catalog.fonts.value.find(
      (font) => font.family.toLocaleLowerCase() === family,
    ) ??
    saved
  );
});
const selectedLocalFontMissing = computed(
  () =>
    catalog.status.value === 'ready' &&
    Boolean(savedLocalFont.value) &&
    !isOutputLocalFontAvailable(catalog.fonts.value, savedLocalFont.value),
);

function localFontValue(font) {
  return `local:${font.postscriptName}`;
}

function fontPreviewStyle(item, language) {
  return {
    fontFamily: outputFontFamilyCss(
      item?.font ?? item?.value ?? props.defaultValue,
      props.templateId,
      language,
      props.kineticMaterial,
    ),
  };
}

const presetItems = computed(() =>
  props.options.map((option) => {
    const detail =
      option.id === 'template'
        ? t(`outputPanel.font.templateDetails.${catalogKey(props.templateId)}`)
        : t(`outputPanel.font.presets.${catalogKey(option.id)}`);
    return {
      value: option.id,
      label: option.label,
      searchText: `${option.label} ${option.id} ${detail} ${fontPreviewStyle({ value: option.id }).fontFamily}`,
      source: 'preset',
      detail,
    };
  }),
);
const desktopFont = computed(() =>
  props.builtInOnly && props.modelValue === ''
    ? { value: '', label: t('outputPanel.font.localGroup'), disabled: true }
    : null,
);

const localItems = computed(() => {
  if (props.builtInOnly) return desktopFont.value ? [desktopFont.value] : [];
  const localFonts = [...catalog.fonts.value];
  if (
    savedLocalFont.value &&
    !isOutputLocalFontAvailable(localFonts, savedLocalFont.value)
  ) {
    localFonts.push(savedLocalFont.value);
  }
  return localFonts.map((font) => ({
    value: localFontValue(font),
    label: font.family,
    searchText: `${font.family} ${font.postscriptName} ${font.style}`,
    source:
      selectedLocalFontMissing.value &&
      font.postscriptName === savedLocalFont.value?.postscriptName
        ? 'missing'
        : 'local',
    font,
  }));
});

const selectedValue = computed(() =>
  selectedLocalFont.value
    ? localFontValue(selectedLocalFont.value)
    : String(props.modelValue),
);
const selectedItem = computed(() =>
  [...presetItems.value, ...localItems.value].find(
    (item) => item.value === selectedValue.value,
  ),
);
const previewItem = computed(() =>
  selectedLocalFontMissing.value || desktopFont.value
    ? { value: props.defaultValue }
    : selectedItem.value,
);
const previewUsage = computed(() =>
  t(
    [undefined, 'lyrics'].includes(
      OUTPUT_TEMPLATES.templateKinds[props.templateId],
    )
      ? 'outputPanel.font.usage'
      : 'outputPanel.font.trackUsage',
  ),
);
const catalogMessage = computed(() => {
  if (catalog.status.value === 'loading') return t('outputPanel.font.loading');
  if (catalog.status.value === 'ready') {
    return catalog.fonts.value.length ? '' : t('outputPanel.font.none');
  }
  if (catalog.status.value === 'unsupported') {
    return t('outputPanel.font.unsupported');
  }
  if (catalog.status.value === 'denied') return t('outputPanel.font.denied');
  return catalog.error.value;
});
const canRetry = computed(
  () =>
    !props.builtInOnly && ['error', 'denied'].includes(catalog.status.value),
);
const groups = computed(() => [
  { label: t('outputPanel.font.templateGroup'), options: presetItems.value },
  ...(!props.builtInOnly || localItems.value.length
    ? [
        {
          label: t('outputPanel.font.localGroup'),
          options: localItems.value,
          status: props.builtInOnly ? '' : catalogMessage.value,
        },
      ]
    : []),
]);

function loadCatalogOnOpen() {
  if (!props.builtInOnly && catalog.status.value === 'idle')
    void catalog.load();
}

function updateValue(value) {
  const item = localItems.value.find((candidate) => candidate.value === value);
  if (item?.font) {
    emit('update:modelValue', item.font);
    return;
  }
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="obs-font-family-select">
    <div class="obs-font-family-select__row">
      <UiCombobox
        :id="id"
        :label="label"
        :model-value="selectedValue"
        :items="groups"
        :disabled="disabled"
        label-hidden
        search-on-open
        :placeholder="t('outputPanel.font.search')"
        @open="loadCatalogOnOpen"
        @update:model-value="updateValue"
      >
        <template #option="{ item }">
          <span
            class="obs-font-family-select__option"
            :data-font-source="item.source"
          >
            <span
              class="obs-font-family-select__name"
              :style="
                item.source === 'missing' ? undefined : fontPreviewStyle(item)
              "
            >
              {{ item.label }}
            </span>
            <span
              v-if="item.source === 'missing'"
              class="obs-font-family-select__badge"
            >
              {{ t('outputPanel.font.unavailable') }}
            </span>
          </span>
        </template>
      </UiCombobox>
      <Teleport
        :to="previewActionTarget || 'body'"
        :disabled="!previewActionTarget"
        defer
      >
        <UiIconButton
          :icon="Info"
          :label="t('outputPanel.font.preview.title')"
          :disabled="disabled"
          aria-haspopup="dialog"
          @click="previewOpen = true"
        />
      </Teleport>
      <UiIconButton
        v-if="canRetry"
        :icon="RefreshCw"
        :label="t('outputPanel.font.reload')"
        :tooltip-suffix="catalogMessage"
        @click="catalog.load"
      />
    </div>

    <span v-if="!builtInOnly" class="ui-visually-hidden" aria-live="polite">
      {{ catalogMessage }}
    </span>

    <UiHint v-if="selectedLocalFontMissing" tone="warning" role="status">
      {{ t('outputPanel.font.missing') }}
    </UiHint>

    <UiModal
      :open="previewOpen"
      :title="t('outputPanel.font.preview.title')"
      size="notice"
      initial-focus="dialog"
      dismiss-on-backdrop
      @close="previewOpen = false"
    >
      <div class="obs-font-family-select__preview">
        <div
          v-if="selectedItem"
          class="obs-font-family-select__preview-summary"
        >
          <h3 class="obs-font-family-select__preview-name">
            {{ selectedItem.label }}
          </h3>
          <UiHint v-if="selectedItem.detail">{{ selectedItem.detail }}</UiHint>
        </div>
        <dl class="obs-font-family-select__specimens">
          <div
            v-for="sample in FONT_SAMPLES"
            :key="sample.lang"
            class="obs-font-family-select__specimen"
          >
            <dt>
              {{ t(`outputPanel.font.preview.languages.${sample.lang}`) }}
            </dt>
            <dd
              :lang="sample.lang"
              :style="fontPreviewStyle(previewItem, sample.lang)"
            >
              {{ sample.text }}
            </dd>
          </div>
        </dl>
        <div class="obs-font-family-select__preview-notes">
          <UiHint v-if="selectedLocalFontMissing" tone="warning">{{
            t('outputPanel.font.missing')
          }}</UiHint>
          <UiHint>{{ previewUsage }}</UiHint>
          <UiHint v-if="savedLocalFont">{{
            t('outputPanel.font.rightsNotice')
          }}</UiHint>
        </div>
      </div>
    </UiModal>
  </div>
</template>

<style src="./hangulFonts.css"></style>

<style scoped>
.obs-font-family-select {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-font-family-select__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-columns: max-content;
  grid-auto-flow: column;
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-font-family-select__option {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-2);
  font-family: var(--ui-font-family-base);
}

.obs-font-family-select__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-font-family-select__badge {
  flex: none;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.obs-font-family-select__preview {
  display: grid;
  gap: var(--ui-modal-section-gap);
}

.obs-font-family-select__preview-summary,
.obs-font-family-select__preview-notes {
  display: grid;
  gap: var(--ui-space-1);
}

.obs-font-family-select__preview-name {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
  overflow-wrap: anywhere;
}

.obs-font-family-select__specimens {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  margin: 0;
  column-gap: var(--ui-space-3);
}

.obs-font-family-select__specimen {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: baseline;
  padding-block: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  border-block-end-width: 0;
}

.obs-font-family-select__specimen:last-child {
  border-block-end-width: var(--ui-border-width);
}

.obs-font-family-select__specimen dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.obs-font-family-select__specimen dd {
  min-width: 0;
  margin: 0;
  /* The specimen is larger than prose while keeping regular glyph weight. */
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
  overflow-wrap: anywhere;
}
</style>
