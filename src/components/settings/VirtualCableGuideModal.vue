<script setup>
import { ExternalLink } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
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
    tag: '推薦：最簡單',
    tagTone: 'success',
    description: '一對一音訊路由，安裝最快、設定最少。免費。',
    url: 'https://vb-audio.com/Cable/',
  },
  {
    id: 'voicemeeter',
    name: 'VoiceMeeter',
    tag: '需混合多個音源',
    tagTone: 'info',
    description: '完整虛擬混音台，可同時混合多個聲音來源。免費。',
    url: 'https://vb-audio.com/Voicemeeter/',
  },
];

function openDownload(url) {
  window.Utawakui?.openExternalUrl(url);
}
</script>

<template>
  <UiModal
    :open="open"
    title="虛擬音效裝置怎麼選"
    size="wide"
    @close="emit('close')"
  >
    <div class="virtual-cable-guide">
      <p class="virtual-cable-guide__intro">
        虛擬音效裝置讓 Utawakui 把伴奏直接送給 OBS 擷取，不需要實體接線。
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
              <UiChip :tone="tool.tagTone">{{ tool.tag }}</UiChip>
            </div>
            <p class="virtual-cable-guide__description">
              {{ tool.description }}
            </p>
          </div>
          <UiButton :icon="ExternalLink" @click="openDownload(tool.url)">
            前往官網下載
          </UiButton>
        </li>
      </ul>
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
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
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
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
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
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.virtual-cable-guide__description {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
