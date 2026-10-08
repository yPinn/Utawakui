<script setup>
import { computed } from 'vue';
import { sanitizeOutputLocalFont } from '../../../shared/outputAppearance.mjs';
import { useLocalFonts } from '../../composables/output/useLocalFonts.js';
import { isOutputLocalFontAvailable } from '../../utils/outputLocalFonts.js';
import UiButton from '../ui/UiButton.vue';
import UiCombobox from '../ui/UiCombobox.vue';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Object], required: true },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue']);
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
    searchText: `${option.label} ${option.id} 預設`,
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
    searchText: `${font.family} ${font.postscriptName} ${font.style} 本機`,
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
  catalog.status.value === 'idle' ? '載入本機字體' : '重新載入本機字體',
);
const catalogMessage = computed(() => {
  if (catalog.status.value === 'idle') return '按下後才會讀取本機字體清單';
  if (catalog.status.value === 'loading') return '正在讀取本機字體…';
  if (catalog.status.value === 'ready') {
    return catalog.fonts.value.length
      ? `已載入 ${catalog.fonts.value.length} 個字體家族`
      : '未找到可用的本機字體';
  }
  if (catalog.status.value === 'unsupported') {
    return '目前環境不支援本機字體存取';
  }
  if (catalog.status.value === 'denied') return '未允許本機字體存取';
  return catalog.error.value;
});

function optionBadge(item) {
  if (item.source === 'missing') return '不可用';
  return item.source === 'local' ? '本機' : '預設';
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
      placeholder="搜尋字體"
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
        loading-label="讀取本機字體"
        @click="catalog.load"
      >
        {{ loadLabel }}
      </UiButton>
      <span class="obs-font-family-select__status" aria-live="polite">
        {{ catalogMessage }}
      </span>
    </div>

    <p
      v-if="selectedLocalFontMissing"
      class="obs-font-family-select__warning"
      role="status"
    >
      本機字體不可用，輸出會使用預設字體
    </p>
    <p v-if="savedLocalFont" class="obs-font-family-select__license">
      本機字體會用於公開輸出；請確認直播、錄影、VOD、剪輯及商用所需權利。
    </p>
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
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-font-family-select__catalog {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  justify-items: start;
}

.obs-font-family-select__status,
.obs-font-family-select__license,
.obs-font-family-select__warning {
  margin: 0;
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-font-family-select__status,
.obs-font-family-select__license {
  color: var(--ui-color-text-muted);
}

.obs-font-family-select__warning {
  color: var(--ui-color-warning);
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
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
}

.obs-font-family-select__option-sample {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
