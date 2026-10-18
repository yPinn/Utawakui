<script setup>
import { computed, shallowRef } from 'vue';
import { Check, ICON_SIZE } from '../../icons/index.js';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsTemplatePreviewStage from './ObsTemplatePreviewStage.vue';
import ObsTemplateThumbnail from './ObsTemplateThumbnail.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiChip from '../ui/UiChip.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

const props = defineProps({
  sideWidth: { type: Number, default: null },
  sideCollapsed: { type: Boolean, default: false },
  compactSideOpen: { type: Boolean, default: false },
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
  previewScene: { type: Object, default: () => ({}) },
  activeKind: { type: String, default: null },
  selectedPresetId: { type: String, default: null },
  appliedPresetIds: { type: Object, default: () => ({}) },
  isApplying: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:selectedPresetId',
  'applyPreset',
  'update:sideWidth',
  'update:sideCollapsed',
  'update:compactSideOpen',
]);
const search = shallowRef('');

const selectedPreset = computed(
  () =>
    props.presets.find((preset) => preset.id === props.selectedPresetId) ??
    props.presets[0] ??
    null,
);
const isApplied = computed(
  () =>
    selectedPreset.value?.id ===
    props.appliedPresetIds[selectedPreset.value?.kind],
);
const isSelectedPresetAvailable = computed(
  () => selectedPreset.value?.availability?.available !== false,
);
const selectedAvailabilitySummary = computed(() => {
  const availability = selectedPreset.value?.availability;
  if (
    !availability?.summary ||
    (availability.available !== false && availability.label === '可用')
  ) {
    return '';
  }
  return availability.summary;
});
const visibleGroups = computed(() =>
  props.templateGroups.filter((group) => group.templates.length),
);
const activeGroup = computed(
  () =>
    visibleGroups.value.find((group) => group.kind === props.activeKind) ??
    visibleGroups.value[0] ??
    null,
);
const filteredTemplates = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return (activeGroup.value?.templates ?? []).filter(
    (preset) =>
      !query ||
      [preset.name, preset.detail, ...(preset.tags ?? [])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
  );
});

function selectPreset(id) {
  emit('update:selectedPresetId', id);
}

function applyPreset(preset) {
  if (
    !preset?.id ||
    preset.availability?.available === false ||
    props.isApplying ||
    preset.id === props.appliedPresetIds[preset.kind]
  ) {
    return;
  }
  emit('applyPreset', preset.id);
}
</script>

<template>
  <section class="obs-template-gallery" aria-label="模板庫">
    <ObsOutputSplitLayout
      aria-label="模板庫"
      main-variant="gallery"
      side-label="模板展示預覽"
      side-variant="detail"
      :side-width="sideWidth"
      :side-collapsed="sideCollapsed"
      :compact-side-open="compactSideOpen"
      @update:side-width="emit('update:sideWidth', $event)"
      @update:side-collapsed="emit('update:sideCollapsed', $event)"
      @update:compact-side-open="emit('update:compactSideOpen', $event)"
    >
      <template #tools
        ><UiSearchBox
          v-model="search"
          class="obs-template-gallery__search"
          label="搜尋模板"
          placeholder="搜尋模板"
      /></template>
      <template #main>
        <div class="obs-template-gallery__catalog" aria-label="模板縮圖">
          <UiScrollLayout
            v-if="activeGroup"
            :key="activeGroup.kind"
            class="obs-template-gallery__group"
            axis="vertical"
            viewport-tag="section"
            viewport-class="obs-template-gallery__group-viewport"
            content-class="obs-template-gallery__grid"
            tabindex="0"
            aria-label="模板縮圖"
          >
            <UiTooltip
              v-for="preset in filteredTemplates"
              :key="preset.id"
              text="查看模板預覽"
            >
              <template #trigger="{ triggerProps }">
                <button
                  v-bind="triggerProps"
                  type="button"
                  class="obs-template-thumb"
                  :class="{
                    'obs-template-thumb--active':
                      preset.id === selectedPreset?.id,
                  }"
                  :aria-pressed="preset.id === selectedPreset?.id"
                  @click="selectPreset(preset.id)"
                  @dblclick="applyPreset(preset)"
                >
                  <ObsTemplateThumbnail :preset="preset" />
                  <div class="obs-template-thumb__body">
                    <span class="obs-template-thumb__name">
                      {{ preset.name }}
                    </span>
                    <Check
                      v-if="preset.id === appliedPresetIds[preset.kind]"
                      :size="ICON_SIZE"
                      aria-label="已套用"
                    />
                  </div>
                </button>
              </template>
            </UiTooltip>
            <UiHint
              v-if="!filteredTemplates.length"
              class="obs-template-gallery__empty"
              role="status"
            >
              找不到符合的模板
            </UiHint>
          </UiScrollLayout>
          <UiHint v-else class="obs-template-gallery__empty" role="status">
            尚無可用模板
          </UiHint>
        </div>
      </template>

      <template #side-header>
        <div v-if="selectedPreset" class="obs-template-gallery__detail-header">
          <div class="obs-template-gallery__heading">
            <h2 class="obs-template-gallery__detail-title">
              {{ selectedPreset.name }}
            </h2>
          </div>
        </div>
        <UiHint v-else class="obs-template-gallery__empty">尚未選擇模板</UiHint>
      </template>

      <template #side>
        <ObsTemplatePreviewStage
          v-if="selectedPreset"
          :preset="selectedPreset"
          :scene="previewScene"
        />
        <div v-if="selectedPreset" class="obs-template-gallery__detail-copy">
          <p class="obs-template-gallery__detail-summary">
            {{ selectedPreset.detail }}
          </p>
          <p
            v-if="selectedAvailabilitySummary"
            class="obs-template-gallery__availability"
          >
            {{ selectedAvailabilitySummary }}
          </p>
          <div class="obs-template-gallery__tags" aria-label="模板特性">
            <UiChip v-for="tag in selectedPreset.tags" :key="tag" tone="muted">
              {{ tag }}
            </UiChip>
          </div>
        </div>
      </template>

      <template #side-footer>
        <div v-if="selectedPreset" class="obs-template-gallery__actions">
          <UiButton
            variant="accent"
            :disabled="isApplying || isApplied || !isSelectedPresetAvailable"
            @click="applyPreset(selectedPreset)"
          >
            {{
              !isSelectedPresetAvailable
                ? '尚未提供'
                : isApplied
                  ? '已套用'
                  : '套用模板'
            }}
          </UiButton>
        </div>
      </template>
    </ObsOutputSplitLayout>
  </section>
</template>

<style scoped>
.obs-template-gallery {
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.obs-template-gallery__search {
  min-width: 0;
  flex: 1;
}

.obs-template-gallery__catalog {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.obs-template-gallery__group {
  --ui-scroll-layout-padding-block-start: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-block-end: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-inline-start: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-inline-end: var(--ui-focus-width);
  min-height: 0;
  min-width: 0;
}

.obs-template-gallery__group :deep(.obs-template-gallery__grid) {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, var(--ui-output-gallery-tile-min-width)), 1fr)
  );
  align-content: start;
  gap: var(--ui-space-3);
  min-width: 0;
}

.obs-template-thumb {
  min-width: 0;
  min-height: var(--ui-output-template-thumb-min-height);
  display: grid;
  grid-template-rows: auto minmax(var(--ui-control-height), auto);
  align-content: start;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.obs-template-thumb:hover {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
}

.obs-template-thumb:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-template-thumb--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
}

.obs-template-thumb__body,
.obs-template-gallery__heading,
.obs-template-gallery__tags,
.obs-template-gallery__actions {
  display: flex;
  align-items: center;
}

.obs-template-thumb__body {
  flex: 1;
  gap: var(--ui-space-2);
  min-width: 0;
  padding-inline: var(--ui-space-2);
}

.obs-template-thumb__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-body-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-gallery__detail-header,
.obs-template-gallery__detail-copy {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.obs-template-gallery__detail-header {
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-1);
}

.obs-template-gallery__actions {
  padding-block-start: var(--ui-space-3);
}

.obs-template-gallery__heading {
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-template-gallery__detail-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.obs-template-gallery__detail-summary,
.obs-template-gallery__availability {
  max-inline-size: 56ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.obs-template-gallery__availability {
  padding-inline-start: var(--ui-space-2);
  border-inline-start: var(--ui-border-width) solid
    var(--ui-color-border-strong);
}

.obs-template-gallery__tags {
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.obs-template-gallery__actions {
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
