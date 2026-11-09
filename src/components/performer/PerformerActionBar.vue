<script setup>
import { computed, shallowRef } from 'vue';
import { Play, Pause, SlidersHorizontal } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import PerformerSyncControls from './PerformerSyncControls.vue';
import PerformerDisplayControls from './PerformerDisplayControls.vue';
import { t } from '../../utils/i18n.js';

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
  <div
    class="performer-action-bar"
    role="group"
    :aria-label="t('performer.actionBar.label')"
  >
    <template v-if="$slots['leading-tools']">
      <slot name="leading-tools" />
      <UiSeparator orientation="vertical" />
    </template>
    <UiButtonGroup :label="t('performer.actionBar.playback')">
      <UiIconButton
        class="performer-action-bar__playback"
        :icon="playing ? Pause : Play"
        :label="
          t(playing ? 'performer.actionBar.pause' : 'performer.actionBar.play')
        "
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
      :aria-label="t('performer.actionBar.displayLabel')"
      placement="top-end"
      :close-on-scroll="false"
      focus-on-open
      :panel-style="{
        inlineSize: 'var(--ui-performer-settings-inline-size)',
        outline: 'var(--ui-border-width) solid var(--ui-color-border-strong)',
      }"
    >
      <template #trigger="{ triggerProps }">
        <UiButtonGroup :label="t('performer.actionBar.tools')">
          <UiIconButton
            v-bind="triggerProps"
            :icon="SlidersHorizontal"
            :label="t('performer.actionBar.display')"
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
