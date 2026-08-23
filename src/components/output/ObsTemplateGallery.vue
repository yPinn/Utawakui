<script setup>
import { computed } from 'vue';
import { Check, ICON_SIZE } from '../../icons/index.js';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsOutputTabs from './ObsOutputTabs.vue';
import ObsTemplateMockup from './ObsTemplateMockup.vue';
import ObsTemplatePreviewStage from './ObsTemplatePreviewStage.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  presets: { type: Array, default: () => [] },
  templateGroups: { type: Array, default: () => [] },
  previewScene: { type: Object, default: () => ({}) },
  activeKind: { type: String, default: null },
  selectedPresetId: { type: String, default: null },
  appliedPresetIds: { type: Object, default: () => ({}) },
  isApplying: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:activeKind',
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
const hasSelectedPreset = computed(() => Boolean(selectedPreset.value));
const selectedIndex = computed(() =>
  activeGroup.value?.templates.findIndex(
    (preset) => preset.id === selectedPreset.value?.id,
  ),
);
const isApplied = computed(
  () =>
    selectedPreset.value?.id ===
    props.appliedPresetIds[selectedPreset.value?.kind],
);
const visibleGroups = computed(() =>
  props.templateGroups.filter((group) => group.templates.length),
);
const categoryTabs = computed(() =>
  visibleGroups.value.map((group) => ({
    id: group.kind,
    label: group.label,
    count: group.templates.length,
  })),
);
const activeGroup = computed(
  () =>
    visibleGroups.value.find((group) => group.kind === props.activeKind) ??
    visibleGroups.value[0] ??
    null,
);

function selectPreset(id) {
  emit('update:selectedPresetId', id);
}

function selectKind(kind) {
  emit('update:activeKind', kind);
  const group = visibleGroups.value.find(
    (candidate) => candidate.kind === kind,
  );
  if (
    !group?.templates.some((preset) => preset.id === props.selectedPresetId)
  ) {
    emit('update:selectedPresetId', group?.templates[0]?.id ?? null);
  }
}

function applyPreset(preset) {
  if (
    !preset?.id ||
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
      :side-visible="hasSelectedPreset"
    >
      <template #main>
        <div class="obs-template-gallery__catalog" aria-label="模板縮圖">
          <ObsOutputTabs
            :items="categoryTabs"
            :active-id="activeGroup?.kind ?? null"
            aria-label="Overlay 類型"
            tab-id-prefix="output-kind"
            panel-id-prefix="output-kind"
            variant="panel"
            @update:active-id="selectKind"
          />

          <section
            v-if="activeGroup"
            :id="`output-kind-${activeGroup.kind}-panel`"
            :key="activeGroup.kind"
            class="obs-template-gallery__group"
            role="tabpanel"
            :aria-labelledby="`output-kind-${activeGroup.kind}-tab`"
          >
            <div class="obs-template-gallery__grid">
              <button
                v-for="preset in activeGroup.templates"
                :key="preset.id"
                type="button"
                class="obs-template-thumb"
                :class="{
                  'obs-template-thumb--active':
                    preset.id === selectedPreset?.id,
                }"
                :aria-pressed="preset.id === selectedPreset?.id"
                title="查看模板預覽"
                @click="selectPreset(preset.id)"
                @dblclick="applyPreset(preset)"
              >
                <ObsTemplateMockup
                  :preset="preset"
                  :scene="previewScene"
                  size="thumbnail"
                  :animated="false"
                />
                <div class="obs-template-thumb__body">
                  <span class="obs-template-thumb__name">
                    {{ preset.name }}
                  </span>
                  <UiChip
                    v-if="preset.availability"
                    :tone="preset.availability.tone ?? 'muted'"
                  >
                    {{ preset.availability.label }}
                  </UiChip>
                  <Check
                    v-if="preset.id === appliedPresetIds[preset.kind]"
                    :size="ICON_SIZE"
                    aria-label="已套用"
                  />
                </div>
                <div class="obs-template-thumb__meta">
                  <span>{{ preset.preview.layoutLabel }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ preset.preview.motionLabel }}</span>
                </div>
              </button>
            </div>
          </section>
        </div>
      </template>

      <template #side>
        <ObsTemplatePreviewStage
          :preset="selectedPreset"
          :scene="previewScene"
        />

        <div class="obs-template-gallery__detail-copy">
          <span class="obs-template-gallery__detail-index">
            {{ selectedIndex + 1 }} / {{ activeGroup?.templates.length ?? 0 }}
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
            <UiChip tone="accent">內建模板</UiChip>
            <UiChip v-for="tag in selectedPreset.tags" :key="tag" tone="muted">
              {{ tag }}
            </UiChip>
          </div>
        </div>

        <div class="obs-template-gallery__actions">
          <UiButton @click="emit('openWorkbench')">前往工作台</UiButton>
          <UiButton
            variant="accent"
            :disabled="isApplying || isApplied"
            @click="applyPreset(selectedPreset)"
          >
            {{ isApplied ? '已套用' : '套用模板' }}
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
  container-type: inline-size;
}

.obs-template-gallery__catalog {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: start;
  gap: var(--ui-space-3);
}

.obs-template-gallery__group {
  min-height: 0;
  min-width: 0;
  overflow: auto;
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
  grid-template-rows: auto minmax(var(--ui-control-height), auto) auto;
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
.obs-template-thumb__meta,
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

.obs-template-thumb__meta {
  gap: var(--ui-space-1);
  min-width: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-output-template-thumb-title-font-size);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
}

.obs-template-thumb__meta > span {
  overflow: hidden;
  text-overflow: ellipsis;
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
  .obs-template-gallery__catalog {
    overflow: visible;
  }
}
</style>
