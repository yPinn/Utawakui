<script setup>
defineProps({
  // Short type label above the title, e.g. 專輯.
  marker: { type: String, default: '' },
  title: { type: String, required: true },
  titleId: { type: String, default: 'folder-dossier-title' },
  titleLang: { type: String, default: undefined },
  // One-line summary values: [{ key, text, lang? }].
  fields: { type: Array, default: () => [] },
  description: { type: String, default: '' },
  artworkShape: {
    type: String,
    default: 'square',
    validator: (value) => ['square', 'round'].includes(value),
  },
});
</script>

<template>
  <section class="app-folder-dossier" :aria-labelledby="titleId">
    <div class="app-folder-dossier__body">
      <div
        class="app-folder-dossier__artwork"
        :class="{
          'app-folder-dossier__artwork--round': artworkShape === 'round',
        }"
        data-artwork-reveal-scope="focus-within"
      >
        <slot name="artwork" />
      </div>

      <div class="app-folder-dossier__content">
        <span v-if="marker" class="app-folder-dossier__marker">
          {{ marker }}
        </span>
        <h1 :id="titleId" class="app-folder-dossier__title" :lang="titleLang">
          {{ title }}
        </h1>
        <p
          v-if="$slots.owner || fields.length"
          class="app-folder-dossier__summary"
        >
          <span v-if="$slots.owner" class="app-folder-dossier__owner">
            <slot name="owner" />
          </span>
          <span
            v-for="field in fields"
            :key="field.key"
            class="app-folder-dossier__field"
            :lang="field.lang"
          >
            {{ field.text }}
          </span>
        </p>
        <p v-if="description" class="app-folder-dossier__description">
          {{ description }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.app-folder-dossier {
  min-width: 0;
}

.app-folder-dossier__body {
  min-width: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: end;
  /* Block space only: the artwork shares the paper content edge with the
     action rail and track table. */
  padding-block: var(--ui-space-5);
  background: var(--ui-folder-dossier-background, transparent);
}

/* The hairline wraps the artwork instead of eating into it, so a round
   avatar's glyph stays exactly centered. */
.app-folder-dossier__artwork {
  position: relative;
  box-sizing: content-box;
  min-inline-size: var(--ui-folder-dossier-artwork-size);
  min-block-size: var(--ui-folder-dossier-artwork-size);
  justify-self: start;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  /* Border-coloured ground keeps the clipped corner AA from opening a seam. */
  background: var(--ui-color-border);
}

.app-folder-dossier__artwork--round {
  border-radius: var(--ui-radius-pill);
}

.app-folder-dossier__content {
  min-width: 0;
  display: grid;
  align-content: end;
  gap: var(--ui-space-2);
}

.app-folder-dossier__marker {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-utility);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}

.app-folder-dossier__title {
  max-width: 24ch;
  margin: 0;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-display);
  font-size: var(--ui-type-display-size);
  font-weight: var(--ui-type-display-weight);
  line-height: var(--ui-type-display-line-height);
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.app-folder-dossier__summary {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ui-space-1) var(--ui-space-2);
  margin: 0;
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-utility);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-type-caption-line-height);
}

/* Separators are presentation only; assistive tech reads plain values. */
.app-folder-dossier__summary > * + *::before {
  content: '·' / '';
  margin-inline-end: var(--ui-space-2);
}

/* Fields may carry lang, so each owns its font role explicitly. */
.app-folder-dossier__field {
  font-family: var(--ui-font-family-utility);
}

.app-folder-dossier__owner {
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-weight: var(--ui-font-weight-semibold);
  overflow-wrap: anywhere;
}

.app-folder-dossier__description {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@container app-folder-layout (max-width: 36rem) {
  .app-folder-dossier__body {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
}
</style>
