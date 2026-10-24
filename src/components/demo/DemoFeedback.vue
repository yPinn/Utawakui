<script setup>
import DemoNoticeNotificationRecipe from './DemoNoticeNotificationRecipe.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoProductionSample from './DemoProductionSample.vue';
import DemoChipAppearance from './DemoChipAppearance.vue';
import DemoHintAppearance from './DemoHintAppearance.vue';
import DemoNoticeAppearance from './DemoNoticeAppearance.vue';
import DemoProgressAppearance from './DemoProgressAppearance.vue';
import DemoStatusIconAppearance from './DemoStatusIconAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});
</script>

<template>
  <div class="demo-feedback">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <DemoProductionSample
        v-if="
          ['chips', 'status-icons', 'hints', 'notices'].includes(section.key)
        "
        :kind="section.key"
      />

      <DemoChipAppearance v-if="section.key === 'chips'" />

      <DemoStatusIconAppearance v-else-if="section.key === 'status-icons'" />

      <DemoHintAppearance v-else-if="section.key === 'hints'" />

      <DemoNoticeAppearance v-else-if="section.key === 'notices'" />

      <DemoProgressAppearance v-else-if="section.key === 'progress'" />

      <div v-else-if="section.key === 'skeleton'" class="demo-skeleton-sample">
        <UiSkeleton
          :lines="3"
          pattern="staggered"
          aria-label="正在載入外觀預設"
        />
        <p class="demo-sample-caption">顯示載入占位，並提供可讀的載入名稱。</p>
      </div>

      <DemoNoticeNotificationRecipe
        v-else-if="section.key === 'notification-host'"
      />
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-feedback {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-skeleton-sample {
  width: min(36rem, 100%);
  display: grid;
  justify-items: start;
  gap: var(--ui-space-3);
}

.demo-skeleton-sample :deep(.ui-skeleton) {
  width: 100%;
}
</style>
