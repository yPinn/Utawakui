<script setup>
import { computed } from 'vue';
import { Check, ICON_SIZE } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
  selectedPresetId: { type: String, default: null },
});

const emit = defineEmits(['update:selectedPresetId']);

const selectedPreset = computed(
  () =>
    props.presets.find((preset) => preset.id === props.selectedPresetId) ??
    props.presets[0] ??
    null,
);
const selectedIndex = computed(() =>
  props.presets.findIndex((preset) => preset.id === selectedPreset.value?.id),
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
  <section class="obs-preset-showcase" aria-label="預設集展示">
    <div class="obs-preset-showcase__layout">
      <div class="obs-preset-showcase__groups" aria-label="模板縮圖">
        <section
          v-for="group in visibleGroups"
          :key="group.kind"
          class="obs-preset-showcase__group"
        >
          <h3 class="obs-preset-showcase__group-title">{{ group.label }}</h3>
          <div class="obs-preset-showcase__grid">
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
              <div class="obs-template-thumb__preview" :data-tone="preset.tone">
                <div class="obs-template-thumb__stage">
                  <span class="obs-template-thumb__stage-title">
                    {{ preset.preview.title }}
                  </span>
                </div>
              </div>
              <div class="obs-template-thumb__body">
                <span class="obs-template-thumb__name">{{ preset.name }}</span>
                <UiChip
                  v-if="preset.availability"
                  :tone="preset.availability.tone ?? 'muted'"
                >
                  {{ preset.availability.label }}
                </UiChip>
                <Check
                  v-if="preset.id === selectedPreset?.id"
                  :size="ICON_SIZE"
                  aria-hidden="true"
                />
              </div>
            </button>
          </div>
        </section>
      </div>

      <aside
        v-if="selectedPreset"
        class="obs-preset-showcase__detail"
        aria-label="模板展示預覽"
      >
        <div
          class="obs-preset-showcase__preview"
          :data-tone="selectedPreset.tone"
        >
          <div class="obs-preset-showcase__stage">
            <span class="obs-preset-showcase__stage-title">
              {{ selectedPreset.preview.title }}
            </span>
            <span
              v-for="line in selectedPreset.preview.lines"
              :key="line"
              class="obs-preset-showcase__line"
            >
              {{ line }}
            </span>
          </div>
        </div>

        <div class="obs-preset-showcase__detail-copy">
          <span class="obs-preset-showcase__detail-index">
            {{ selectedIndex + 1 }} / {{ presets.length }}
          </span>
          <h2 class="obs-preset-showcase__detail-title">
            {{ selectedPreset.name }}
          </h2>
          <p class="obs-preset-showcase__detail-summary">
            {{ selectedPreset.detail }}
          </p>
          <p
            v-if="selectedPreset.availability?.summary"
            class="obs-preset-showcase__availability"
          >
            {{ selectedPreset.availability.summary }}
          </p>
          <div class="obs-preset-showcase__tags" aria-label="模板特性">
            <UiChip v-for="tag in selectedPreset.tags" :key="tag" tone="muted">
              {{ tag }}
            </UiChip>
          </div>
        </div>
        <dl class="obs-preset-showcase__settings">
          <div
            v-for="setting in selectedPreset.settings"
            :key="setting.label"
            class="obs-preset-showcase__setting"
          >
            <dt>{{ setting.label }}</dt>
            <dd>{{ setting.value }}</dd>
          </div>
        </dl>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.obs-preset-showcase {
  height: 100%;
  min-height: 0;
  min-width: 0;
  container-type: inline-size;
}

.obs-preset-showcase__layout {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns:
    minmax(var(--ui-output-gallery-column-min), 1fr)
    var(--ui-output-gallery-detail-width);
  gap: var(--ui-space-4);
}

.obs-preset-showcase__detail-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-preset-showcase__detail-index,
.obs-preset-showcase__detail-summary,
.obs-preset-showcase__availability,
.obs-preset-showcase__setting dd {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-preset-showcase__availability {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
}

.obs-preset-showcase__groups {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-4);
  min-width: 0;
  overflow: auto;
}

.obs-preset-showcase__group {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-preset-showcase__group-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.obs-preset-showcase__grid {
  display: grid;
  grid-template-columns: 1fr;
  align-content: start;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-template-thumb {
  min-width: 0;
  min-height: var(--ui-output-template-thumb-min-height);
  display: flex;
  align-items: center;
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

.obs-template-thumb__preview {
  flex: 0 0 var(--ui-output-template-thumb-preview-width);
  width: var(--ui-output-template-thumb-preview-width);
  aspect-ratio: 16 / 9;
  overflow: hidden;
  display: grid;
  align-items: end;
  padding: var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width) solid var(--ui-color-border);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--ui-color-canvas) 86%, transparent),
      color-mix(in srgb, var(--ui-color-accent-soft) 70%, transparent)
    ),
    var(--ui-color-canvas);
}

.obs-template-thumb__preview[data-tone='stage'],
.obs-preset-showcase__preview[data-tone='stage'] {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--ui-color-surface-playing) 56%, transparent),
      var(--ui-color-canvas)
    ),
    var(--ui-color-canvas);
}

.obs-template-thumb__preview[data-tone='lyrics'],
.obs-preset-showcase__preview[data-tone='lyrics'] {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-color-surface-selected) 80%, transparent),
      var(--ui-color-canvas)
    ),
    var(--ui-color-canvas);
}

.obs-template-thumb__preview[data-tone='minimal'],
.obs-preset-showcase__preview[data-tone='minimal'] {
  background: var(--ui-color-canvas);
}

.obs-template-thumb__stage {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
}

.obs-template-thumb__stage-title {
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-output-template-thumb-title-font-size);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-title);
}

.obs-template-thumb__body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-template-thumb__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-preset-showcase__preview {
  inline-size: min(100%, var(--ui-output-gallery-preview-max-width));
  aspect-ratio: 16 / 9;
  overflow: hidden;
  display: grid;
  justify-self: center;
  align-items: end;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--ui-color-canvas) 86%, transparent),
      color-mix(in srgb, var(--ui-color-accent-soft) 70%, transparent)
    ),
    var(--ui-color-canvas);
}

.obs-preset-showcase__stage {
  display: grid;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-preset-showcase__stage-title {
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-title);
}

.obs-preset-showcase__line {
  min-width: 0;
  overflow: hidden;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-preset-showcase__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.obs-preset-showcase__detail {
  inline-size: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  align-content: start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.obs-preset-showcase__detail-copy {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-preset-showcase__settings {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
  margin: 0;
  min-height: 0;
  overflow: auto;
}

.obs-preset-showcase__setting {
  display: grid;
  grid-template-columns:
    minmax(
      var(--ui-output-setting-label-width-min),
      var(--ui-output-setting-label-width-max)
    )
    minmax(0, 1fr);
  gap: var(--ui-space-2);
  padding-bottom: var(--ui-space-2);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-preset-showcase__setting:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.obs-preset-showcase__setting dt {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

@container (width < 48rem) {
  .obs-preset-showcase__layout {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .obs-preset-showcase__groups {
    overflow: visible;
  }

  .obs-template-thumb__preview {
    flex-basis: var(--ui-output-template-thumb-preview-width-compact);
    width: var(--ui-output-template-thumb-preview-width-compact);
  }
}

@container (width < 40rem) {
  .obs-preset-showcase__setting {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
}
</style>
