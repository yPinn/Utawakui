<script setup>
import { ICON_SIZE, Plus, SquareCheckBig } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

defineProps({
  configs: { type: Array, default: () => [] },
});
</script>

<template>
  <section class="obs-config-list" aria-label="已保存配置">
    <header class="obs-config-list__header">
      <div>
        <h2 class="obs-config-list__title">我的配置</h2>
      </div>
      <UiButton :icon="Plus" title="新增配置" disabled>新增配置</UiButton>
    </header>

    <div class="obs-config-list__rows">
      <article
        v-for="config in configs"
        :key="config.id"
        class="obs-config-row"
      >
        <div class="obs-config-row__status" aria-hidden="true">
          <SquareCheckBig :size="ICON_SIZE" />
        </div>
        <div class="obs-config-row__copy">
          <div class="obs-config-row__heading">
            <h3 class="obs-config-row__name">{{ config.name }}</h3>
            <UiChip :tone="config.active ? 'accent' : 'muted'">
              {{ config.active ? '使用中' : config.status }}
            </UiChip>
          </div>
          <p class="obs-config-row__summary">{{ config.summary }}</p>
        </div>
        <dl class="obs-config-row__meta">
          <div>
            <dt>來源</dt>
            <dd>{{ config.source }}</dd>
          </div>
          <div>
            <dt>更新</dt>
            <dd>{{ config.updatedAt }}</dd>
          </div>
        </dl>
        <UiButton title="編輯配置" disabled>編輯</UiButton>
      </article>
    </div>
  </section>
</template>

<style scoped>
.obs-config-list {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: start;
  gap: var(--ui-space-3);
  min-width: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.obs-config-list__header,
.obs-config-row,
.obs-config-row__heading,
.obs-config-row__meta {
  display: flex;
  align-items: center;
}

.obs-config-list__header {
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.obs-config-list__title,
.obs-config-row__name {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-config-list__title {
  font-size: var(--ui-font-size-md);
}

.obs-config-row__name {
  min-width: 0;
  overflow: hidden;
  font-size: var(--ui-font-size-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-config-row__summary,
.obs-config-row__meta dd {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-config-list__rows {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
  min-height: 0;
  overflow: auto;
}

.obs-config-row {
  gap: var(--ui-space-2);
  min-width: 0;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
}

.obs-config-row__status {
  display: inline-flex;
  flex: 0 0 var(--ui-icon-button-size-md);
  align-items: center;
  justify-content: center;
  width: var(--ui-icon-button-size-md);
  height: var(--ui-icon-button-size-md);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.obs-config-row__copy {
  flex: 1;
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
}

.obs-config-row__heading {
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-config-row__meta {
  gap: var(--ui-space-4);
  margin: 0;
}

.obs-config-row__meta div {
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.obs-config-row__meta dt {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

@media (max-width: 900px) {
  .obs-config-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .obs-config-row__meta {
    order: 3;
    width: 100%;
  }
}

@media (max-width: 680px) {
  .obs-config-list__header,
  .obs-config-row__heading,
  .obs-config-row__meta {
    align-items: flex-start;
  }

  .obs-config-list__header,
  .obs-config-row__heading {
    flex-direction: column;
  }
}
</style>
