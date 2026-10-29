<script setup>
import { computed } from 'vue';
import { ImagePlus, Search, Trash2 } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  currentTrack: { type: Object, required: true },
  candidate: { type: Object, default: null },
  staged: { type: Boolean, default: false },
  searchOpen: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  artworkPreparing: { type: Boolean, default: false },
  artworkSearching: { type: Boolean, default: false },
});

const emit = defineEmits(['choose', 'clear', 'openSearch']);

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
          staged ? '封面預覽' : currentTrack.thumbnailUrl ? '目前封面' : '封面'
        }}
      </h3>
      <UiChip v-if="staged" tone="warning">待儲存</UiChip>
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
      <template v-if="candidate?.previewLoading" #overlay>
        <UiArtworkLoading label="候選封面載入中" />
      </template>
    </UiTrackThumb>

    <div class="artwork-preview__actions" role="group" aria-label="封面操作">
      <UiIconButton
        :icon="ImagePlus"
        :label="currentTrack.thumbnailUrl ? '更換封面' : '選擇封面'"
        variant="command"
        :loading="artworkPreparing"
        loading-label="準備預覽中"
        :disabled="disabled || artworkSearching"
        @click="emit('choose')"
      />
      <UiIconButton
        v-if="!searchOpen"
        data-artwork-search-trigger
        :icon="Search"
        label="線上搜尋"
        :disabled="disabled || artworkSearching"
        @click="emit('openSearch')"
      />
      <UiIconButton
        v-if="currentTrack.thumbnailUrl"
        :icon="Trash2"
        label="移除封面"
        :disabled="disabled"
        @click="emit('clear')"
      />
    </div>
  </section>
</template>

<style scoped>
.artwork-preview {
  --track-metadata-preview-size: var(--ui-artwork-size-3xl);

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
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.artwork-preview__thumb {
  align-self: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
}

.artwork-preview__actions {
  inline-size: var(--track-metadata-preview-size);
  align-self: center;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

@media (max-width: 760px) {
  .artwork-preview {
    /* Heading top to actions bottom spans one lg artwork edge. */
    --track-metadata-preview-size: var(--ui-artwork-size-lg);

    display: grid;
    grid-template-columns: var(--track-metadata-preview-size) minmax(0, 1fr);
    align-items: start;
  }

  .artwork-preview__heading,
  .artwork-preview__actions {
    grid-column: 2;
  }

  .artwork-preview__actions {
    inline-size: auto;
    align-self: end;
  }

  .artwork-preview__thumb {
    grid-row: 1 / span 2;
    grid-column: 1;
  }
}
</style>
