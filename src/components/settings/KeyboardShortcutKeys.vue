<script setup>
import UiKbd from '../ui/UiKbd.vue';

const keyLabels = {
  'Page Up': ['PgUp', 'Page Up'],
  'Page Down': ['PgDn', 'Page Down'],
  MediaPlayPause: ['Play/Pause', '播放／暫停鍵'],
  MediaTrackPrevious: ['Prev', '上一首鍵'],
  MediaTrackNext: ['Next', '下一首鍵'],
  ContextMenu: ['Menu', '選單鍵'],
  BrowserBack: ['Back', '上一頁鍵'],
  BrowserForward: ['Fwd', '下一頁鍵'],
};
defineProps({
  chords: { type: Array, required: true },
  label: { type: String, default: '' },
});
</script>
<template>
  <span
    class="keyboard-shortcut-keys"
    role="group"
    :aria-label="label || undefined"
  >
    <span
      v-for="(chord, index) in chords"
      :key="index"
      class="keyboard-shortcut-keys__alternative"
    >
      <span
        v-if="index"
        class="keyboard-shortcut-keys__separator"
        aria-hidden="true"
        >／</span
      >
      <span class="keyboard-shortcut-keys__chord" data-shortcut-chord>
        <template v-for="(key, keyIndex) in chord" :key="keyIndex"
          ><span
            v-if="keyIndex"
            class="keyboard-shortcut-keys__separator"
            aria-hidden="true"
            >+</span
          ><UiKbd :aria-label="keyLabels[key]?.[1]">{{
            keyLabels[key]?.[0] ?? key
          }}</UiKbd></template
        >
      </span>
    </span>
  </span>
</template>
<style scoped>
.keyboard-shortcut-keys {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-1) var(--ui-space-2);
  min-inline-size: 0;
  max-inline-size: 100%;
}
.keyboard-shortcut-keys__alternative,
.keyboard-shortcut-keys__chord {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ui-space-1);
  white-space: nowrap;
}
.keyboard-shortcut-keys__separator {
  color: var(--ui-color-text-muted);
}
</style>
