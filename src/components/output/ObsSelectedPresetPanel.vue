<script setup>
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

defineProps({
  preset: { type: Object, default: null },
});

const emit = defineEmits(['openGallery']);
</script>

<template>
  <section class="obs-selected-preset" aria-label="目前模板">
    <header class="obs-selected-preset__header">
      <div class="obs-selected-preset__identity">
        <span class="obs-selected-preset__label">目前模板</span>
        <h2 class="obs-selected-preset__title">
          {{ preset?.name ?? '未選擇模板' }}
        </h2>
      </div>
      <UiButton title="切換到模板庫" @click="emit('openGallery')">
        模板庫
      </UiButton>
    </header>

    <div v-if="preset" class="obs-selected-preset__body">
      <p class="obs-selected-preset__summary">{{ preset.detail }}</p>
      <div class="obs-selected-preset__tags" aria-label="模板特性">
        <UiChip v-for="tag in preset.tags" :key="tag" tone="muted">
          {{ tag }}
        </UiChip>
      </div>
      <dl class="obs-selected-preset__settings">
        <div
          v-for="setting in preset.settings"
          :key="setting.label"
          class="obs-selected-preset__setting"
        >
          <dt>{{ setting.label }}</dt>
          <dd>{{ setting.value }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.obs-selected-preset {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.obs-selected-preset__header,
.obs-selected-preset__body,
.obs-selected-preset__tags {
  display: flex;
  align-items: center;
}

.obs-selected-preset__header {
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.obs-selected-preset__identity {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
}

.obs-selected-preset__label,
.obs-selected-preset__setting dt {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.obs-selected-preset__title {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-selected-preset__body {
  gap: var(--ui-space-3);
  min-width: 0;
}

.obs-selected-preset__summary,
.obs-selected-preset__setting dd {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-selected-preset__summary {
  flex: 1;
  min-width: 12rem;
}

.obs-selected-preset__tags {
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.obs-selected-preset__settings {
  display: flex;
  gap: var(--ui-space-3);
  margin: 0;
}

.obs-selected-preset__setting {
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

@media (max-width: 900px) {
  .obs-selected-preset__body {
    align-items: flex-start;
    flex-direction: column;
  }

  .obs-selected-preset__summary {
    min-width: 0;
  }
}

@media (max-width: 680px) {
  .obs-selected-preset__header,
  .obs-selected-preset__identity,
  .obs-selected-preset__settings {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
