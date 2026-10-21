<script setup>
// Reads a long Folder note on a letter-sized sheet of its own paper. Text
// that outgrows the sheet flows into pages; editing stays in the editor.
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
} from '../../icons/index.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';

const PREVIOUS_KEYS = new Set(['ArrowLeft', 'PageUp']);
const NEXT_KEYS = new Set(['ArrowRight', 'PageDown']);

const props = defineProps({
  open: { type: Boolean, default: false },
  // The note projection: key, title, text, paper.
  note: { type: Object, default: null },
  removing: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'afterLeave', 'edit', 'remove']);

const pages = useTemplateRef('pages');
const page = shallowRef(0);
const pageCount = shallowRef(1);
let pagesObserver = null;

const title = computed(() => props.note?.title ?? '');
const text = computed(() => props.note?.text ?? '');
const pageLabel = computed(() => `${page.value + 1} / ${pageCount.value}`);

// Each overflowing column is one page of the same width as the sheet.
function measurePages() {
  const element = pages.value;
  if (!element) return;
  const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
  const width = element.clientWidth + gap;
  pageCount.value =
    width > 0
      ? Math.max(1, Math.round((element.scrollWidth + gap) / width))
      : 1;
  page.value = Math.min(page.value, pageCount.value - 1);
}

function turn(step) {
  page.value = Math.min(Math.max(page.value + step, 0), pageCount.value - 1);
}

// Keys typed into a field, such as the editor stacked above, never turn pages.
function handleKeydown(event) {
  if (
    event.defaultPrevented ||
    event.target?.closest?.('input, textarea, select, [contenteditable="true"]')
  ) {
    return;
  }
  if (PREVIOUS_KEYS.has(event.key)) turn(-1);
  else if (NEXT_KEYS.has(event.key)) turn(1);
  else return;
  event.preventDefault();
}

watch(pages, (element, previous) => {
  if (previous) pagesObserver?.unobserve(previous);
  if (!element) return;
  pagesObserver ??=
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(measurePages)
      : null;
  pagesObserver?.observe(element);
  measurePages();
});

watch(
  () => [props.open, title.value, text.value],
  async ([isOpen], previous) => {
    if (isOpen && !previous?.[0]) page.value = 0;
    if (typeof window === 'undefined') return;
    if (isOpen) window.addEventListener('keydown', handleKeydown);
    else window.removeEventListener('keydown', handleKeydown);
    await nextTick();
    measurePages();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown);
  }
  pagesObserver?.disconnect();
});
</script>

<template>
  <UiModal
    :open="open"
    :title="title || '頁面便條'"
    presentation="media"
    dismiss-on-backdrop
    :close-disabled="removing"
    @close="emit('close')"
    @after-leave="emit('afterLeave')"
  >
    <template v-if="note" #header-actions>
      <UiIconButton
        :icon="Pencil"
        label="編輯便條"
        variant="overlay"
        tooltip-placement="start"
        :disabled="removing"
        @click="emit('edit', note.key)"
      />
      <UiIconButton
        :icon="Trash2"
        label="刪除便條"
        variant="overlay"
        intent="danger"
        tooltip-placement="start"
        :disabled="removing"
        @click="emit('remove', note.key)"
      />
    </template>

    <!-- Solid, unlike notes on the page: a sheet held up to read shows
         nothing through it. -->
    <UiFolderArtifact
      v-if="note"
      class="app-folder-note-reader"
      kind="note"
      material="solid"
      :paper="note.paper ?? 'tissue'"
    >
      <div class="app-folder-note-reader__viewport">
        <div
          ref="pages"
          class="app-folder-note-reader__pages"
          :style="{ '--app-folder-note-reader-page': page }"
        >
          <h4
            v-if="title"
            class="app-folder-note-reader__title"
            :lang="contentLangAttribute(title)"
          >
            {{ title }}
          </h4>
          <p
            class="app-folder-note-reader__text"
            :lang="contentLangAttribute(text)"
            v-text="text"
          ></p>
        </div>
      </div>
      <nav
        v-if="pageCount > 1"
        class="app-folder-note-reader__pager"
        aria-label="便條頁次"
      >
        <UiIconButton
          :icon="ChevronLeft"
          label="上一頁"
          :disabled="page === 0"
          @click="turn(-1)"
        />
        <span class="app-folder-note-reader__page" aria-live="polite">
          {{ pageLabel }}
        </span>
        <UiIconButton
          :icon="ChevronRight"
          label="下一頁"
          :disabled="page === pageCount - 1"
          @click="turn(1)"
        />
      </nav>
    </UiFolderArtifact>
    <UiNotice v-if="error" :message="error" tone="danger" compact />
  </UiModal>
</template>

<style scoped>
/* A letter-proportioned sheet of the note's own paper, inside the media
   bounds; the pager sits in its lower end corner. */
.app-folder-note-reader {
  --ui-folder-artifact-note-width: min(
    var(--ui-folder-note-reader-width),
    var(--ui-media-max-inline-size)
  );
  --ui-folder-artifact-note-min-height: 0;

  block-size: min(
    var(--ui-folder-artifact-note-width) * var(--ui-folder-note-reader-aspect),
    var(--ui-media-max-block-size)
  );
  grid-template-rows: minmax(0, 1fr) auto;
  padding: var(--ui-space-6);
}

.app-folder-note-reader__viewport {
  min-block-size: 0;
  overflow: hidden;
}

/* One column per page; turning a page slides by one column and its gap. */
.app-folder-note-reader__pages {
  block-size: 100%;
  columns: 1;
  column-gap: var(--ui-space-6);
  column-fill: auto;
  transform: translateX(
    calc((100% + var(--ui-space-6)) * var(--app-folder-note-reader-page) * -1)
  );
  transition: transform var(--ui-motion-duration-standard)
    var(--ui-motion-easing-standard);
}

.app-folder-note-reader__title {
  margin: 0 0 var(--ui-space-3);
  font-family: var(--ui-font-family-display);
  font-size: var(--ui-type-heading-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-heading-line-height);
  overflow-wrap: anywhere;
}

/* On ruled paper the rules print under the text at its line height; each
   page repaints them from its own top so no page starts between rules. */
.app-folder-note-reader__text {
  margin: 0;
  background-image: var(--ui-folder-artifact-note-print, none);
  box-decoration-break: clone;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(
    --ui-folder-artifact-note-line-height,
    var(--ui-type-body-line-height)
  );
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.app-folder-note-reader__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-3);
}

.app-folder-note-reader__page {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-utility);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-type-caption-line-height);
}

@media (prefers-reduced-motion: reduce) {
  .app-folder-note-reader__pages {
    transition: none;
  }
}
</style>
