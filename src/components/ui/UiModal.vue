<script setup>
// Generic modal shell — first one in this app (see docs/spec.md's inline-
// editing precedent for why one wasn't built sooner: it was only ever one
// field at a time). Content lives entirely in the default slot; this
// component owns only the overlay mechanics (teleport, backdrop, Escape,
// focus), mirroring UiContextMenu.vue's window-level Escape/outside-click
// pattern since that's the only existing overlay precedent in this app.
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { X } from '../../icons/index.js';
import UiButton from './UiButton.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
});

const emit = defineEmits(['close']);

// Teleport moves the element elsewhere in the DOM, not out of this
// component's own template-ref tracking, so this still resolves correctly.
const dialogRef = useTemplateRef('dialog');

function close() {
  emit('close');
}

function getFocusableElements() {
  if (!dialogRef.value) return [];
  return Array.from(
    dialogRef.value.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function trapTabFocus(event) {
  const focusable = getFocusableElements();
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const isInsideDialog = dialogRef.value?.contains(active);

  if (event.shiftKey) {
    if (!isInsideDialog || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!isInsideDialog || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function onWindowKeydown(event) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    close();
  } else if (event.key === 'Tab') {
    trapTabFocus(event);
  }
}

// Autofocus the first focusable field on open — the caller's form fields
// aren't known to this generic shell, so this targets whatever the slot
// renders rather than a specific element. Deliberately excludes buttons
// from this query (a plain fallback selector would match the header's own
// close button, which sits first in DOM order ahead of any slot content —
// autofocusing it would mean an Enter keypress right after opening closes
// the modal and discards the draft, exactly the Enter-driven fragility this
// modal exists to replace).
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      dialogRef.value?.querySelector('input, textarea, select')?.focus();
    });
  },
);

onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', onWindowKeydown);
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('keydown', onWindowKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ui-modal-backdrop" @click.self="close">
      <div
        ref="dialog"
        class="ui-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="ui-modal__header">
          <h2 class="ui-modal__title">{{ title }}</h2>
          <UiButton :icon="X" aria-label="關閉" title="關閉" @click="close" />
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--ui-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ui-space-5);
  background: var(--ui-color-overlay-scrim);
}

.ui-modal {
  width: min(420px, 100%);
  max-height: calc(100vh - var(--ui-space-8));
  overflow-y: auto;
  padding: var(--ui-space-5);
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-overlay);
}

.ui-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
}

/* Headline tier — DESIGN.md names modal titles explicitly. */
.ui-modal__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
}
</style>
