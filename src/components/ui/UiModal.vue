<script>
// Shared by every UiModal instance in this renderer.
const openModalStack = [];

function rebaseOpenModalStack() {
  openModalStack.forEach((entry, index) => {
    entry.stackIndex.value = index;
  });
}
</script>

<script setup>
// Generic modal shell — first one in this app (see docs/spec.md's inline-
// editing precedent for why one wasn't built sooner: it was only ever one
// field at a time). Scrollable content lives in the default slot, while an
// optional footer slot keeps primary actions outside that scrollport. This
// component otherwise owns only the overlay mechanics (teleport, locked
// backdrop, Escape, focus). The backdrop stays inert by default because modal
// content can contain drafts; disposable media can opt into outside dismissal.
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue';
import { X } from '../../icons/index.js';
import {
  provideUiOverlayHost,
  useUiOverlayHost,
} from '../../composables/useUiOverlayHost.js';
import { rendererRootSurfaceId } from '../../utils/rendererSurfaceRegistry.js';
import UiIconButton from './UiIconButton.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import UiSeparator from './UiSeparator.vue';

// A surface host can sit inside another stacking context (the Folder page
// beneath its tabs and the Right Dock), so the modal and its tooltips mount on
// the renderer root instead. Without a known root it stays on the given host.
const surfaceHost = useUiOverlayHost();
const rootSurfaceId = surfaceHost ? rendererRootSurfaceId(surfaceHost) : null;
const overlayHost = rootSurfaceId
  ? provideUiOverlayHost(rootSurfaceId)
  : surfaceHost;

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
  maxBlockSize: {
    type: String,
    default: '',
    validator: (value) => ['', 'small', 'medium', 'large'].includes(value),
  },
  presentation: {
    type: String,
    default: 'dialog',
    validator: (value) => ['dialog', 'media'].includes(value),
  },
  fixedHeight: { type: Boolean, default: false },
  closeDisabled: { type: Boolean, default: false },
  dismissOnBackdrop: { type: Boolean, default: false },
  selectable: { type: Boolean, default: true },
  // Optional content colour (e.g. a cover's) washed in from the end edge.
  // Material colour only: it never recolours text, controls or accent.
  tint: { type: String, default: null },
});

const emit = defineEmits(['close', 'afterLeave']);
const modalIdentity = Symbol('ui-modal');
const modalStackIndex = shallowRef(0);
const modalStackEntry = {
  identity: modalIdentity,
  stackIndex: modalStackIndex,
  contains: (element) => dialogRef.value?.contains(element),
};

// Teleport moves the element elsewhere in the DOM, not out of this
// component's own template-ref tracking, so this still resolves correctly.
const dialogRef = useTemplateRef('dialog');
let previouslyFocused = null;
let pendingFocusRestore = null;
let focusRevision = 0;

function registerOpenModal() {
  const existingIndex = openModalStack.findIndex(
    (entry) => entry.identity === modalIdentity,
  );
  if (existingIndex >= 0) openModalStack.splice(existingIndex, 1);
  openModalStack.push(modalStackEntry);
  rebaseOpenModalStack();
}

function unregisterOpenModal() {
  const index = openModalStack.findIndex(
    (entry) => entry.identity === modalIdentity,
  );
  if (index < 0) return;
  openModalStack.splice(index, 1);
  rebaseOpenModalStack();
}

function isTopModal() {
  return openModalStack.at(-1)?.identity === modalIdentity;
}

function close() {
  if (props.closeDisabled) return;
  emit('close');
}

function handleBackdropClick(event) {
  if (
    !props.dismissOnBackdrop ||
    !props.open ||
    !isTopModal() ||
    event.target !== event.currentTarget
  ) {
    return;
  }
  close();
}

function restorePendingFocus() {
  const focusTarget = pendingFocusRestore;
  pendingFocusRestore = null;
  const topModal = openModalStack.at(-1);
  if (topModal && !topModal.contains(focusTarget)) return;
  if (focusTarget?.isConnected) focusTarget.focus();
}

function handleAfterLeave() {
  restorePendingFocus();
  emit('afterLeave');
}

function isAvailableFocusTarget(element) {
  return (
    !element.disabled &&
    !element.hidden &&
    element.type !== 'hidden' &&
    (element.tabIndex ?? 0) >= 0 &&
    !element.matches?.(':disabled') &&
    !element.closest?.('[inert], [aria-hidden="true"]') &&
    (!element.getClientRects || element.getClientRects().length > 0)
  );
}

function getFocusableElements() {
  const dialog = dialogRef.value;
  if (!dialog) return [];
  return Array.from(
    dialog.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(isAvailableFocusTarget);
}

function trapTabFocus(event) {
  const focusable = getFocusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const isInsideDialog = dialogRef.value?.contains(active);
  const isTabStop = focusable.includes(active);

  if (event.shiftKey) {
    if (!isInsideDialog || !isTabStop || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!isInsideDialog || !isTabStop || active === last) {
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
function openModal() {
  registerOpenModal();
  pendingFocusRestore = null;
  previouslyFocused = document.activeElement;
  const revision = ++focusRevision;
  window.requestAnimationFrame(() => {
    if (!props.open || !isTopModal() || revision !== focusRevision) return;
    const dialog = dialogRef.value;
    const field = Array.from(
      dialog?.querySelectorAll('input, textarea, select') ?? [],
    ).find(isAvailableFocusTarget);
    (field || dialog)?.focus();
  });
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof window === 'undefined') return;
    if (isOpen) {
      openModal();
      return;
    }
    focusRevision++;
    unregisterOpenModal();
    pendingFocusRestore = previouslyFocused;
    previouslyFocused = null;
  },
);

onMounted(() => {
  if (typeof window === 'undefined') return;
  if (props.open) openModal();
  window.addEventListener('keydown', onWindowKeydown);
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;
  focusRevision++;
  unregisterOpenModal();
  window.removeEventListener('keydown', onWindowKeydown);
  pendingFocusRestore ??= previouslyFocused;
  restorePendingFocus();
});
</script>

<template>
  <!-- Deferred: a modal can mount in the same pass as the host it targets,
       before that host is in the document. -->
  <Teleport defer :to="overlayHost || undefined" :disabled="!overlayHost">
    <Transition
      :name="presentation === 'media' ? 'ui-modal-media' : undefined"
      :css="presentation === 'media'"
      @after-leave="handleAfterLeave"
    >
      <div
        v-if="open"
        class="ui-modal-backdrop"
        :style="{ '--ui-modal-stack-index': modalStackIndex }"
        :onClick="dismissOnBackdrop ? handleBackdropClick : undefined"
      >
        <div
          ref="dialog"
          class="ui-modal"
          :class="[
            `ui-modal--${size}`,
            `ui-modal--${presentation}`,
            maxBlockSize ? `ui-modal--max-block-${maxBlockSize}` : null,
            {
              'ui-modal--fixed-height': fixedHeight,
              'ui-modal--with-footer':
                presentation !== 'media' && Boolean($slots.footer),
              'ui-modal--tinted': Boolean(tint),
              'ui-modal--select-none': !selectable,
            },
          ]"
          :style="tint ? { '--ui-modal-tint': tint } : undefined"
          role="dialog"
          tabindex="-1"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="ui-modal__header">
            <h2
              class="ui-modal__title"
              :class="{ 'ui-visually-hidden': presentation === 'media' }"
            >
              {{ title }}
            </h2>
            <!-- Optional caller tools stay ahead of the default close, split by
                 one separator so closing never reads as one of them. -->
            <div class="ui-modal__header-end">
              <UiIconButton
                v-if="presentation === 'media'"
                :icon="X"
                label="關閉"
                variant="overlay"
                tooltip-placement="start"
                :disabled="closeDisabled"
                @click="close"
              />
              <template v-if="$slots['header-actions']">
                <div class="ui-modal__header-actions">
                  <slot name="header-actions" />
                </div>
                <UiSeparator
                  v-if="presentation !== 'media'"
                  orientation="vertical"
                  class="ui-modal__header-separator"
                />
              </template>
              <UiIconButton
                v-if="presentation !== 'media'"
                :icon="X"
                label="關閉"
                variant="ghost"
                tooltip-placement="top"
                :disabled="closeDisabled"
                @click="close"
              />
            </div>
          </div>
          <UiScrollRegion
            v-if="presentation !== 'media'"
            class="ui-modal__body"
            axis="vertical"
            viewport-class="ui-modal__body-viewport"
          >
            <slot />
          </UiScrollRegion>
          <div v-else class="ui-modal__media-body">
            <slot />
          </div>
          <div
            v-if="presentation !== 'media' && $slots.footer"
            class="ui-modal__footer"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--ui-z-dialog) + var(--ui-modal-stack-index, 0));
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
  transition: --ui-modal-tint var(--ui-motion-duration-slow)
    var(--ui-motion-easing-standard);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-dialog);
}

/* Registered so a tint change crossfades instead of jumping. */
@property --ui-modal-tint {
  syntax: '<color>';
  inherits: false;
  initial-value: transparent;
}

/* The tint fades out before the start side, where titles and copy read on
   the neutral surface. Its lightness is capped first, so even a pale cover
   at this strength keeps end-side controls in contrast. */
.ui-modal--tinted {
  --ui-modal-tint-ground: oklch(from var(--ui-modal-tint) min(l, 0.55) c h);

  background-image: radial-gradient(
    ellipse 90% 140% at 100% 50%,
    color-mix(in oklab, var(--ui-modal-tint-ground) 55%, transparent),
    transparent
  );
}

.ui-modal--tinted:dir(rtl) {
  background-image: radial-gradient(
    ellipse 90% 140% at 0% 50%,
    color-mix(in oklab, var(--ui-modal-tint-ground) 55%, transparent),
    transparent
  );
}

.ui-modal--select-none {
  -webkit-user-select: none;
  user-select: none;
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

.ui-modal--max-block-small {
  --ui-modal-max-block-size: var(--ui-modal-max-block-size-small);
}

.ui-modal--max-block-medium {
  --ui-modal-max-block-size: var(--ui-modal-max-block-size-medium);
}

.ui-modal--max-block-large {
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
.ui-modal__header-end,
.ui-modal__header-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.ui-modal__header-separator {
  margin-block: var(--ui-space-2);
}

.ui-modal__title {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-heading-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-heading-line-height);
  overflow-wrap: anywhere;
}

.ui-modal--media {
  --ui-modal-media-action-rail-inline-size: var(--ui-icon-button-size-md);
  --ui-modal-media-action-gap: var(--ui-space-2);
  --ui-modal-media-content-max-inline-size: min(
    var(--ui-modal-media-max-inline-size),
    calc(
      100dvw - (var(--ui-modal-viewport-inset) * 2) -
        var(--ui-modal-media-action-rail-inline-size) -
        var(--ui-modal-media-action-gap)
    )
  );
  --ui-modal-media-content-max-block-size: min(
    var(--ui-modal-media-max-block-size),
    calc(100dvh - (var(--ui-modal-viewport-inset) * 2))
  );

  position: relative;
  inline-size: fit-content;
  max-inline-size: calc(
    var(--ui-modal-media-content-max-inline-size) +
      var(--ui-modal-media-action-rail-inline-size) +
      var(--ui-modal-media-action-gap)
  );
  max-block-size: var(--ui-modal-media-content-max-block-size);
  container-type: normal;
  grid-template-columns: minmax(0, max-content) var(
      --ui-modal-media-action-rail-inline-size
    );
  grid-template-rows: minmax(0, max-content);
  gap: var(--ui-modal-media-action-gap);
  overflow: visible;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.ui-modal--media .ui-modal__header {
  position: static;
  grid-column: 2;
  grid-row: 1;
  z-index: var(--ui-layer-raised);
  align-self: start;
  align-items: center;
  justify-content: flex-end;
  padding: 0;
}

.ui-modal--media .ui-modal__header-end {
  flex-direction: column;
  gap: var(--ui-space-1);
}

.ui-modal--media .ui-modal__header-actions {
  flex-direction: column;
  gap: var(--ui-space-1);
}

.ui-modal__media-body {
  grid-column: 1;
  grid-row: 1;
  min-inline-size: 0;
  min-block-size: 0;
  --ui-media-max-inline-size: var(--ui-modal-media-content-max-inline-size);
  --ui-media-max-block-size: var(--ui-modal-media-content-max-block-size);

  max-inline-size: var(--ui-modal-media-content-max-inline-size);
  max-block-size: var(--ui-modal-media-content-max-block-size);
  display: grid;
  place-items: center;
}

.ui-modal-media-enter-active {
  transition: background-color var(--ui-motion-duration-standard)
    var(--ui-motion-easing-enter);
}

.ui-modal-media-leave-active {
  transition: background-color var(--ui-motion-duration-fast)
    var(--ui-motion-easing-exit);
}

.ui-modal-media-enter-active .ui-modal--media {
  transition:
    opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    transform var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    clip-path var(--ui-motion-duration-standard) var(--ui-motion-easing-enter);
}

.ui-modal-media-leave-active .ui-modal--media {
  transition:
    opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
    transform var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
    clip-path var(--ui-motion-duration-fast) var(--ui-motion-easing-exit);
}

.ui-modal-media-enter-from,
.ui-modal-media-leave-to {
  background-color: transparent;
}

.ui-modal-media-enter-from .ui-modal--media,
.ui-modal-media-leave-to .ui-modal--media {
  opacity: 0;
  transform: scale(0.94);
  clip-path: inset(4%);
}

@media (prefers-reduced-motion: reduce) {
  .ui-modal-media-enter-active,
  .ui-modal-media-leave-active,
  .ui-modal-media-enter-active .ui-modal--media,
  .ui-modal-media-leave-active .ui-modal--media {
    transition: none;
  }
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
