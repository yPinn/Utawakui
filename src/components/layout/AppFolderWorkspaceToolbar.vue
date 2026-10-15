<script setup>
// The tool tab already names the tool, so the toolbar shows only its context.
defineProps({
  context: { type: String, required: true },
  contextLang: { type: String, default: undefined },
  meta: { type: String, default: '' },
  metaLang: { type: String, default: undefined },
});
</script>

<template>
  <header class="app-folder-workspace-toolbar">
    <div class="app-folder-workspace-toolbar__context">
      <p class="app-folder-workspace-toolbar__summary">
        <span class="app-folder-workspace-toolbar__title" :lang="contextLang">
          {{ context }}
        </span>
        <span
          v-if="meta"
          class="app-folder-workspace-toolbar__meta"
          :lang="metaLang"
        >
          {{ meta }}
        </span>
      </p>
      <div v-if="$slots.status" class="app-folder-workspace-toolbar__status">
        <slot name="status" />
      </div>
    </div>
    <div v-if="$slots.actions" class="app-folder-workspace-toolbar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.app-folder-workspace-toolbar {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3) var(--ui-space-4);
  padding-block-end: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule-strong, var(--ui-color-border));
}

.app-folder-workspace-toolbar__context {
  flex: 1 1 16rem;
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-3);
}

.app-folder-workspace-toolbar__summary {
  min-inline-size: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  margin: 0;
}

.app-folder-workspace-toolbar__title {
  min-inline-size: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-display);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-title-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-folder-workspace-toolbar__meta {
  flex: 0 1 auto;
  min-inline-size: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-utility);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-folder-workspace-toolbar__summary > * + *::before {
  content: '·' / '';
  margin-inline-end: var(--ui-space-2);
}

.app-folder-workspace-toolbar__status,
.app-folder-workspace-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}

.app-folder-workspace-toolbar__actions {
  margin-inline-start: auto;
}
</style>
