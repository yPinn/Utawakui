<script setup>
import { shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiTextField from '../ui/UiTextField.vue';
import DemoActionMenuAppearance from './DemoActionMenuAppearance.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const showModal = shallowRef(false);
const sceneName = shallowRef('歌回主畫面');
const COMPARISON_SECTION_KEYS = new Set(['context-menu']);
</script>

<template>
  <div class="demo-overlays">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="COMPARISON_SECTION_KEYS.has(section.key)"
    >
      <DemoActionMenuAppearance v-if="section.key === 'context-menu'" />

      <div v-else-if="section.key === 'modal'" class="demo-sample-stack">
        <div class="demo-sample-row">
          <UiButton variant="accent" @click="showModal = true">
            開啟對話框
          </UiButton>
        </div>
        <p class="demo-sample-caption">
          Escape、焦點鎖定與焦點復原由共用對話框負責；背景點擊不會丟棄草稿。
        </p>
        <UiModal
          :open="showModal"
          title="重新命名 OBS 場景"
          @close="showModal = false"
        >
          <div class="demo-modal-content">
            <UiTextField
              id="demo-modal-scene"
              v-model="sceneName"
              label="場景名稱"
              hint="名稱只用於目前的本機設定。"
            />
            <div class="demo-modal-content__actions">
              <UiButton variant="ghost" @click="showModal = false">
                取消
              </UiButton>
              <UiButton variant="accent" @click="showModal = false">
                儲存名稱
              </UiButton>
            </div>
          </div>
        </UiModal>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-modal-content {
  display: grid;
  gap: var(--ui-space-5);
}

.demo-modal-content__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
