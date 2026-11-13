<script setup>
import { useTemplateRef, watch } from 'vue';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextButton from '../ui/UiTextButton.vue';

// YouTube source form for TrackVideoEditor; the editor owns all state.
const props = defineProps({
  sourceInput: { type: String, default: '' },
  sourceId: { type: String, default: null },
  sourceLabel: { type: String, default: '' },
  previewUrl: { type: String, default: null },
  offer: { type: Object, default: null },
  options: { type: Array, default: () => [] },
  fixture: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});
const previewOpen = defineModel('previewOpen', { type: Boolean });
const selected = defineModel('selected', { type: String });
const permitted = defineModel('permitted', { type: Boolean });
const emit = defineEmits([
  'edit-source',
  'paste-source',
  'preview',
  'lookup',
  'download',
]);
const sourceField = useTemplateRef('sourceField');
const qualityField = useTemplateRef('qualityField');

watch(
  () => props.options.length,
  (count, previous) => {
    if (count && !previous) qualityField.value?.focus();
  },
  { flush: 'post' },
);

defineExpose({ focusSource: () => sourceField.value?.focus() });
</script>

<template>
  <div id="track-video-youtube-source" class="track-video-source">
    <UiSeparator decorative />
    <UiTextField
      id="track-video-source"
      ref="sourceField"
      :model-value="sourceInput"
      :label="t('trackVideo.sourceId')"
      :error="
        sourceInput.trim() && !sourceId ? t('trackVideo.invalidSource') : ''
      "
      :maxlength="2048"
      :disabled="busy"
      @update:model-value="emit('edit-source', $event)"
      @paste="emit('paste-source', $event)"
    >
      <template #action>
        <UiButton
          v-if="sourceId"
          variant="secondary"
          :disabled="busy"
          :aria-expanded="previewOpen"
          aria-controls="track-video-youtube-preview"
          @click="previewOpen = !previewOpen"
          >{{
            previewOpen
              ? t('trackVideo.collapsePreview')
              : t('trackVideo.expandPreview')
          }}</UiButton
        >
      </template>
    </UiTextField>
    <div
      v-if="sourceLabel || previewOpen"
      class="track-video-source__result"
      aria-live="polite"
    >
      <div class="track-video-source__grow">
        <UiHint v-if="sourceLabel">{{ sourceLabel }}</UiHint>
        <UiHint v-if="offer && !options.length">{{
          t('trackVideo.error.no-formats')
        }}</UiHint>
      </div>
      <UiTextButton
        v-if="previewOpen"
        :text="t('trackVideo.previewSource')"
        :disabled="busy"
        overflow="ellipsis"
        @click="emit('preview')"
      />
    </div>
    <div
      v-if="previewOpen && previewUrl"
      id="track-video-youtube-preview"
      class="track-video-source"
    >
      <iframe
        class="track-video-source__youtube"
        :src="previewUrl"
        :title="t('trackVideo.youtubePlayer')"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>
    <div v-if="options.length" class="track-video-source">
      <UiSeparator decorative />
      <div class="track-video-source__row">
        <UiSelect
          id="track-video-quality"
          ref="qualityField"
          v-model="selected"
          class="track-video-source__quality"
          label-inline
          :label="t('trackVideo.quality')"
          :placeholder="t('trackVideo.quality')"
          :options="options"
          :disabled="busy"
        />
        <UiCheckbox
          v-if="!offer?.fixture"
          id="track-video-permission"
          v-model="permitted"
          :label="t('trackVideo.permission')"
          :disabled="busy"
        />
        <div class="track-video-source__actions">
          <UiButton
            variant="accent"
            :disabled="!selected || (!permitted && !offer?.fixture) || busy"
            @click="emit('download')"
            >{{ t('trackVideo.download') }}</UiButton
          >
        </div>
      </div>
    </div>
    <div v-else-if="sourceId || fixture" class="track-video-source__actions">
      <UiButton
        v-if="fixture"
        variant="secondary"
        :disabled="busy"
        @click="emit('lookup', 'fixture')"
        >{{ t('trackVideo.fixture') }}</UiButton
      >
      <UiButton
        v-if="sourceId"
        variant="secondary"
        :disabled="busy"
        @click="emit('lookup')"
        >{{ t('trackVideo.formats') }}</UiButton
      >
    </div>
  </div>
</template>

<style scoped>
.track-video-source {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-3);
}
.track-video-source__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-inline-start: auto;
  gap: var(--ui-space-2);
}
.track-video-source__row,
.track-video-source__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-3);
}
.track-video-source__result {
  overflow-wrap: anywhere;
}
.track-video-source__grow {
  flex: 1 1 auto;
  min-inline-size: 0;
}
.track-video-source__quality {
  inline-size: min(100%, 20rem);
}
.track-video-source__youtube {
  display: block;
  inline-size: 100%;
  max-inline-size: 36rem;
  aspect-ratio: 16 / 9;
  margin-inline: auto;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
}
</style>
