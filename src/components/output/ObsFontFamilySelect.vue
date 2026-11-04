<script setup>
import { computed } from 'vue';
import { sanitizeOutputLocalFont } from '../../../shared/outputAppearance.mjs';
import { useLocalFonts } from '../../composables/output/useLocalFonts.js';
import { isOutputLocalFontAvailable } from '../../utils/outputLocalFonts.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Object], required: true },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue']);
// eslint-disable-next-line no-restricted-syntax -- multilingual font preview sample, not UI copy
const SAMPLE = '舞台 · 무대 · ステージ · Stage 123';
const PRESET_FONT_FAMILIES = Object.freeze({
  sans: 'var(--ui-font-family-base)',
  serif: "'Noto Serif TC', 'Noto Serif JP', 'Yu Mincho', 'PMingLiU', serif",
  rounded:
    "'Arial Rounded MT Bold', 'Yu Gothic UI', 'Microsoft JhengHei', sans-serif",
  ornate: "'Utawakui Hina Mincho', 'Hina Mincho', serif",
  antique: "'Utawakui GenEi Antique', 'GenEi Antique', serif",
});

const catalog = useLocalFonts();
const savedLocalFont = computed(() =>
  sanitizeOutputLocalFont(props.modelValue),
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

function fontPreviewStyle(item) {
  const family = item.font?.family;
  return {
    fontFamily: family
      ? `${JSON.stringify(family)}, var(--ui-font-family-base)`
      : (PRESET_FONT_FAMILIES[item.value] ?? 'var(--ui-font-family-base)'),
  };
}

const items = computed(() => {
  const presets = props.options.map((option) => ({
    value: option.id,
    label: option.label,
    searchText: `${option.label} ${option.id} ${t('outputPanel.font.presetWord')}`,
    source: 'preset',
  }));
  const localFonts = [...catalog.fonts.value];
  if (
    savedLocalFont.value &&
    !isOutputLocalFontAvailable(localFonts, savedLocalFont.value)
  ) {
    localFonts.push(savedLocalFont.value);
  }
  const local = localFonts.map((font) => ({
    value: localFontValue(font),
    label: font.family,
    searchText: `${font.family} ${font.postscriptName} ${font.style} ${t('outputPanel.font.localWord')}`,
    source:
      selectedLocalFontMissing.value &&
      font.postscriptName === savedLocalFont.value?.postscriptName
        ? 'missing'
        : 'local',
    font,
  }));
  return [...presets, ...local];
});

const selectedValue = computed(() =>
  selectedLocalFont.value
    ? localFontValue(selectedLocalFont.value)
    : String(props.modelValue),
);
const selectedItem = computed(() =>
  items.value.find((item) => item.value === selectedValue.value),
);
const selectedSource = computed(() => {
  if (selectedLocalFontMissing.value) return 'missing';
  return savedLocalFont.value ? 'local' : 'preset';
});
const selectedPreviewStyle = computed(() =>
  fontPreviewStyle(
    selectedItem.value ?? {
      value: selectedValue.value,
      font: selectedLocalFont.value,
    },
  ),
);
const loadLabel = computed(() =>
  catalog.status.value === 'idle'
    ? t('outputPanel.font.load')
    : t('outputPanel.font.reload'),
);
const catalogMessage = computed(() => {
  if (catalog.status.value === 'idle') return t('outputPanel.font.idle');
  if (catalog.status.value === 'loading') return t('outputPanel.font.loading');
  if (catalog.status.value === 'ready') {
    return catalog.fonts.value.length
      ? t(
          'outputPanel.font.loaded',
          { count: catalog.fonts.value.length },
          catalog.fonts.value.length,
        )
      : t('outputPanel.font.none');
  }
  if (catalog.status.value === 'unsupported') {
    return t('outputPanel.font.unsupported');
  }
  if (catalog.status.value === 'denied') return t('outputPanel.font.denied');
  return catalog.error.value;
});

function optionBadge(item) {
  if (item.source === 'missing') return t('outputPanel.font.unavailable');
  return item.source === 'local'
    ? t('outputPanel.font.localWord')
    : t('outputPanel.font.presetWord');
}

function updateValue(value) {
  const item = items.value.find((candidate) => candidate.value === value);
  if (item?.font) {
    emit('update:modelValue', item.font);
    return;
  }
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="obs-font-family-select">
    <UiCombobox
      :id="id"
      :label="label"
      :model-value="selectedValue"
      :items="items"
      label-hidden
      :placeholder="t('outputPanel.font.search')"
      @update:model-value="updateValue"
    >
      <template #option="{ item }">
        <span
          class="obs-font-family-select__option"
          :data-font-source="item.source"
        >
          <span class="obs-font-family-select__option-heading">
            <span class="obs-font-family-select__name">{{ item.label }}</span>
            <span class="obs-font-family-select__badge">
              {{ optionBadge(item) }}
            </span>
          </span>
          <span
            class="obs-font-family-select__option-sample"
            :style="fontPreviewStyle(item)"
            aria-hidden="true"
          >
            {{ SAMPLE }}
          </span>
        </span>
      </template>
    </UiCombobox>

    <div
      class="obs-font-family-select__current-sample"
      :data-font-source="selectedSource"
      :style="selectedPreviewStyle"
      aria-hidden="true"
    >
      {{ SAMPLE }}
    </div>

    <div class="obs-font-family-select__catalog">
      <UiButton
        variant="secondary"
        :loading="catalog.status.value === 'loading'"
        :loading-label="t('outputPanel.font.reading')"
        @click="catalog.load"
      >
        {{ loadLabel }}
      </UiButton>
      <UiHint class="obs-font-family-select__status" aria-live="polite">
        {{ catalogMessage }}
      </UiHint>
    </div>

    <UiHint
      v-if="selectedLocalFontMissing"
      tone="warning"
      class="obs-font-family-select__warning"
      role="status"
    >
      {{ t('outputPanel.font.missing') }}
    </UiHint>
    <UiHint v-if="savedLocalFont" class="obs-font-family-select__license">
      {{ t('outputPanel.font.rightsNotice') }}
    </UiHint>
  </div>
</template>

<style scoped>
.obs-font-family-select {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-font-family-select__current-sample {
  min-width: 0;
  overflow: hidden;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  line-height: var(--ui-type-body-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-font-family-select__catalog {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  justify-items: start;
}

.obs-font-family-select__option {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  inline-size: 100%;
}

.obs-font-family-select__option-heading {
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
}

.obs-font-family-select__option-sample {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
