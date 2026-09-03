<script setup>
import { ref, shallowRef } from 'vue';
import { Pencil, Trash2 } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiModal from '../ui/UiModal.vue';
import UiTextField from '../ui/UiTextField.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const contextMenu = ref({ open: false, x: 0, y: 0 });
const showModal = shallowRef(false);
const sceneName = shallowRef('歌回主畫面');

const CONTEXT_MENU_ITEMS = [
  { key: 'rename', label: '重新命名', icon: Pencil },
  {
    key: 'more',
    label: '更多選項',
    children: [
      { key: 'duplicate', label: '建立副本' },
      { key: 'export', label: '匯出設定' },
    ],
  },
  { key: 'separator', separator: true },
  { key: 'delete', label: '刪除', icon: Trash2, danger: true },
  { key: 'disabled', label: '目前無法使用', disabled: true },
];

function openContextMenu(event) {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  contextMenu.value = {
    open: true,
    x: Math.round(rect.left),
    y: Math.round(rect.bottom + 4),
  };
}

function closeContextMenu() {
  contextMenu.value = { ...contextMenu.value, open: false };
}
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
      <div v-if="section.key === 'context-menu'" class="demo-sample-stack">
        <div class="demo-sample-row">
          <UiButton
            variant="ghost"
            aria-haspopup="menu"
            :aria-expanded="contextMenu.open"
            @click="openContextMenu"
          >
            開啟快顯選單
          </UiButton>
        </div>
        <p class="demo-sample-caption">
          包含一般項目、子選單、分隔線、危險動作與停用狀態。
        </p>
        <UiContextMenu
          :open="contextMenu.open"
          :x="contextMenu.x"
          :y="contextMenu.y"
          :items="CONTEXT_MENU_ITEMS"
          @select="closeContextMenu"
          @close="closeContextMenu"
        />
      </div>

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
