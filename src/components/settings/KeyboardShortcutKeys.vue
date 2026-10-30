<script setup>
import { computed } from 'vue';
import UiKbd from '../ui/UiKbd.vue';
import { t } from '../../utils/i18n.js';

const keyLabels = {
  'Page Up': ['PgUp', 'Page Up'],
  'Page Down': ['PgDn', 'Page Down'],
  MediaPlayPause: ['Play/Pause', t('shortcuts.keys.mediaPlayPause')],
  MediaTrackPrevious: ['Prev', t('shortcuts.keys.mediaPrevious')],
  MediaTrackNext: ['Next', t('shortcuts.keys.mediaNext')],
  ContextMenu: ['Menu', t('shortcuts.keys.contextMenu')],
  BrowserBack: ['Back', t('shortcuts.keys.browserBack')],
  BrowserForward: ['Fwd', t('shortcuts.keys.browserForward')],
};
const props = defineProps({
  chords: { type: Array, required: true },
  label: { type: String, default: '' },
});
const sharedModifiers = computed(() => {
  const prefix = props.chords[0]?.slice(0, -1) ?? [];
  return props.chords.length > 1 &&
    prefix.length > 0 &&
    prefix.every((key) => ['Ctrl', 'Alt', 'Shift'].includes(key)) &&
    props.chords.every(
      (chord) =>
        chord.length === prefix.length + 1 &&
        prefix.every((key, index) => chord[index] === key),
    )
    ? prefix
    : [];
});
const displayedChords = computed(() =>
  props.chords.map((chord, index) =>
    index && sharedModifiers.value.length
      ? chord.slice(sharedModifiers.value.length)
      : chord,
  ),
);
const accessibleLabel = computed(() => {
  if (!sharedModifiers.value.length) return props.label || undefined;
  const expanded = props.chords
    .map((chord) => chord.map((key) => keyLabels[key]?.[1] ?? key).join(' + '))
    .join(t('shortcuts.keys.or'));
  return props.label
    ? t('shortcuts.keys.labelled', { label: props.label, keys: expanded })
    : expanded;
});
</script>
<template>
  <span
    class="keyboard-shortcut-keys"
    role="group"
    :aria-label="accessibleLabel"
  >
    <span
      v-for="(chord, index) in displayedChords"
      :key="index"
      class="keyboard-shortcut-keys__alternative"
      :aria-hidden="sharedModifiers.length ? true : undefined"
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
