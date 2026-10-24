<script setup>
import { ref } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import DemoActionMenuAppearance from './DemoActionMenuAppearance.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoModalAppearance from './DemoModalAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const popoverOpen = ref(false);
</script>

<template>
  <div class="demo-overlays">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <DemoActionMenuAppearance v-if="section.key === 'context-menu'" />
      <DemoModalAppearance v-else-if="section.key === 'modal'" />

      <div v-else-if="section.key === 'tooltip'" class="demo-overlay-sample">
        <UiTooltip text="重新整理型錄資料">
          <template #trigger="{ triggerProps }">
            <UiButton v-bind="triggerProps">重新整理</UiButton>
          </template>
        </UiTooltip>
        <UiOverflowTooltip
          class="demo-overflow-tooltip"
          tabindex="0"
          text="只有實際截斷時才顯示完整名稱"
        />
        <p class="demo-sample-caption">
          Tooltip只補充描述，不能承載互動或取代可見control label。
        </p>
      </div>

      <div v-else-if="section.key === 'popover'" class="demo-overlay-sample">
        <UiPopover
          v-model:open="popoverOpen"
          aria-label="外觀快速選項"
          :close-on-scroll="false"
        >
          <template #trigger="{ triggerProps }">
            <UiButton v-bind="triggerProps" @click="popoverOpen = !popoverOpen">
              外觀快速選項
            </UiButton>
          </template>
          <template #header>外觀快速選項</template>
          <div class="demo-popover-content">
            <p>這是非 Modal 內容面板，不包含menu語意、inert或focus trap。</p>
          </div>
          <template #footer>
            <UiButton variant="accent" @click="popoverOpen = false">
              完成
            </UiButton>
          </template>
        </UiPopover>
        <p class="demo-sample-caption">
          Caller擁有trigger與內容；Popover只處理錨定、碰撞與dismissal。
        </p>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-overlays :deep(.demo-overflow-tooltip) {
  display: block;
  max-inline-size: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-overlays :deep(.demo-overflow-tooltip:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>

<style scoped>
.demo-overlays {
  display: grid;
  gap: var(--ui-space-6);
}

.demo-overlay-sample {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.demo-overlay-sample > .demo-sample-caption {
  flex: 1 1 20rem;
}

.demo-popover-content {
  width: min(18rem, calc(100vw - (2 * var(--ui-floating-viewport-inset))));
}

.demo-popover-content p {
  margin: 0;
  color: var(--ui-color-text-muted);
}
</style>
