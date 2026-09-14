<script setup>
import { shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiNotificationHost from '../ui/UiNotificationHost.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoChipAppearance from './DemoChipAppearance.vue';
import DemoHintAppearance from './DemoHintAppearance.vue';
import DemoNoticeAppearance from './DemoNoticeAppearance.vue';
import DemoProgressAppearance from './DemoProgressAppearance.vue';
import DemoStatusIconAppearance from './DemoStatusIconAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const COMPARISON_SECTION_KEYS = new Set([
  'chips',
  'status-icons',
  'hints',
  'notices',
  'progress',
]);

const notificationItems = shallowRef([]);
let notificationSequence = 0;

function showNotification() {
  notificationSequence += 1;
  notificationItems.value = [
    {
      id: `catalogue-saved-${notificationSequence}`,
      lifecycle: 'transient',
      announcement: 'polite',
      tone: 'success',
      title: '外觀設定已儲存',
      message: '這是 development-only fixed host 範例。',
      dismissible: true,
    },
  ];
}

function dismissNotification({ id }) {
  notificationItems.value = notificationItems.value.filter(
    (item) => item.id !== id,
  );
}
</script>

<template>
  <div class="demo-feedback">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="COMPARISON_SECTION_KEYS.has(section.key)"
    >
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
        <p class="demo-sample-caption">
          Placeholder不取得fetch lifecycle；caller必須提供完整loading名稱。
        </p>
      </div>

      <div
        v-else-if="section.key === 'notification-host'"
        class="demo-notification-host-sample"
      >
        <UiButton variant="accent" @click="showNotification">
          顯示固定通知
        </UiButton>
        <p class="demo-sample-caption">
          Host只管理顯示佇列、timer與dismiss；訊息政策及action結果仍由caller擁有。
        </p>
        <UiNotificationHost
          :items="notificationItems"
          @dismiss="dismissNotification"
        />
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-feedback {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-skeleton-sample,
.demo-notification-host-sample {
  width: min(36rem, 100%);
  display: grid;
  justify-items: start;
  gap: var(--ui-space-3);
}

.demo-skeleton-sample :deep(.ui-skeleton) {
  width: 100%;
}
</style>
