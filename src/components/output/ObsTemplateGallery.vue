<script setup>
import { computed } from 'vue';
import { Check, ICON_SIZE } from '../../icons/index.js';
import ObsTemplateMockup from './ObsTemplateMockup.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
  selectedPresetId: { type: String, default: null },
  appliedPresetId: { type: String, default: null },
  outputSupported: { type: Boolean, default: false },
  isApplying: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:selectedPresetId',
  'applyPreset',
  'openWorkbench',
]);

const selectedPreset = computed(
  () =>
    props.presets.find((preset) => preset.id === props.selectedPresetId) ??
    props.presets[0] ??
    null,
);
const selectedIndex = computed(() =>
  props.presets.findIndex((preset) => preset.id === selectedPreset.value?.id),
);
const isApplied = computed(
  () => selectedPreset.value?.id === props.appliedPresetId,
);
const visibleGroups = computed(() =>
  props.templateGroups.length
    ? props.templateGroups
    : [{ kind: 'all', label: '模板', templates: props.presets }],
);

function selectPreset(id) {
  emit('update:selectedPresetId', id);
}
</script>

<template>
  <section class="obs-template-gallery" aria-label="模板庫">
    <div class="obs-template-gallery__layout">
      <div class="obs-template-gallery__groups" aria-label="模板縮圖">
        <section
          v-for="group in visibleGroups"
          :key="group.kind"
          class="obs-template-gallery__group"
        >
          <h3 class="obs-template-gallery__group-title">{{ group.label }}</h3>
          <div class="obs-template-gallery__grid">
            <button
              v-for="preset in group.templates"
              :key="preset.id"
              type="button"
              class="obs-template-thumb"
              :class="{
                'obs-template-thumb--active': preset.id === selectedPreset?.id,
              }"
              :aria-pressed="preset.id === selectedPreset?.id"
              @click="selectPreset(preset.id)"
            >
              <ObsTemplateMockup :preset="preset" size="thumbnail" />
              <div class="obs-template-thumb__body">
                <span class="obs-template-thumb__name">{{ preset.name }}</span>
                <UiChip
                  v-if="preset.availability"
                  :tone="preset.availability.tone ?? 'muted'"
                >
                  {{ preset.availability.label }}
                </UiChip>
                <Check
                  v-if="preset.id === appliedPresetId"
                  :size="ICON_SIZE"
                  aria-label="已套用"
                />
              </div>
            </button>
          </div>
        </section>
      </div>

      <aside
        v-if="selectedPreset"
        class="obs-template-gallery__detail"
        aria-label="模板展示預覽"
      >
        <ObsTemplateMockup :preset="selectedPreset" size="detail" />

        <div class="obs-template-gallery__detail-copy">
          <span class="obs-template-gallery__detail-index">
            {{ selectedIndex + 1 }} / {{ presets.length }}
          </span>
          <div class="obs-template-gallery__heading">
            <h2 class="obs-template-gallery__detail-title">
              {{ selectedPreset.name }}
            </h2>
            <UiChip v-if="isApplied" tone="accent">使用中</UiChip>
          </div>
          <p class="obs-template-gallery__detail-summary">
            {{ selectedPreset.detail }}
          </p>
          <p
            v-if="selectedPreset.availability?.summary"
            class="obs-template-gallery__availability"
          >
            {{ selectedPreset.availability.summary }}
          </p>
          <div class="obs-template-gallery__tags" aria-label="模板特性">
            <UiChip v-for="tag in selectedPreset.tags" :key="tag" tone="muted">
              {{ tag }}
            </UiChip>
          </div>
        </div>

        <div class="obs-template-gallery__actions">
          <UiButton @click="emit('openWorkbench')">前往工作台</UiButton>
          <UiButton
            variant="accent"
            :disabled="isApplying || !outputSupported || isApplied"
            @click="emit('applyPreset', selectedPreset.id)"
          >
            {{ isApplied ? '已套用' : '套用模板' }}
          </UiButton>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.obs-template-gallery {
  height: 100%;
  min-height: 0;
  min-width: 0;
  container-type: inline-size;
}

.obs-template-gallery__layout {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns:
    minmax(var(--ui-output-gallery-column-min), 1fr)
    var(--ui-output-gallery-detail-width);
  gap: var(--ui-space-4);
}

.obs-template-gallery__groups {
  min-height: 0;
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-4);
  overflow: auto;
}

.obs-template-gallery__group {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-template-gallery__group-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.obs-template-gallery__grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(var(--ui-output-gallery-tile-min-width), 1fr)
  );
  align-content: start;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-template-thumb {
  min-width: 0;
  min-height: var(--ui-output-template-thumb-min-height);
  display: grid;
  grid-template-rows: auto minmax(var(--ui-control-height), auto);
  align-content: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
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
}

.obs-template-thumb__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-gallery__detail {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-content: start;
  gap: var(--ui-space-3);
  padding-inline-start: var(--ui-space-4);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
  overflow: auto;
}

.obs-template-gallery__detail-copy {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.obs-template-gallery__heading {
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-template-gallery__detail-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-template-gallery__detail-index,
.obs-template-gallery__detail-summary,
.obs-template-gallery__availability {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
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

@container (width < 48rem) {
  .obs-template-gallery__layout {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .obs-template-gallery__groups {
    overflow: visible;
  }

  .obs-template-gallery__detail {
    padding-block-start: var(--ui-space-4);
    padding-inline-start: 0;
    border-block-start: var(--ui-border-width) solid var(--ui-color-border);
    border-inline-start: 0;
    overflow: visible;
  }
}
</style>
