<script setup>
import {
  nextTick,
  onBeforeUnmount,
  useAttrs,
  useId,
  useSlots,
  useTemplateRef,
  watch,
} from 'vue';
import { X } from '../../icons/index.js';
import DemoCandidateIconButton from './DemoCandidateIconButton.vue';

defineOptions({ inheritAttrs: false });

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value),
  },
});

const emit = defineEmits(['close']);
const attrs = useAttrs();
const slots = useSlots();
const dialogRef = useTemplateRef('dialog');
const bodyRef = useTemplateRef('body');
const titleRef = useTemplateRef('title');
const instanceId = useId().replaceAll(':', '');
const titleId = `demo-candidate-modal-${instanceId}-title`;

let focusOrigin = null;
let syncRevision = 0;

function requestClose() {
  emit('close');
}

function restoreFocusOrigin() {
  const target = focusOrigin;
  focusOrigin = null;
  if (target?.isConnected !== false) target?.focus?.();
}

function focusInitialTarget(dialog) {
  const target = dialog.querySelector('[autofocus]') ?? titleRef.value;
  target?.focus?.();
}

async function syncDialog(isOpen, revision) {
  await nextTick();
  if (revision !== syncRevision) return;

  const dialog = dialogRef.value;
  if (!dialog) return;

  if (isOpen) {
    if (!dialog.open) {
      focusOrigin =
        typeof document === 'undefined' ? null : document.activeElement;
      dialog.showModal();
    }
    bodyRef.value?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
    if (revision === syncRevision && props.open) focusInitialTarget(dialog);
    return;
  }

  if (dialog.open) dialog.close();
  if (revision === syncRevision) restoreFocusOrigin();
}

function onCancel(event) {
  event.preventDefault();
  requestClose();
}

function onNativeClose() {
  if (props.open) requestClose();
}

function onKeydown(event) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;

  const dialog = dialogRef.value;
  if (!dialog) return;

  const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true',
  );
  const first = focusable[0];
  const last = focusable.at(-1);

  if (!first || !last) {
    event.preventDefault();
    titleRef.value?.focus?.();
    return;
  }

  const activeElement =
    event.target ??
    (typeof document === 'undefined' ? null : document.activeElement);
  const currentIndex = focusable.indexOf(activeElement);
  const nextIndex = event.shiftKey
    ? currentIndex <= 0
      ? focusable.length - 1
      : currentIndex - 1
    : currentIndex < 0 || currentIndex === focusable.length - 1
      ? 0
      : currentIndex + 1;

  event.preventDefault();
  focusable[nextIndex].focus();
}

watch(
  () => props.open,
  (isOpen) => {
    syncRevision += 1;
    void syncDialog(isOpen, syncRevision);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  syncRevision += 1;
  if (dialogRef.value?.open) dialogRef.value.close();
  restoreFocusOrigin();
});
</script>

<template>
  <Teleport to="body">
    <dialog
      v-bind="attrs"
      ref="dialog"
      class="demo-candidate-modal"
      :class="[
        `demo-candidate-modal--${size}`,
        { 'demo-candidate-modal--with-footer': slots.footer },
      ]"
      :aria-labelledby="titleId"
      aria-modal="true"
      :data-modal-size="size"
      data-demo-candidate-modal
      @cancel="onCancel"
      @close="onNativeClose"
      @keydown="onKeydown"
    >
      <header class="demo-candidate-modal__header">
        <h2
          :id="titleId"
          ref="title"
          class="demo-candidate-modal__title"
          tabindex="-1"
        >
          {{ title }}
        </h2>
        <DemoCandidateIconButton
          class="demo-candidate-modal__close"
          :icon="X"
          label="關閉"
          @click="requestClose"
        />
      </header>

      <div ref="body" class="demo-candidate-modal__body">
        <slot />
      </div>

      <footer v-if="slots.footer" class="demo-candidate-modal__footer">
        <slot name="footer" />
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.demo-candidate-modal {
  --demo-candidate-modal-inline-size: var(--ui-modal-inline-size-medium);
  --demo-candidate-modal-max-block-size: var(--ui-modal-max-block-size-medium);
  --ui-field-bg: var(--ui-field-bg-on-raised);
  --ui-field-bg-hover: var(--ui-field-bg-hover-on-raised);
  --ui-field-bg-readonly: var(--ui-field-bg-readonly-on-raised);

  position: fixed;
  inset: 0;
  box-sizing: border-box;
  container-type: inline-size;
  inline-size: min(
    var(--demo-candidate-modal-inline-size),
    calc(100dvw - (var(--ui-modal-viewport-inset) * 2))
  );
  min-inline-size: 0;
  max-inline-size: calc(100dvw - (var(--ui-modal-viewport-inset) * 2));
  max-block-size: min(
    var(--demo-candidate-modal-max-block-size),
    calc(100dvh - (var(--ui-modal-viewport-inset) * 2))
  );
  padding: 0;
  margin: auto;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--ui-shadow-dialog);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
}

.demo-candidate-modal:not([open]) {
  display: none;
}

.demo-candidate-modal[open] {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.demo-candidate-modal::backdrop {
  background: var(--ui-color-overlay-scrim);
}

.demo-candidate-modal--small {
  --demo-candidate-modal-inline-size: var(--ui-modal-inline-size-small);
  --demo-candidate-modal-max-block-size: var(--ui-modal-max-block-size-small);
}

.demo-candidate-modal--medium {
  --demo-candidate-modal-inline-size: var(--ui-modal-inline-size-medium);
  --demo-candidate-modal-max-block-size: var(--ui-modal-max-block-size-medium);
}

.demo-candidate-modal--large {
  --demo-candidate-modal-inline-size: var(--ui-modal-inline-size-large);
  --demo-candidate-modal-max-block-size: var(--ui-modal-max-block-size-large);
}

.demo-candidate-modal__header {
  min-inline-size: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-modal-section-gap);
  padding: var(--ui-modal-content-inset) var(--ui-modal-content-inset)
    var(--ui-modal-section-gap);
}

.demo-candidate-modal__title {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-heading);
  overflow-wrap: anywhere;
  -webkit-user-select: none;
  user-select: none;
}

.demo-candidate-modal__title:focus {
  outline: none;
}

.demo-candidate-modal__body {
  min-inline-size: 0;
  min-block-size: 0;
  padding: 0 var(--ui-modal-content-inset) var(--ui-modal-content-inset);
  overflow-x: clip;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--ui-color-border-strong) transparent;
  scrollbar-width: thin;
}

.demo-candidate-modal--with-footer .demo-candidate-modal__body {
  padding-block-end: var(--ui-modal-section-gap);
}

.demo-candidate-modal__footer {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding: var(--ui-modal-footer-inset-block) var(--ui-modal-content-inset);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

@container (max-width: 22.5rem) {
  .demo-candidate-modal__footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    justify-content: stretch;
  }
}
</style>
