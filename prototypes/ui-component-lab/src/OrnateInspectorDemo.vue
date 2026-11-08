<script setup>
/* global URLSearchParams, window */
import { computed, reactive, shallowRef } from 'vue';
import ObsAppearanceField from '../../../src/components/output/ObsAppearanceField.vue';
import ObsPropertySection from '../../../src/components/output/ObsPropertySection.vue';
import ObsTemplateMockup from '../../../src/components/output/ObsTemplateMockup.vue';
import UiButton from '../../../src/components/ui/UiButton.vue';
import UiFolderInspector from '../../../src/components/ui/UiFolderInspector.vue';
import UiSegmentedControl from '../../../src/components/ui/UiSegmentedControl.vue';
import { outputAppearanceFieldsForTemplate } from '../../../shared/outputAppearance.mjs';
import { outputInspectorTabs } from '../../../src/utils/outputInspectorTabs.js';
import { localizeAppearanceField } from '../../../src/utils/outputPanelCopy.js';
import '../../../src/styles/features/output.css';

const preset = { id: 'ornate-vertical', kind: 'lyrics' };
const fields = outputAppearanceFieldsForTemplate(preset.id)
  .map(localizeAppearanceField)
  .sort(
    (left, right) =>
      left.groupOrder - right.groupOrder || left.order - right.order,
  );
const defaults = Object.fromEntries(
  fields.map(({ key, defaultValue }) => [key, defaultValue]),
);
const categories = outputInspectorTabs(fields);
const sides = [
  { id: 'left', label: '左側' },
  { id: 'right', label: '右側' },
];
const labels = [
  { id: 'icon', label: '圖示' },
  { id: 'text', label: '短文字' },
];
const query = new URLSearchParams(window.location.search);
const side = shallowRef(query.get('side') === 'left' ? 'left' : 'right');
const labelMode = shallowRef(query.get('labels') === 'text' ? 'text' : 'icon');
const compactSideOpen = shallowRef(true);
const draft = reactive({ ...defaults });
const recentColors = shallowRef([]);
const savedColors = shallowRef([]);
const modified = (field) => draft[field.key] !== defaults[field.key];
const hasChanges = computed(() => fields.some(modified));
function reset(groupFields) {
  for (const field of groupFields) draft[field.key] = defaults[field.key];
}

function rememberColor(color) {
  recentColors.value = [
    color,
    ...recentColors.value.filter((value) => value !== color),
  ].slice(0, 6);
}

function toggleSavedColor(color) {
  const saved = savedColors.value;
  savedColors.value = saved.includes(color)
    ? saved.filter((value) => value !== color)
    : [color, ...saved];
}
</script>

<template>
  <section class="ornate-lab">
    <header class="ornate-lab__header">
      <div>
        <h2>和風直書外觀</h2>
        <p>點頁籤展開設定，拖曳邊線調整寬度或收合。</p>
      </div>
      <div class="ornate-lab__options">
        <UiSegmentedControl
          v-model="side"
          :items="sides"
          aria-label="工具欄位置"
        />
        <UiSegmentedControl
          v-model="labelMode"
          :items="labels"
          aria-label="頁籤標示"
        />
      </div>
    </header>

    <UiFolderInspector
      v-model:compact-side-open="compactSideOpen"
      class="ornate-lab__inspector obs-output-folder-inspector"
      id-prefix="ornate-lab"
      :items="categories"
      :side="side"
      :label-mode="labelMode"
      aria-label="和風直書工作區"
      side-label="和風直書設定"
      tabs-label="外觀分類"
    >
      <template #main>
        <figure class="ornate-lab__stage" aria-label="和風直書預覽">
          <figcaption class="ornate-lab__caption">
            <span>歌詞預覽</span>
            <span>1920 × 1080</span>
          </figcaption>
          <div class="ornate-lab__canvas">
            <ObsTemplateMockup
              :preset="preset"
              :settings="draft"
              :style="{
                '--ui-output-preview-text': draft.textColor,
                '--ui-output-preview-ornate-paper': draft.textColor,
              }"
              size="thumbnail"
            />
          </div>
        </figure>
      </template>
      <template #side-header="{ item }">
        <h3 class="ornate-lab__panel-title">{{ item?.label }}</h3>
      </template>
      <template #side="{ item }">
        <ObsPropertySection
          v-for="group in item.groups"
          :key="group.id"
          :title="group.label"
          :modified="group.fields.some(modified)"
          @reset="reset(group.fields)"
        >
          <ObsAppearanceField
            v-for="field in group.fields"
            :key="field.key"
            :field="field"
            :model-value="draft[field.key]"
            :disabled="
              field.key === 'lookAmount' && draft.paletteId === 'original'
            "
            :modified="modified(field)"
            :recent-colors="recentColors"
            :saved-colors="savedColors"
            @update:model-value="draft[field.key] = $event"
            @commit-color="rememberColor"
            @toggle-saved-color="toggleSavedColor"
          />
        </ObsPropertySection>
      </template>
      <template #side-footer>
        <UiButton :disabled="!hasChanges" @click="reset(fields)"
          >恢復模板預設</UiButton
        >
      </template>
    </UiFolderInspector>
  </section>
</template>

<style scoped>
.ornate-lab {
  display: grid;
  gap: var(--ui-space-3);
}

.ornate-lab__header,
.ornate-lab__options,
.ornate-lab__caption {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.ornate-lab__header {
  flex-wrap: wrap;
  justify-content: space-between;
}

.ornate-lab__header h2 {
  font-size: var(--ui-font-size-xl);
}

.ornate-lab__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.ornate-lab__options {
  flex-wrap: wrap;
}

.ornate-lab__stage {
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  grid-template-rows: var(--tab-height) minmax(0, 1fr);
  margin: 0;
  border-inline-end: var(--ui-border-width) solid var(--inspector-seam);
  background: var(--ui-color-surface);
}

.ornate-lab
  :deep(.ui-folder-inspector__workspace[data-side='left'])
  .ornate-lab__stage {
  border-inline-end: 0;
  border-inline-start: var(--ui-border-width) solid var(--inspector-seam);
}

.ornate-lab__caption {
  justify-content: space-between;
  padding-inline: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--inspector-seam);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.ornate-lab__canvas {
  container-type: size;
  display: grid;
  align-items: center;
  justify-items: center;
  min-block-size: 0;
  padding: var(--ui-output-preview-inset);
  background: var(--ui-color-canvas);
}

.ornate-lab__canvas :deep(.obs-template-mockup) {
  inline-size: min(100%, calc(100cqh * 16 / 9));
}

@media (max-width: 38rem) {
  .ornate-lab__caption {
    justify-content: start;
  }

  .ornate-lab__caption span + span {
    display: none;
  }
}

.ornate-lab__inspector {
  block-size: clamp(26rem, 66vh, 38rem);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.ornate-lab__panel-title {
  margin: 0;
  padding-block: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-font-size-md);
}
</style>
