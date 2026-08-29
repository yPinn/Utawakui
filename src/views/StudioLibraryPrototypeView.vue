<script setup>
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { useTheme } from '../composables/useTheme.js';

const { theme } = useTheme();
const prototypeFrame = useTemplateRef('prototype-frame');
const initialTheme = theme.value;
const forwardedKeys = new Set([
  'm',
  'g',
  'arrowup',
  'arrowdown',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f7',
  'f8',
  'f9',
  'f10',
]);

const search = new URLSearchParams({
  embed: 'dossier',
  clean: '1',
  theme: initialTheme,
  density: 'standard',
  scenario: 'populated',
});
const prototypeUrl = `/prototypes/studio-library-workspace/index.html?${search.toString()}`;

function postToPrototype(message) {
  prototypeFrame.value?.contentWindow?.postMessage(
    message,
    window.location.origin,
  );
}

function syncTheme() {
  postToPrototype({
    type: 'utawakui-prototype-theme',
    theme: theme.value,
  });
}

function handlePrototypeMessage(event) {
  if (
    event.origin !== window.location.origin ||
    event.source !== prototypeFrame.value?.contentWindow
  ) {
    return;
  }

  const data = event.data;
  if (!data || data.type !== 'utawakui-app-shortcut') return;
  const key = typeof data.key === 'string' ? data.key.toLowerCase() : '';
  if (!forwardedKeys.has(key)) return;

  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: data.key,
      ctrlKey: data.ctrlKey === true,
      shiftKey: data.shiftKey === true,
      altKey: data.altKey === true,
      metaKey: data.metaKey === true,
    }),
  );
}

watch(theme, syncTheme);
onMounted(() => window.addEventListener('message', handlePrototypeMessage));
onUnmounted(() =>
  window.removeEventListener('message', handlePrototypeMessage),
);
</script>

<template>
  <section class="studio-library-prototype">
    <iframe
      ref="prototype-frame"
      class="studio-library-prototype__frame"
      :src="prototypeUrl"
      title="Studio Library dossier 開發預覽"
      referrerpolicy="no-referrer"
      @load="syncTheme"
    ></iframe>
  </section>
</template>

<style scoped>
.studio-library-prototype {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-color-surface);
}

.studio-library-prototype__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--ui-color-surface);
}
</style>
