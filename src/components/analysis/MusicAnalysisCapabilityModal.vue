<script setup>
import { computed } from 'vue';
import { Trash2, Wrench } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  capability: { type: Object, default: null },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'repair', 'remove']);

const statusLabel = computed(() => {
  if (props.capability?.status === 'ready') return '已安裝，可離線分析';
  if (props.capability?.status === 'damaged') return '需要修復';
  if (props.capability?.status === 'missing') return '尚未安裝';
  return '無法讀取狀態';
});

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  return `約 ${Math.ceil(bytes / 1024 / 1024)} MB`;
}
</script>

<template>
  <UiModal
    :open="open"
    title="分析功能資訊"
    size="notice"
    @close="emit('close')"
  >
    <div class="analysis-capability-modal">
      <dl class="analysis-capability-modal__facts">
        <div>
          <dt>狀態</dt>
          <dd>{{ statusLabel }}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd>
            {{ capability?.modelName || 'Beat This! small0' }}
            <span v-if="capability?.modelVersion">
              · {{ capability.modelVersion }}</span
            >
          </dd>
        </div>
        <div>
          <dt>下載大小</dt>
          <dd>{{ formatSize(capability?.downloadBytes) }}</dd>
        </div>
        <div>
          <dt>安裝空間</dt>
          <dd>{{ formatSize(capability?.installedBytesEstimate) }}</dd>
        </div>
      </dl>

      <div class="analysis-capability-modal__copy">
        <p>
          Utawakui 會下載固定版本的 Python runtime、CPU
          分析環境與模型，並在啟用前逐一驗證檔案大小與 SHA-256。
        </p>
        <p>
          分析在本機執行；歌曲音訊與 sidecar
          不會上傳。移除功能不會刪除歌曲或既有 sidecar。
        </p>
      </div>

      <UiHint tone="warning">
        Beat This! 只產生 BPM、節拍與強拍；段落分析將由後續 M2 功能補上。
      </UiHint>

      <div
        v-if="capability?.installed"
        class="analysis-capability-modal__actions"
      >
        <UiButton
          :icon="Wrench"
          :disabled="busy || !capability?.canRepair"
          @click="emit('repair')"
        >
          修復安裝
        </UiButton>
        <UiButton
          :icon="Trash2"
          :disabled="busy || !capability?.canRemove"
          @click="emit('remove')"
        >
          移除分析功能
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.analysis-capability-modal {
  display: grid;
  gap: var(--ui-space-4);
}

.analysis-capability-modal__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.analysis-capability-modal__facts > div {
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
}

.analysis-capability-modal__facts dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.analysis-capability-modal__facts dd {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.analysis-capability-modal__facts dd span {
  color: var(--ui-color-text-muted);
}

.analysis-capability-modal__copy {
  display: grid;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.analysis-capability-modal__copy p {
  margin: 0;
}

.analysis-capability-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

@media (max-width: 560px) {
  .analysis-capability-modal__facts {
    grid-template-columns: 1fr;
  }
}
</style>
