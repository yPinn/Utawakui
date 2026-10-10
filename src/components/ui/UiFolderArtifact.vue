<script setup>
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue';
import {
  getFolderArtifactStackLayoutVariant,
  getFolderArtifactStackLayers,
  normalizeFolderArtifactStackIndex,
} from '../../utils/folderArtifactStack.js';
import UiPhotoFrame from './UiPhotoFrame.vue';
import UiTextarea from './UiTextarea.vue';

const emit = defineEmits(['previous', 'next', 'commit']);

const props = defineProps({
  kind: {
    type: String,
    required: true,
    validator: (value) => ['photo', 'note', 'stack'].includes(value),
  },
  material: {
    type: String,
    default: 'solid',
    validator: (value) => ['solid', 'translucent'].includes(value),
  },
  title: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  body: { type: String, default: '' },
  caption: { type: String, default: '' },
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  images: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  // Paper stock of a note; tissue keeps the Folder-tinted default sheet.
  paper: {
    type: String,
    default: 'tissue',
    validator: (value) =>
      ['tissue', 'periwinkle', 'rose', 'canary', 'kraft', 'ruled'].includes(
        value,
      ),
  },
  // Grain offset variant (0–3) so overlapping notes never share one texture.
  texture: {
    type: Number,
    default: 0,
    validator: (value) => Number.isInteger(value) && value >= 0 && value < 4,
  },
  editing: { type: Boolean, default: false },
  editLabel: { type: String, default: '便條內容' },
  maxLength: { type: Number, default: 2000 },
});

const editor = useTemplateRef('editor');
const editorId = `folder-artifact-editor-${useId()}`;
const draft = ref('');
let committed = false;

watch(
  () => props.editing,
  async (editing) => {
    if (!editing) return;
    draft.value = props.body;
    committed = false;
    await nextTick();
    editor.value?.focus();
  },
  { immediate: true },
);

// Escape and blur both end editing; only the first one commits.
function commitDraft() {
  if (committed || !props.editing) return;
  committed = true;
  emit('commit', draft.value);
}

function handleEditorKeydown(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  commitDraft();
}

const normalizedStackIndex = computed(() =>
  normalizeFolderArtifactStackIndex(props.activeIndex, props.images.length),
);
const stackLayers = computed(() =>
  getFolderArtifactStackLayers(props.images, normalizedStackIndex.value),
);
const stackLayoutVariant = computed(() =>
  getFolderArtifactStackLayoutVariant(
    normalizedStackIndex.value,
    props.images.length,
  ),
);
const stackPositionLabel = computed(() =>
  props.images.length > 0
    ? `${normalizedStackIndex.value + 1} / ${props.images.length}`
    : '',
);

function stackLayerIntent(layer) {
  return layer === 'back' ? 'previous' : 'next';
}

function stackLayerLabel(entry) {
  const imageLabel = entry.image.alt?.trim();
  if (entry.layer === 'back') {
    return imageLabel ? `顯示上一張照片：${imageLabel}` : '顯示上一張照片';
  }
  return imageLabel ? `目前為${imageLabel}，顯示下一張照片` : '顯示下一張照片';
}

function handleStackLayerKeydown(layer, event) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (layer === 'back') emit('previous');
  else emit('next');
}
</script>

<template>
  <article
    class="ui-folder-artifact"
    :class="[
      `ui-folder-artifact--${props.kind}`,
      `ui-folder-artifact--${props.material}`,
    ]"
    :data-paper-texture="kind === 'note' ? texture : undefined"
    :data-paper="kind === 'note' ? paper : undefined"
  >
    <template v-if="kind === 'photo'">
      <UiPhotoFrame v-if="src" :src="src" :alt="alt" fit="cover" filtered />
      <slot v-else></slot>
      <p v-if="caption">{{ caption }}</p>
    </template>

    <template v-else-if="kind === 'stack'">
      <TransitionGroup
        tag="div"
        name="ui-folder-artifact-stack"
        class="ui-folder-artifact__stack-layers"
        :data-stack-layout="stackLayoutVariant"
      >
        <figure
          v-for="entry in stackLayers"
          :key="entry.index"
          class="ui-folder-artifact__stack-layer"
          :class="`ui-folder-artifact__stack-layer--${entry.layer}`"
          role="button"
          tabindex="0"
          :data-artifact-activate="stackLayerIntent(entry.layer)"
          :aria-label="stackLayerLabel(entry)"
          @keydown="handleStackLayerKeydown(entry.layer, $event)"
        >
          <img :src="entry.image.src" alt="" draggable="false" />
          <span
            v-if="entry.layer === 'back' && images.length > 1"
            class="ui-folder-artifact__stack-position"
            aria-hidden="true"
          >
            {{ stackPositionLabel }}
          </span>
        </figure>
      </TransitionGroup>
      <span
        v-if="images.length > 1"
        class="ui-visually-hidden ui-folder-artifact__stack-status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ stackPositionLabel }}
      </span>
    </template>

    <template v-else>
      <p v-if="eyebrow" class="ui-folder-artifact__eyebrow">
        {{ eyebrow }}
      </p>
      <h4 v-if="title">{{ title }}</h4>
      <UiTextarea
        v-if="editing"
        :id="editorId"
        ref="editor"
        v-model="draft"
        :label="editLabel"
        label-hidden
        variant="bare"
        :maxlength="maxLength"
        :rows="4"
        @keydown="handleEditorKeydown"
        @blur="commitDraft"
      />
      <p v-else-if="body" class="ui-folder-artifact__body">{{ body }}</p>
      <slot></slot>
    </template>
  </article>
</template>

<style scoped>
.ui-folder-artifact {
  box-sizing: border-box;
  margin: 0;
  color: var(--ui-color-text);
  user-select: none;
  -webkit-user-drag: none;
}

.ui-folder-artifact--stack img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  filter: var(--ui-photo-frame-filter);
  pointer-events: none;
  -webkit-user-drag: none;
}

.ui-folder-artifact--photo {
  width: var(--ui-folder-artifact-photo-width);
}

.ui-folder-artifact--photo > p {
  margin: var(--ui-space-2) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.ui-folder-artifact--note {
  width: var(--ui-folder-artifact-note-width);
  min-height: var(--ui-folder-artifact-note-min-height);
  display: grid;
  align-content: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-5);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-xs);
  background-color: var(
    --ui-folder-artifact-note-paper,
    var(--ui-folder-artifact-note-bg)
  );
  background-image:
    var(--ui-folder-artifact-note-print, none),
    var(--ui-folder-artifact-note-grain, none);
  background-position:
    0 0,
    var(--ui-folder-artifact-note-grain-offset, 0 0);
  background-blend-mode: normal, soft-light;
  box-shadow: var(--ui-folder-artifact-shadow);
}

.ui-folder-artifact[data-paper='periwinkle'] {
  --ui-folder-artifact-note-paper: var(--ui-folder-artifact-paper-periwinkle);
  --ui-folder-artifact-note-grain: url('../../assets/folder-paper/grain-fine.svg?no-inline');
}

.ui-folder-artifact[data-paper='rose'] {
  --ui-folder-artifact-note-paper: var(--ui-folder-artifact-paper-rose);
  --ui-folder-artifact-note-grain: url('../../assets/folder-paper/grain-fine.svg?no-inline');
}

.ui-folder-artifact[data-paper='canary'] {
  --ui-folder-artifact-note-paper: var(--ui-folder-artifact-paper-canary);
  --ui-folder-artifact-note-grain: url('../../assets/folder-paper/grain-fine.svg?no-inline');
}

.ui-folder-artifact[data-paper='kraft'] {
  --ui-folder-artifact-note-paper: var(--ui-folder-artifact-paper-kraft);
  --ui-folder-artifact-note-grain: url('../../assets/folder-paper/grain-coarse.svg?no-inline');
}

.ui-folder-artifact[data-paper='ruled'] {
  --ui-folder-artifact-note-paper: var(--ui-folder-artifact-paper-ruled);
  --ui-folder-artifact-note-grain: url('../../assets/folder-paper/grain-fine.svg?no-inline');
  --ui-folder-artifact-note-print: repeating-linear-gradient(
    to bottom,
    transparent 0 calc(var(--ui-space-5) - var(--ui-border-width)),
    var(--ui-folder-artifact-paper-rule)
      calc(var(--ui-space-5) - var(--ui-border-width)) var(--ui-space-5)
  );
}

.ui-folder-artifact[data-paper-texture='1'] {
  --ui-folder-artifact-note-grain-offset: 2.3rem 3.8rem;
}

.ui-folder-artifact[data-paper-texture='2'] {
  --ui-folder-artifact-note-grain-offset: 5.2rem 1.2rem;
}

.ui-folder-artifact[data-paper-texture='3'] {
  --ui-folder-artifact-note-grain-offset: 7.6rem 6rem;
}

.ui-folder-artifact--note.ui-folder-artifact--translucent {
  background-color: color-mix(
    in srgb,
    var(--ui-folder-artifact-note-paper, var(--ui-folder-artifact-note-bg))
      var(--ui-folder-artifact-note-opacity),
    transparent
  );
}

.ui-folder-artifact__eyebrow,
.ui-folder-artifact--note h4,
.ui-folder-artifact__body {
  margin: 0;
}

.ui-folder-artifact__eyebrow {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-caption);
}

.ui-folder-artifact--note h4 {
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.ui-folder-artifact__body {
  max-width: 34ch;
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.ui-folder-artifact--stack {
  position: relative;
  width: var(--ui-folder-artifact-stack-width);
  block-size: var(--ui-folder-artifact-stack-block-size);
}

.ui-folder-artifact__stack-layers {
  position: absolute;
  inset: var(--ui-space-2);
}

.ui-folder-artifact__stack-layers[data-stack-layout='0'] {
  --ui-folder-artifact-stack-back-x: 0%;
  --ui-folder-artifact-stack-back-y: 1%;
  --ui-folder-artifact-stack-back-rotation: -5deg;
  --ui-folder-artifact-stack-front-x: 24%;
  --ui-folder-artifact-stack-front-y: 27%;
  --ui-folder-artifact-stack-front-rotation: 2.75deg;
}

.ui-folder-artifact__stack-layers[data-stack-layout='1'] {
  --ui-folder-artifact-stack-back-x: 2%;
  --ui-folder-artifact-stack-back-y: 0%;
  --ui-folder-artifact-stack-back-rotation: 4deg;
  --ui-folder-artifact-stack-front-x: 23%;
  --ui-folder-artifact-stack-front-y: 25%;
  --ui-folder-artifact-stack-front-rotation: -3.25deg;
}

.ui-folder-artifact__stack-layers[data-stack-layout='2'] {
  --ui-folder-artifact-stack-back-x: -1%;
  --ui-folder-artifact-stack-back-y: 2%;
  --ui-folder-artifact-stack-back-rotation: -3.25deg;
  --ui-folder-artifact-stack-front-x: 26%;
  --ui-folder-artifact-stack-front-y: 26%;
  --ui-folder-artifact-stack-front-rotation: 4.25deg;
}

.ui-folder-artifact__stack-layers[data-stack-layout='3'] {
  --ui-folder-artifact-stack-back-x: 1%;
  --ui-folder-artifact-stack-back-y: 0.5%;
  --ui-folder-artifact-stack-back-rotation: 5deg;
  --ui-folder-artifact-stack-front-x: 25%;
  --ui-folder-artifact-stack-front-y: 28%;
  --ui-folder-artifact-stack-front-rotation: -2.5deg;
}

.ui-folder-artifact__stack-layer {
  position: absolute;
  z-index: var(--ui-layer-raised);
  inset: 0 auto auto 0;
  box-sizing: border-box;
  width: 78%;
  margin: 0;
  padding: var(--ui-photo-frame-padding);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  background-color: var(--ui-photo-frame-bg);
  color: inherit;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
  box-shadow: var(--ui-photo-frame-shadow);
  transform-origin: center;
  transition:
    transform var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-exit);
}

.ui-folder-artifact__stack-layer--back {
  background-color: var(--ui-folder-artifact-photo-bg-back);
  transform: translate3d(
      var(--ui-folder-artifact-stack-back-x),
      var(--ui-folder-artifact-stack-back-y),
      0
    )
    rotate(var(--ui-folder-artifact-stack-back-rotation)) scale(0.98);
}

.ui-folder-artifact__stack-layer--front {
  z-index: var(--ui-layer-overlay);
  transform: translate3d(
      var(--ui-folder-artifact-stack-front-x),
      var(--ui-folder-artifact-stack-front-y),
      0
    )
    rotate(var(--ui-folder-artifact-stack-front-rotation));
}

.ui-folder-artifact__stack-position {
  position: absolute;
  z-index: var(--ui-layer-indicator);
  inset: var(--ui-space-2) var(--ui-space-2) auto auto;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-xs);
  background-color: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-caption);
  opacity: 0;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-folder-artifact--stack:hover .ui-folder-artifact__stack-position,
.ui-folder-artifact--stack:focus-within .ui-folder-artifact__stack-position {
  opacity: 1;
}

.ui-folder-artifact__stack-layer:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-folder-artifact-stack-enter-active,
.ui-folder-artifact-stack-leave-active {
  position: absolute;
}

.ui-folder-artifact-stack-enter-from {
  opacity: 0;
  transform: translate3d(-8%, 4%, 0) rotate(-7deg) scale(0.96);
}

.ui-folder-artifact-stack-leave-to {
  opacity: 0;
  transform: translate3d(38%, 12%, 0) rotate(9deg) scale(0.98);
}

:global(:root[data-ui-motion='reduced'] .ui-folder-artifact__stack-layer),
:global(:root[data-ui-motion='reduced'] .ui-folder-artifact__stack-position) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-folder-artifact__stack-layer,
  .ui-folder-artifact__stack-position {
    transition: none;
  }
}

@media (forced-colors: active) {
  .ui-folder-artifact--note,
  .ui-folder-artifact__stack-layer {
    border: var(--ui-border-width) solid CanvasText;
    background-color: Canvas;
    background-image: none;
    color: CanvasText;
  }

  .ui-folder-artifact--stack img {
    filter: none;
  }
}
</style>
