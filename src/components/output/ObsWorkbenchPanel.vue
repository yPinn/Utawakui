<script setup>
import ObsOverlayPreview from './ObsOverlayPreview.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

defineProps({
  preset: { type: Object, default: null },
  profile: { type: Object, default: null },
  styleSets: { type: Array, default: () => [] },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  outputError: { type: String, default: '' },
});

const emit = defineEmits(['openGallery']);
</script>

<template>
  <section class="obs-workbench-panel" aria-label="OBS 外觀工作台">
    <main class="obs-workbench-panel__canvas">
      <header class="obs-workbench-panel__canvas-header">
        <div class="obs-workbench-panel__identity">
          <span class="obs-workbench-panel__eyebrow">目前輸出</span>
          <h2 class="obs-workbench-panel__title">
            {{ preset?.name ?? '未選擇模板' }}
          </h2>
        </div>
        <UiButton @click="emit('openGallery')">切換模板</UiButton>
      </header>

      <div class="obs-workbench-panel__stage">
        <ObsOverlayPreview
          :preset="preset"
          :output-status="outputStatus"
          :preview-url="previewUrl"
          :obs-url="obsUrl"
          :error="outputError"
        />
      </div>
    </main>

    <aside class="obs-workbench-panel__inspector" aria-label="模板資訊">
      <section class="obs-workbench-panel__section">
        <span class="obs-workbench-panel__section-label">配置</span>
        <h3 class="obs-workbench-panel__section-title">
          {{ profile?.name ?? '預設輸出配置' }}
        </h3>
        <p class="obs-workbench-panel__section-copy">
          {{ preset?.detail ?? '從模板庫選擇一個可用模板。' }}
        </p>
        <div v-if="preset" class="obs-workbench-panel__tags">
          <UiChip v-for="tag in preset.tags" :key="tag" tone="muted">
            {{ tag }}
          </UiChip>
        </div>
      </section>

      <section v-if="preset" class="obs-workbench-panel__section">
        <h3 class="obs-workbench-panel__section-title">顯示內容</h3>
        <dl class="obs-workbench-panel__settings">
          <div
            v-for="setting in preset.settings"
            :key="setting.label"
            class="obs-workbench-panel__setting"
          >
            <dt>{{ setting.label }}</dt>
            <dd>{{ setting.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="obs-workbench-panel__section">
        <h3 class="obs-workbench-panel__section-title">樣式集</h3>
        <div class="obs-workbench-panel__styles">
          <div
            v-for="set in styleSets"
            :key="set.id"
            class="obs-workbench-panel__style-row"
          >
            <span>{{ set.name }}</span>
            <UiChip :tone="set.tone ?? 'muted'">{{ set.status }}</UiChip>
          </div>
        </div>
      </section>
    </aside>
  </section>
</template>

<style scoped>
.obs-workbench-panel {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    var(--ui-output-workbench-inspector-width);
  gap: var(--ui-space-4);
  container-type: inline-size;
}

.obs-workbench-panel__canvas {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.obs-workbench-panel__canvas-header,
.obs-workbench-panel__tags,
.obs-workbench-panel__style-row {
  display: flex;
  align-items: center;
}

.obs-workbench-panel__canvas-header {
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.obs-workbench-panel__identity {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
}

.obs-workbench-panel__eyebrow,
.obs-workbench-panel__section-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-workbench-panel__title,
.obs-workbench-panel__section-title {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-workbench-panel__title {
  min-width: 0;
  overflow: hidden;
  font-size: var(--ui-font-size-lg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-workbench-panel__stage {
  min-height: 0;
  min-width: 0;
  display: grid;
  place-items: center;
  overflow: auto;
}

.obs-workbench-panel__inspector {
  min-height: 0;
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 0;
  padding-inline-start: var(--ui-space-4);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
  overflow: auto;
}

.obs-workbench-panel__section {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-workbench-panel__section:first-child {
  padding-block-start: 0;
}

.obs-workbench-panel__section:last-child {
  border-bottom: 0;
}

.obs-workbench-panel__section-title {
  font-size: var(--ui-font-size-md);
}

.obs-workbench-panel__section-copy,
.obs-workbench-panel__setting dd {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-workbench-panel__tags {
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.obs-workbench-panel__settings {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
}

.obs-workbench-panel__setting {
  display: grid;
  grid-template-columns: minmax(4rem, 6rem) minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.obs-workbench-panel__setting dt,
.obs-workbench-panel__style-row span {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.obs-workbench-panel__styles {
  display: grid;
  gap: var(--ui-space-1);
}

.obs-workbench-panel__style-row {
  justify-content: space-between;
  gap: var(--ui-space-2);
  min-height: var(--ui-control-height);
}

@container (width < 48rem) {
  .obs-workbench-panel {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .obs-workbench-panel__stage {
    overflow: visible;
  }

  .obs-workbench-panel__inspector {
    padding-block-start: var(--ui-space-4);
    padding-inline-start: 0;
    border-block-start: var(--ui-border-width) solid var(--ui-color-border);
    border-inline-start: 0;
    overflow: visible;
  }
}
</style>
