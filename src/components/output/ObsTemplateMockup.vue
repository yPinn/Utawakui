<script setup>
import { computed } from 'vue';

const props = defineProps({
  preset: { type: Object, default: null },
  size: {
    type: String,
    default: 'detail',
    validator: (value) => ['thumbnail', 'detail'].includes(value),
  },
});

const previewLines = computed(() => props.preset?.preview?.lines ?? []);
</script>

<template>
  <div
    class="obs-template-mockup"
    :data-kind="preset?.kind ?? 'generic'"
    :data-size="size"
    :data-tone="preset?.tone"
    aria-hidden="true"
  >
    <div
      v-if="preset?.kind === 'setlist'"
      class="obs-template-mockup__content obs-template-mockup__content--setlist"
    >
      <strong class="obs-template-mockup__title">
        {{ preset.preview.title }}
      </strong>
      <span
        v-for="line in previewLines"
        :key="line"
        class="obs-template-mockup__queue-line"
      >
        {{ line }}
      </span>
    </div>

    <div
      v-else-if="preset?.kind === 'lyrics'"
      class="obs-template-mockup__content obs-template-mockup__content--lyrics"
    >
      <span class="obs-template-mockup__eyebrow">
        {{ preset.preview.title }}
      </span>
      <strong class="obs-template-mockup__title">
        {{ previewLines[0] ?? preset.name }}
      </strong>
      <span v-if="previewLines[1]" class="obs-template-mockup__secondary">
        {{ previewLines[1] }}
      </span>
    </div>

    <div
      v-else-if="preset?.kind === 'artwork'"
      class="obs-template-mockup__content obs-template-mockup__content--artwork"
    >
      <span class="obs-template-mockup__artwork" />
      <span class="obs-template-mockup__metadata">
        <strong class="obs-template-mockup__title">
          {{ preset.preview.title }}
        </strong>
        <span class="obs-template-mockup__secondary">
          {{ previewLines[0] }}
        </span>
      </span>
    </div>

    <div
      v-else
      class="obs-template-mockup__content obs-template-mockup__content--now-playing"
    >
      <span class="obs-template-mockup__eyebrow">
        {{ preset?.preview?.title ?? 'Preview' }}
      </span>
      <strong class="obs-template-mockup__title">
        {{ previewLines[0] ?? preset?.name ?? 'Template' }}
      </strong>
      <span v-if="previewLines[1]" class="obs-template-mockup__secondary">
        {{ previewLines[1] }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.obs-template-mockup {
  width: 100%;
  aspect-ratio: 16 / 9;
  min-width: 0;
  overflow: hidden;
  display: grid;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-overlay-contrast);
}

.obs-template-mockup[data-size='detail'] {
  max-inline-size: var(--ui-output-gallery-preview-max-width);
  justify-self: center;
}

.obs-template-mockup[data-tone='stage'] {
  background: var(--ui-color-surface-playing);
}

.obs-template-mockup[data-tone='lyrics'] {
  background: var(--ui-color-surface-selected);
}

.obs-template-mockup__content {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
  text-align: left;
}

.obs-template-mockup__content--now-playing {
  align-content: end;
}

.obs-template-mockup__content--lyrics {
  align-content: end;
}

.obs-template-mockup__content--setlist {
  align-content: start;
}

.obs-template-mockup__content--artwork {
  grid-template-columns: minmax(0, 0.4fr) minmax(0, 0.6fr);
  align-content: end;
  align-items: center;
}

.obs-template-mockup__artwork {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-overlay-scrim);
}

.obs-template-mockup__metadata {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.obs-template-mockup__eyebrow,
.obs-template-mockup__secondary {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-overlay-contrast-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__title {
  min-width: 0;
  overflow: hidden;
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__queue-line {
  min-width: 0;
  overflow: hidden;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-overlay-scrim);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__content {
  gap: calc(var(--ui-space-1) / 2);
  padding: var(--ui-space-2);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__title,
.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__queue-line {
  font-size: var(--ui-output-template-thumb-title-font-size);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__eyebrow,
.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__secondary {
  display: none;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__content--setlist
  .obs-template-mockup__queue-line:nth-of-type(n + 3) {
  display: none;
}
</style>
