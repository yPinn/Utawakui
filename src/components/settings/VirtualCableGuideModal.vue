<script setup>
import { ExternalLink, Info } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import { t } from '../../utils/i18n.js';

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
    description: t('audio.guide.tools.vbCable'),
  },
  {
    id: 'voicemeeter',
    name: 'VoiceMeeter',
    description: t('audio.guide.tools.voicemeeter'),
  },
];

function openDownload(targetId) {
  window.Utawakui?.openExternalTarget(targetId);
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('audio.guide.title')"
    size="notice"
    max-block-size="small"
    @close="emit('close')"
  >
    <template #header-actions>
      <UiIconButton
        :icon="Info"
        :label="t('audio.guide.licensing')"
        @click="openDownload('vb-audio-licensing')"
      />
    </template>
    <div class="virtual-cable-guide">
      <p class="virtual-cable-guide__intro">
        {{ t('audio.guide.intro') }}
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
            {{ t('audio.guide.download') }}
          </UiButton>
        </li>
      </ul>
      <p class="virtual-cable-guide__description">
        {{ t('audio.guide.license') }}
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
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.virtual-cable-guide__description {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
</style>
