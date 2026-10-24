<script setup>
import { computed, shallowRef } from 'vue';
import { Play, Pause, SlidersHorizontal } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import PerformerSyncControls from './PerformerSyncControls.vue';
import PerformerDisplayControls from './PerformerDisplayControls.vue';

const props = defineProps({
  frame: { type: Object, required: true },
  readingScale: { type: String, default: 'desk' },
  pending: { type: Boolean, default: false },
});
defineEmits(['control', 'sync-action', 'update:readingScale']);
const displayOpen = shallowRef(false);
const playing = computed(() =>
  ['playing', 'buffering', 'seeking'].includes(props.frame.playbackStatus),
);
</script>

<template>
  <div class="performer-action-bar" role="group" aria-label="提詞器操作列">
    <UiButtonGroup label="播放控制">
      <UiIconButton
        class="performer-action-bar__playback"
        :icon="playing ? Pause : Play"
        :label="playing ? '暫停' : '播放'"
        :disabled="!frame.trackId"
        :aria-busy="pending || undefined"
        @click="$emit('control', playing ? 'pause' : 'play')"
      />
    </UiButtonGroup>
    <UiSeparator orientation="vertical" />
    <PerformerSyncControls
      :offset="frame.lyricsOffset"
      @action="$emit('sync-action', $event)"
    />
    <UiSeparator orientation="vertical" />
    <UiPopover
      v-model:open="displayOpen"
      aria-label="提詞器顯示設定"
      placement="top-end"
      :close-on-scroll="false"
      focus-on-open
      :panel-style="{
        inlineSize: 'var(--ui-performer-settings-inline-size)',
        outline: 'var(--ui-border-width) solid var(--ui-color-border-strong)',
      }"
    >
      <template #trigger="{ triggerProps }">
        <UiButtonGroup label="顯示工具">
          <UiIconButton
            v-bind="triggerProps"
            :icon="SlidersHorizontal"
            label="顯示設定"
            :active="displayOpen"
            @click="displayOpen = !displayOpen"
          />
        </UiButtonGroup>
      </template>
      <PerformerDisplayControls
        :reading-scale="readingScale"
        :reading-variant="frame.readingVariant"
        :reading-variants="frame.readingVariants"
        :preparing="frame.readingPreparing || pending"
        :error="frame.readingError"
        @update:reading-scale="$emit('update:readingScale', $event)"
        @update:reading-variant="$emit('control', `reading-${$event}`)"
      />
    </UiPopover>
  </div>
</template>

<style scoped>
.performer-action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  min-width: 0;
}
.performer-action-bar :deep(.ui-icon-btn) {
  min-block-size: var(--ui-performer-action-min-block-size);
  min-inline-size: var(--ui-performer-action-min-block-size);
}
</style>
