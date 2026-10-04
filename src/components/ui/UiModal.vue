<script>
// Shared by every UiModal instance in this renderer.
const openModalStack = [];
</script>

<script setup>
// Generic modal shell — first one in this app (see docs/spec.md's inline-
// editing precedent for why one wasn't built sooner: it was only ever one
// field at a time). Scrollable content lives in the default slot, while an
// optional footer slot keeps primary actions outside that scrollport. This
// component otherwise owns only the overlay mechanics (teleport, locked
// backdrop, Escape, focus). The backdrop is deliberately inert because modal
// content can contain drafts; only explicit close controls may discard them.
import { nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { X } from '../../icons/index.js';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import UiIconButton from './UiIconButton.vue';
import UiScrollRegion from './UiScrollRegion.vue';

const overlayHost = useUiOverlayHost();

// Multiple app-level workflows can legitimately overlap (for example, the
// close decision arriving while an announcement is open). Keep keyboard
// ownership with the last-opened modal so one Escape press never dismisses
// two independent drafts or decisions.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  // 'wide' is for row-based/multi-column content that deforms at the
  // 'default' short-form width.
  size: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'notice', 'wide'].includes(value),
  },
  fixedHeight: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const modalIdentity = Symbol('ui-modal');

// Teleport moves the element elsewhere in the DOM, not out of this
// component's own template-ref tracking, so this still resolves correctly.
const dialogRef = useTemplateRef('dialog');
let previouslyFocused = null;

function registerOpenModal() {
  const existingIndex = openModalStack.indexOf(modalIdentity);
  if (existingIndex >= 0) openModalStack.splice(existingIndex, 1);
  openModalStack.push(modalIdentity);
}

function unregisterOpenModal() {
  const index = openModalStack.indexOf(modalIdentity);
  if (index >= 0) openModalStack.splice(index, 1);
}

function isTopModal() {
  return openModalStack.at(-1) === modalIdentity;
}

function close() {
  emit('close');
}

function getFocusableElements() {
  const dialog = dialogRef.value;
  if (!dialog) return [];
  return Array.from(
    dialog.querySelectorAll(
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
  if (!props.open || !isTopModal()) return;
  if (event.key === 'Escape') {
    close();
  } else if (event.key === 'Tab') {
    trapTabFocus(event);
  }
}

// Autofocus the first focusable field on open. The generic shell does not know
// the caller's fields, so it targets whatever the slot renders. Buttons are
// deliberately excluded: a fallback selector would match the header's close
// button (first in DOM order), and an Enter right after opening would close the
// modal and discard the draft, the Enter-driven fragility this modal replaces.
watch(
  () => props.open,
  (isOpen) => {
    if (typeof window === 'undefined') return;
    if (isOpen) {
      registerOpenModal();
      previouslyFocused = document.activeElement;
      window.requestAnimationFrame(() => {
        const dialog = dialogRef.value;
        const field = dialog?.querySelector('input, textarea, select');
        (field || dialog)?.focus();
      });
      return;
    }
    unregisterOpenModal();
    const focusTarget = previouslyFocused;
    previouslyFocused = null;
    nextTick(() => {
      if (focusTarget?.isConnected) focusTarget.focus();
    });
  },
);

onMounted(() => {
  if (typeof window === 'undefined') return;
  if (props.open) registerOpenModal();
  window.addEventListener('keydown', onWindowKeydown);
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;
  unregisterOpenModal();
  window.removeEventListener('keydown', onWindowKeydown);
});
</script>

<template>
  <Teleport :to="overlayHost || undefined" :disabled="!overlayHost">
    <div v-if="open" class="ui-modal-backdrop">
      <div
        ref="dialog"
        class="ui-modal"
        :class="[
          `ui-modal--${size}`,
          {
            'ui-modal--fixed-height': fixedHeight,
            'ui-modal--with-footer': Boolean($slots.footer),
          },
        ]"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="ui-modal__header">
          <h2 class="ui-modal__title">{{ title }}</h2>
          <UiIconButton :icon="X" label="關閉" @click="close" />
        </div>
        <UiScrollRegion
          class="ui-modal__body"
          axis="vertical"
          viewport-class="ui-modal__body-viewport"
        >
          <slot />
        </UiScrollRegion>
        <div v-if="$slots.footer" class="ui-modal__footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--ui-z-dialog);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: var(--ui-modal-viewport-inset);
  background: var(--ui-color-overlay-scrim);
}

.ui-modal {
  --ui-modal-inline-size: var(--ui-modal-inline-size-small);
  --ui-modal-max-block-size: var(--ui-modal-max-block-size-small);
  --ui-modal-focus-safe-inset: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-field-bg: var(--ui-field-bg-on-raised);
  --ui-field-bg-hover: var(--ui-field-bg-hover-on-raised);
  --ui-field-bg-readonly: var(--ui-field-bg-readonly-on-raised);

  box-sizing: border-box;
  container-type: inline-size;
  inline-size: min(
    var(--ui-modal-inline-size),
    calc(100dvw - (var(--ui-modal-viewport-inset) * 2))
  );
  min-inline-size: 0;
  max-inline-size: calc(100dvw - (var(--ui-modal-viewport-inset) * 2));
  max-block-size: min(
    var(--ui-modal-max-block-size),
    calc(100dvh - (var(--ui-modal-viewport-inset) * 2))
  );
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  background: var(--ui-color-surface-raised);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-dialog);
}

.ui-modal__body {
  min-inline-size: 0;
  min-block-size: 0;
}

.ui-modal__body :deep(.ui-modal__body-viewport) {
  padding: var(--ui-modal-focus-safe-inset) var(--ui-modal-content-inset)
    var(--ui-modal-content-inset);
  scroll-padding-block: var(--ui-modal-focus-safe-inset);
  overscroll-behavior: contain;
}

.ui-modal--with-footer .ui-modal__body :deep(.ui-modal__body-viewport) {
  padding-block-end: var(--ui-modal-section-gap);
}

.ui-modal__footer {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding: var(--ui-modal-footer-inset-block) var(--ui-modal-content-inset);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.ui-modal--notice {
  --ui-modal-inline-size: var(--ui-modal-inline-size-medium);
  --ui-modal-max-block-size: var(--ui-modal-max-block-size-medium);
}

.ui-modal--wide {
  --ui-modal-inline-size: var(--ui-modal-inline-size-large);
  --ui-modal-max-block-size: var(--ui-modal-max-block-size-large);
}

.ui-modal--fixed-height {
  block-size: min(
    var(--ui-modal-max-block-size),
    calc(100dvh - (var(--ui-modal-viewport-inset) * 2))
  );
}

.ui-modal__header {
  min-inline-size: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-modal-section-gap);
  padding: var(--ui-modal-content-inset) var(--ui-modal-content-inset)
    max(
      0rem,
      calc(var(--ui-modal-section-gap) - var(--ui-modal-focus-safe-inset))
    );
}

/* Headline tier — DESIGN.md names modal titles explicitly. */
.ui-modal__title {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-heading);
  overflow-wrap: anywhere;
}

@container (max-width: 22.5rem) {
  .ui-modal__footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    justify-content: stretch;
  }
}
</style>
