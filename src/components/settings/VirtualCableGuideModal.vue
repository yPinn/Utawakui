<script setup>
import { ExternalLink, Info } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';

// Informational only — no selection state here, unlike CaptureDeviceModal.
// Content is verified against each vendor's own site (see the plan this
// shipped under), not secondhand summaries; only re-check facts here
// against the vendor pages, don't just edit the copy in place.
defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const TOOLS = [
  {
    id: 'vb-cable',
    name: 'VB-CABLE',
    description: '將一個應用程式的聲音傳送至另一個，適合單一音源。',
  },
  {
    id: 'voicemeeter',
    name: 'VoiceMeeter',
    description: '混合麥克風、伴奏等多個聲音來源後再輸出。',
  },
];

function openDownload(targetId) {
  window.Utawakui?.openExternalTarget(targetId);
}
</script>

<template>
  <UiModal
    :open="open"
    title="虛擬音效工具"
    size="notice"
    max-block-size="small"
    @close="emit('close')"
  >
    <template #header-actions>
      <UiIconButton
        :icon="Info"
        label="查看官方授權說明"
        @click="openDownload('vb-audio-licensing')"
      />
    </template>
    <div class="virtual-cable-guide">
      <p class="virtual-cable-guide__intro">
        讓 Utawakui 將伴奏直接送到直播或錄影軟體，不需實體接線。
      </p>

      <ul class="virtual-cable-guide__list">
        <li
          v-for="tool in TOOLS"
          :key="tool.id"
          class="virtual-cable-guide__row"
        >
          <div class="virtual-cable-guide__copy">
            <div class="virtual-cable-guide__heading">
              <h3 class="virtual-cable-guide__name">{{ tool.name }}</h3>
            </div>
            <p class="virtual-cable-guide__description">
              {{ tool.description }}
            </p>
          </div>
          <UiButton :icon="ExternalLink" @click="openDownload(tool.id)">
            前往下載
          </UiButton>
        </li>
      </ul>
      <p class="virtual-cable-guide__description">
        兩者均採 Donationware
        授權，可依使用情況自主定價贊助；專業或組織使用另有付費授權要求，請先確認官方條件。
      </p>
    </div>
  </UiModal>
</template>

<style scoped>
.virtual-cable-guide {
  display: grid;
  gap: var(--ui-space-3);
}

.virtual-cable-guide__intro {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.virtual-cable-guide__list {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.virtual-cable-guide__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-3);
}
.virtual-cable-guide__row + .virtual-cable-guide__row {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

@media (max-width: 560px) {
  .virtual-cable-guide__row {
    grid-template-columns: 1fr;
  }
}

.virtual-cable-guide__copy {
  display: grid;
  gap: var(--ui-space-1);
}

.virtual-cable-guide__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.virtual-cable-guide__name {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-label-line-height);
}

.virtual-cable-guide__description {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
</style>
