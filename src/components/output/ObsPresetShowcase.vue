<script setup>
import { computed } from 'vue';
import { Check, ICON_SIZE } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
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

function selectPreset(id) {
  emit('update:selectedPresetId', id);
}
</script>

<template>
  <section class="obs-preset-showcase" aria-label="預設集展示">
    <div class="obs-preset-showcase__layout">
      <div class="obs-preset-showcase__grid" aria-label="可用模板">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="obs-preset-card"
          :class="{
            'obs-preset-card--active': preset.id === selectedPreset?.id,
          }"
          :aria-pressed="preset.id === selectedPreset?.id"
          @click="selectPreset(preset.id)"
        >
          <div class="obs-preset-card__preview" :data-tone="preset.tone">
            <div class="obs-preset-card__stage">
              <span class="obs-preset-card__stage-title">
                {{ preset.preview.title }}
              </span>
              <span
                v-for="line in preset.preview.lines"
                :key="line"
                class="obs-preset-card__line"
              >
                {{ line }}
              </span>
            </div>
          </div>
          <div class="obs-preset-card__body">
            <div class="obs-preset-card__heading">
              <span class="obs-preset-card__name">{{ preset.name }}</span>
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
            <p class="obs-preset-card__summary">{{ preset.summary }}</p>
            <div class="obs-preset-card__tags" aria-label="模板特性">
              <UiChip v-for="tag in preset.tags" :key="tag" tone="muted">
                {{ tag }}
              </UiChip>
            </div>
          </div>
        </button>
      </div>

      <aside v-if="selectedPreset" class="obs-preset-showcase__detail">
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
}

.obs-preset-showcase__layout {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
  gap: var(--ui-space-4);
}

.obs-preset-card__heading {
  display: flex;
  align-items: center;
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
.obs-preset-card__summary,
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

.obs-preset-showcase__grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  align-content: start;
  gap: var(--ui-space-2);
  min-width: 0;
  overflow: auto;
}

.obs-preset-card {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.obs-preset-card:hover {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
}

.obs-preset-card:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-preset-card--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
}

.obs-preset-card__preview {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  display: grid;
  align-items: end;
  padding: var(--ui-space-2);
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

.obs-preset-card__preview[data-tone='stage'] {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--ui-color-surface-playing) 56%, transparent),
      var(--ui-color-canvas)
    ),
    var(--ui-color-canvas);
}

.obs-preset-card__preview[data-tone='lyrics'] {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-color-surface-selected) 80%, transparent),
      var(--ui-color-canvas)
    ),
    var(--ui-color-canvas);
}

.obs-preset-card__preview[data-tone='minimal'] {
  background: var(--ui-color-canvas);
}

.obs-preset-card__stage {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
}

.obs-preset-card__stage-title {
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-title);
}

.obs-preset-card__line {
  min-width: 0;
  overflow: hidden;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-preset-card__body {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
}

.obs-preset-card__heading {
  gap: var(--ui-space-2);
}

.obs-preset-card__name {
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

.obs-preset-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.obs-preset-showcase__detail {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
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
  grid-template-columns: minmax(4rem, 7rem) minmax(0, 1fr);
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

@media (max-width: 900px) {
  .obs-preset-showcase__layout {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .obs-preset-showcase__grid {
    overflow: visible;
  }
}

@media (max-width: 680px) {
  .obs-preset-showcase__setting {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
}
</style>
