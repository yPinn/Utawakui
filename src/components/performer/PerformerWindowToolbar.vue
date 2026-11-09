<script setup>
import UiIconButton from '../ui/UiIconButton.vue';
import { Maximize2, Minimize2, Minus, Pin, X } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';

defineProps({
  fullScreen: { type: Boolean, default: false },
  alwaysOnTop: { type: Boolean, default: false },
});

defineEmits([
  'close',
  'minimize',
  'toggle-always-on-top',
  'toggle-full-screen',
]);
</script>

<template>
  <header class="performer-toolbar">
    <div class="performer-toolbar__identity">
      <span class="performer-toolbar__mark" aria-hidden="true" />
      <span>{{ t('performer.toolbar.title') }}</span>
    </div>
    <div v-if="$slots.layout" class="performer-toolbar__layout">
      <slot name="layout" />
    </div>
    <div class="performer-toolbar__controls">
      <UiIconButton
        :icon="Pin"
        :label="
          t(alwaysOnTop ? 'performer.toolbar.unpin' : 'performer.toolbar.pin')
        "
        :active="alwaysOnTop"
        size="md"
        @click="$emit('toggle-always-on-top')"
      />
      <UiIconButton
        :icon="Minus"
        :label="t('performer.toolbar.minimize')"
        size="md"
        @click="$emit('minimize')"
      />
      <UiIconButton
        :icon="fullScreen ? Minimize2 : Maximize2"
        :label="
          t(
            fullScreen
              ? 'performer.toolbar.exitFullScreen'
              : 'performer.toolbar.fullScreen',
          )
        "
        size="md"
        @click="$emit('toggle-full-screen')"
      />
      <UiIconButton
        :icon="X"
        :label="t('performer.toolbar.close')"
        size="md"
        @click="$emit('close')"
      />
    </div>
  </header>
</template>

<style scoped>
.performer-toolbar {
  height: var(--ui-window-titlebar-block-size);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-left: var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  user-select: none;
  app-region: drag;
  -webkit-app-region: drag;
}

.performer-toolbar__identity,
.performer-toolbar__controls {
  display: flex;
  align-items: center;
}

.performer-toolbar__identity {
  gap: var(--ui-space-2);
  min-width: 0;
}

.performer-toolbar__mark {
  width: var(--ui-status-dot-size);
  height: var(--ui-status-dot-size);
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-accent);
}

.performer-toolbar__controls {
  height: 100%;
  gap: var(--ui-space-1);
  padding-right: var(--ui-space-1);
  app-region: no-drag;
  -webkit-app-region: no-drag;
}

.performer-toolbar__layout {
  min-width: 0;
  app-region: no-drag;
  -webkit-app-region: no-drag;
}
</style>
