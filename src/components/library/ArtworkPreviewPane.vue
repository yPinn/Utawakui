<script setup>
import { computed } from 'vue';
import { ImagePlus, Search, Trash2 } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  currentTrack: { type: Object, required: true },
  candidate: { type: Object, default: null },
  searchOpen: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  artworkSaving: { type: Boolean, default: false },
  artworkSearching: { type: Boolean, default: false },
});

const emit = defineEmits(['choose', 'clear', 'openSearch', 'apply']);

const previewTrack = computed(() =>
  props.candidate
    ? {
        title: props.candidate.releaseTitle,
        artist: props.candidate.artistCredit,
        thumbnailUrl: props.candidate.previewUrl,
      }
    : props.currentTrack,
);
</script>

<template>
  <section class="artwork-preview" aria-labelledby="artwork-preview-title">
    <div class="artwork-preview__heading">
      <h3 id="artwork-preview-title">
        {{
          candidate
            ? '候選預覽'
            : currentTrack.thumbnailUrl
              ? '目前封面'
              : '封面'
        }}
      </h3>
      <UiChip v-if="candidate" tone="warning">尚未套用</UiChip>
    </div>

    <UiTrackThumb
      class="artwork-preview__thumb"
      :class="{ 'is-loading': candidate?.previewLoading }"
      :track="previewTrack"
      size="var(--track-metadata-preview-size)"
      :decorative="false"
      :aria-label="
        candidate
          ? '候選封面預覽'
          : currentTrack.thumbnailUrl
            ? '目前封面'
            : '尚未設定封面'
      "
    >
      <template #overlay>
        <span
          v-if="candidate?.previewLoading"
          class="artwork-preview__loading"
          role="status"
        >
          <span class="ui-visually-hidden">候選封面載入中</span>
        </span>
      </template>
    </UiTrackThumb>

    <UiButton
      v-if="candidate"
      variant="accent"
      :loading="artworkSaving"
      loading-label="套用中"
      :disabled="disabled || artworkSearching"
      @click="emit('apply')"
    >
      套用這張封面
    </UiButton>

    <div class="artwork-preview__actions">
      <UiButton
        v-if="!searchOpen"
        variant="accent"
        :icon="Search"
        :disabled="disabled || artworkSearching"
        @click="emit('openSearch')"
      >
        搜尋線上封面
      </UiButton>
      <div class="artwork-preview__utility-actions">
        <UiIconButton
          :icon="ImagePlus"
          label="從電腦選擇圖片"
          :disabled="disabled"
          @click="emit('choose')"
        />
        <UiIconButton
          v-if="currentTrack.thumbnailUrl"
          :icon="Trash2"
          label="移除封面"
          :disabled="disabled"
          @click="emit('clear')"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.artwork-preview {
  --track-metadata-preview-size: 13rem;

  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ui-space-3);
}

.artwork-preview__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.artwork-preview__heading h3 {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.artwork-preview__thumb {
  align-self: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.artwork-preview__loading {
  position: absolute;
  inset: 0;
  background: var(--ui-color-surface-hover);
  opacity: 0.72;
  animation: artwork-preview-loading 1.4s ease-in-out infinite alternate;
}

@keyframes artwork-preview-loading {
  to {
    opacity: 0.38;
  }
}

:global(:root[data-ui-motion='reduced']) .artwork-preview__loading {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .artwork-preview__loading {
    animation: none;
  }
}

.artwork-preview__actions {
  display: grid;
  gap: var(--ui-space-1);
}

.artwork-preview__utility-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

@media (max-width: 760px) {
  .artwork-preview {
    --track-metadata-preview-size: 7rem;

    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    align-items: start;
  }

  .artwork-preview__heading,
  .artwork-preview__actions,
  .artwork-preview > :deep(.ui-btn) {
    grid-column: 2;
  }

  .artwork-preview__thumb {
    grid-row: 1 / span 3;
    grid-column: 1;
  }
}
</style>
