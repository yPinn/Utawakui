<script setup>
import { computed, reactive, watch } from 'vue';
import { Check, Palette } from '../../icons/index.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsOverlayPreview from './ObsOverlayPreview.vue';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsOutputTabs from './ObsOutputTabs.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  outputSlot: { type: Object, default: null },
  activeKind: { type: String, default: null },
  slotDefinitions: { type: Array, default: () => [] },
  appearanceOptions: { type: Object, default: () => ({}) },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  outputError: { type: String, default: '' },
  isSaving: { type: Boolean, default: false },
});

const emit = defineEmits(['update:activeKind', 'saveSettings', 'openGallery']);

const draft = reactive({
  fontFamily: 'sans',
  fontScale: 'medium',
  fontWeight: 'semibold',
  alignment: 'center',
  surface: 'transparent',
});

const controls = computed(() => [
  {
    key: 'fontFamily',
    label: '字型',
    options: props.appearanceOptions.fontFamily ?? [],
  },
  {
    key: 'fontScale',
    label: '字級',
    options: props.appearanceOptions.fontScale ?? [],
  },
  {
    key: 'fontWeight',
    label: '字重',
    options: props.appearanceOptions.fontWeight ?? [],
  },
  {
    key: 'alignment',
    label: '對齊',
    options: props.appearanceOptions.alignment ?? [],
  },
  {
    key: 'surface',
    label: '背景',
    options: props.appearanceOptions.surface ?? [],
  },
]);
const kindTabs = computed(() =>
  props.slotDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
  })),
);

const isDirty = computed(() =>
  controls.value.some(
    (control) =>
      draft[control.key] !== props.outputSlot?.settings?.[control.key],
  ),
);

watch(
  () => props.outputSlot,
  (outputSlot) => {
    for (const control of controls.value) {
      draft[control.key] =
        outputSlot?.settings?.[control.key] ?? control.options[0]?.id ?? '';
    }
  },
  { immediate: true, deep: true },
);

function saveSettings() {
  if (!isDirty.value || props.isSaving) return;
  emit(
    'saveSettings',
    Object.fromEntries(controls.value.map(({ key }) => [key, draft[key]])),
  );
}
</script>

<template>
  <ObsOutputSplitLayout
    aria-label="OBS 外觀工作台"
    side-label="外觀設定"
    side-variant="inspector"
  >
    <template #main>
      <main class="obs-slot-workbench__canvas">
        <header class="obs-slot-workbench__canvas-header">
          <ObsOutputTabs
            :items="kindTabs"
            :active-id="activeKind"
            aria-label="目前編輯的 Overlay 類型"
            tab-id-prefix="output-workbench-kind"
            variant="bar"
            @update:active-id="emit('update:activeKind', $event)"
          />
          <UiButton :icon="Palette" @click="emit('openGallery')">
            模板
          </UiButton>
        </header>

        <div class="obs-slot-workbench__stage">
          <ObsOverlayPreview
            :preset="preset"
            :output-status="outputStatus"
            :preview-url="previewUrl"
            :obs-url="obsUrl"
            :error="outputError"
          />
        </div>
      </main>
    </template>

    <template #side>
      <header class="obs-slot-workbench__inspector-header">
        <div>
          <span class="obs-slot-workbench__section-label">外觀</span>
          <h2 class="obs-slot-workbench__title">
            {{ preset?.name ?? '未選擇模板' }}
          </h2>
        </div>
        <UiButton
          :icon="Check"
          variant="accent"
          :disabled="!isDirty || isSaving"
          @click="saveSettings"
        >
          儲存
        </UiButton>
      </header>

      <section class="obs-slot-workbench__section">
        <h3 class="obs-slot-workbench__section-title">文字與背景</h3>
        <div class="obs-slot-workbench__fields">
          <ObsAppearanceControlRow
            v-for="control in controls"
            :key="control.key"
            :control-id="`output-appearance-${control.key}`"
            :label="control.label"
          >
            <select
              :id="`output-appearance-${control.key}`"
              v-model="draft[control.key]"
              class="obs-slot-workbench__select"
            >
              <option
                v-for="option in control.options"
                :key="option.id"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </ObsAppearanceControlRow>
        </div>
      </section>

      <section v-if="preset" class="obs-slot-workbench__section">
        <h3 class="obs-slot-workbench__section-title">模板內容</h3>
        <p class="obs-slot-workbench__section-copy">{{ preset.detail }}</p>
        <div class="obs-slot-workbench__tags">
          <UiChip v-for="tag in preset.tags" :key="tag" tone="muted">
            {{ tag }}
          </UiChip>
        </div>
      </section>
    </template>
  </ObsOutputSplitLayout>
</template>

<style scoped>
.obs-slot-workbench__canvas {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.obs-slot-workbench__canvas-header,
.obs-slot-workbench__inspector-header,
.obs-slot-workbench__tags {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-slot-workbench__canvas-header,
.obs-slot-workbench__inspector-header {
  justify-content: space-between;
}

.obs-slot-workbench__select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-slot-workbench__stage {
  min-height: 0;
  min-width: 0;
  display: grid;
  place-items: center;
  overflow: auto;
}

.obs-slot-workbench__inspector-header,
.obs-slot-workbench__section {
  padding-block: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-slot-workbench__inspector-header {
  padding-block-start: 0;
}

.obs-slot-workbench__section {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.obs-slot-workbench__section:last-child {
  border-bottom: 0;
}

.obs-slot-workbench__section-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-slot-workbench__title,
.obs-slot-workbench__section-title,
.obs-slot-workbench__section-copy {
  margin: 0;
}

.obs-slot-workbench__title,
.obs-slot-workbench__section-title {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-slot-workbench__title {
  font-size: var(--ui-font-size-lg);
}

.obs-slot-workbench__section-title {
  font-size: var(--ui-font-size-md);
}

.obs-slot-workbench__section-copy {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-slot-workbench__fields {
  min-width: 0;
  display: grid;
}

.obs-slot-workbench__select {
  width: 100%;
  min-width: 0;
  height: var(--ui-control-height);
  padding-inline: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  cursor: pointer;
}

.obs-slot-workbench__tags {
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

@container (width < 48rem) {
  .obs-slot-workbench__stage {
    overflow: visible;
  }
}
</style>
