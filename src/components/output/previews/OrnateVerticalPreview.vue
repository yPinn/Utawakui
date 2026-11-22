<script setup>
import { computed } from 'vue';
import {
  ORNATE_VERTICAL_SHADOW_DISTANCE,
  ornateVerticalEntrancePlan,
} from '../../../../shared/presentation/ornateVerticalMotion.mjs';
import {
  ORNATE_VERTICAL_COLUMN_GAP,
  ORNATE_VERTICAL_COLUMN_STEP_EM,
  adaptOrnateVerticalLyricsPresentation,
  createOrnateVerticalDocumentContext,
  ornateVerticalGlyphParts,
} from '../../../../shared/presentation/ornateVerticalPresentation.mjs';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const sourceTexts = computed(() => [
  props.scene?.lyrics?.current ?? '',
  props.scene?.lyrics?.next ?? '',
]);
const replaceColumns = computed(
  () => props.scene?.appearance?.ornateColumnMode === 'replace',
);
const entrance = computed(() => props.scene?.appearance?.ornateEntrance);

const previewLines = computed(() => {
  const document = props.scene?.snapshot?.lyrics;
  const documentLines = document?.lines ?? [];
  const currentIndex = props.scene?.lyrics?.lineIndex ?? -1;
  const nextIndex = documentLines.findIndex(
    (line, index) => index > currentIndex && line.text?.trim(),
  );
  const indices = [currentIndex, nextIndex];
  const showSectionAccent = props.scene?.appearance?.sectionAccent === 'auto';
  const mixedSizes =
    props.scene?.appearance?.ornateArrangement === 'mixed-sizes';
  const documentContext = createOrnateVerticalDocumentContext(
    showSectionAccent ? documentLines : sourceTexts.value,
    { synced: showSectionAccent && document?.synced === true },
  );

  return sourceTexts.value.map((text, lineIndex) => {
    const index = indices[lineIndex];
    const presentation = adaptOrnateVerticalLyricsPresentation(text, {
      documentContext,
      lineIndex:
        documentLines[index]?.text?.trim() === text.trim() ? index : -1,
    });

    return {
      ...presentation,
      offset: lineIndex === 0 ? '0s' : '-3.2s',
      segments: presentation.segments.map((segment) => {
        const glyphParts = ornateVerticalGlyphParts(segment.units, mixedSizes);
        const columnStart =
          (segment.units[0].index / presentation.units.length) * 3.2;
        const columnDwell =
          (segment.units.length / presentation.units.length) * 3.2;
        const { delays, offsets } = ornateVerticalEntrancePlan(
          segment.units,
          Math.max(0, columnDwell - 0.18),
          entrance.value,
          `${index}\0${presentation.text}`,
        );
        return {
          ...segment,
          start: `${columnStart}s`,
          visible: replaceColumns.value
            ? `${(columnDwell / 6.4) * 100}%`
            : '50%',
          units: segment.units.map((unit, index) => ({
            ...unit,
            parts: glyphParts[index],
            mixedSizes,
            instant: !offsets && delays[index] === 0,
            offset: offsets?.[index],
            delay: `${columnStart + delays[index]}s`,
          })),
        };
      }),
    };
  });
});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <span
      class="ornate-preview"
      :data-animated="animated ? 'true' : 'false'"
      :data-column-mode="replaceColumns ? 'replace' : 'retain'"
      :data-entrance="entrance"
    >
      <span
        v-for="(line, lineIndex) in previewLines"
        :key="`${lineIndex}-${line.text}`"
        class="ornate-preview__line"
        :data-placement="line.placement"
        :data-segment-count="line.segments.length"
        :style="{
          '--ornate-line-offset': line.offset,
          '--ornate-column-gap': ORNATE_VERTICAL_COLUMN_GAP,
          '--ornate-shadow-distance': ORNATE_VERTICAL_SHADOW_DISTANCE,
        }"
      >
        <span
          v-for="segment in line.segments"
          :key="`${lineIndex}-segment-${segment.index}-${segment.text}`"
          class="ornate-preview__segment"
          :data-segment-index="segment.index"
          :style="{
            marginTop: replaceColumns
              ? undefined
              : `${segment.index * ORNATE_VERTICAL_COLUMN_STEP_EM}em`,
            '--ornate-column-start': segment.start,
            '--ornate-column-visible': segment.visible,
          }"
        >
          <span
            v-for="unit in segment.units"
            :key="`${lineIndex}-${unit.index}-${unit.text}`"
            class="ornate-preview__unit"
            :data-emphasis="unit.emphasis"
            :data-instant="unit.instant ? 'true' : undefined"
            :data-kind="unit.kind"
            :data-text="unit.mixedSizes ? undefined : unit.text"
            :style="{
              '--ornate-unit-delay': unit.delay,
              '--ornate-slide-x': unit.offset?.x,
              '--ornate-slide-y': unit.offset?.y,
            }"
            ><template v-if="unit.parts">
              <span
                v-for="(part, partIndex) in unit.parts"
                :key="partIndex"
                :class="{ 'ornate-preview__accent': part.accent }"
                :data-ornate-shadow="
                  part.kind === 'han' ? part.text : undefined
                "
                :data-ornate-echo="
                  unit.mixedSizes &&
                  unit.emphasis === 'keyword' &&
                  part.kind === 'han'
                    ? part.text
                    : undefined
                "
                :style="part.style"
                >{{ part.text }}</span
              > </template
            ><template v-else>{{ unit.text }}</template></span
          >
        </span>
      </span>
    </span>
  </div>
</template>

<style scoped>
@font-face {
  font-family: 'Utawakui Hina Mincho';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../../../../shared/assets/fonts/HinaMincho-Regular.ttf')
    format('truetype');
}

.ornate-preview {
  position: absolute;
  inset: 18% 8% 4% 4%;
  isolation: isolate;
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  box-sizing: border-box;
  overflow: visible;
  color: var(--obs-preview-ink);
  font-family: var(--obs-user-font-family);
  line-height: 0.96;
  text-shadow: var(--ui-output-preview-ornate-shadow);
}

.obs-template-mockup[data-appearance-text-shadow='off'] .ornate-preview {
  text-shadow: none;
}

.ornate-preview__line {
  position: relative;
  grid-area: 1 / 1;
  align-self: start;
  justify-self: end;
  max-inline-size: 100%;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  column-gap: var(--ornate-column-gap);
  font-size: var(--ui-output-preview-ornate-font-size);
  opacity: 0;
}

.ornate-preview__segment {
  display: block;
  flex: 0 0 auto;
  line-height: inherit;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;
}

.ornate-preview__line:first-child {
  opacity: 1;
}

.ornate-preview__unit {
  position: relative;
  display: inline;
  font-size: inherit;
  line-height: inherit;
}

.ornate-preview__unit[data-emphasis='keyword'] {
  z-index: var(--ui-layer-base);
  color: var(--ui-output-preview-ornate-paper);
  font-size: inherit;
  line-height: inherit;
}

[data-ornate-echo] {
  position: relative;
}

.ornate-preview__unit[data-kind='han'] {
  z-index: var(--ui-layer-base);
}

[data-ornate-shadow] {
  position: relative;
}

[data-ornate-shadow]::after {
  position: absolute;
  z-index: var(--ui-layer-behind);
  inset: 0;
  display: grid;
  place-content: center;
  content: attr(data-ornate-shadow) / '';
  color: transparent;
  text-shadow: 0 0 0.025em var(--ui-output-preview-ornate-cast-ink);
  transform: translateX(var(--ornate-shadow-distance));
}

.obs-template-mockup[data-appearance-text-shadow='off']
  [data-ornate-shadow]::after {
  content: none;
}

:is(
  .ornate-preview__unit[data-emphasis='keyword'][data-text],
  [data-ornate-echo]
)::before {
  position: absolute;
  z-index: var(--ui-layer-behind);
  inset: 0;
  content: attr(data-text);
  color: var(--ui-output-preview-ornate-echo);
  text-shadow: none;
  transform: translate(0.055em, 0.035em);
}

[data-ornate-echo]::before {
  content: attr(data-ornate-echo);
}

.obs-template-mockup[data-appearance-section-accent='auto']
  :is(
    .ornate-preview__unit[data-emphasis='keyword'][data-text],
    [data-ornate-echo]
  )::before {
  content: none;
}

.obs-template-mockup[data-appearance-section-accent='auto']
  .ornate-preview__accent {
  color: var(--obs-ornate-section-accent);
}

.ornate-preview[data-animated='true'] .ornate-preview__line {
  animation: ornate-preview-line-cycle 6.4s steps(1, end) infinite both;
  animation-delay: var(--ornate-line-offset);
}

.ornate-preview[data-column-mode='replace'] .ornate-preview__line {
  display: grid;
}

.ornate-preview[data-column-mode='replace'] .ornate-preview__segment {
  grid-area: 1 / 1;
  justify-self: end;
  align-self: start;
}

.ornate-preview[data-column-mode='replace'][data-animated='false']
  .ornate-preview__segment:not(:first-child) {
  display: none;
}

.ornate-preview[data-animated='true'] .ornate-preview__segment {
  animation: ornate-preview-column-cycle 6.4s
    linear(
      0 0%,
      0 var(--ornate-column-visible),
      1 var(--ornate-column-visible),
      1 100%
    )
    infinite both;
  animation-delay: calc(
    var(--ornate-line-offset) + var(--ornate-column-start) - 6.4s
  );
}

.ornate-preview[data-animated='true']
  .ornate-preview__unit:not([data-instant='true']) {
  animation: ornate-preview-unit-cycle 6.4s
    cubic-bezier(0.333333, 1, 0.666667, 1) infinite both;
  animation-delay: calc(var(--ornate-line-offset) + var(--ornate-unit-delay));
  will-change: opacity;
}

.ornate-preview[data-entrance='random-slide'] .ornate-preview__unit {
  display: inline-block;
}

.ornate-preview[data-animated='true'][data-entrance='random-slide']
  .ornate-preview__unit {
  animation-name: ornate-preview-slide-cycle;
  will-change: transform, opacity;
}

@keyframes ornate-preview-column-cycle {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.ornate-preview[data-animated='true'] [data-ornate-shadow]::after {
  animation: ornate-preview-shadow-cycle 6.4s
    cubic-bezier(0.333333, 1, 0.666667, 1) infinite both;
  animation-delay: calc(var(--ornate-line-offset) + var(--ornate-unit-delay));
}

@keyframes ornate-preview-line-cycle {
  0% {
    opacity: 1;
  }

  50%,
  100% {
    opacity: 0;
  }
}

@keyframes ornate-preview-unit-cycle {
  /* Reset the unit while the parent line is hidden, before the next stagger. */
  0%,
  55%,
  100% {
    opacity: 0;
  }

  /* 0.12s of the 6.4s preview cycle, matching the Browser Source entrance. */
  1.875%,
  50% {
    opacity: 1;
  }
}

@keyframes ornate-preview-slide-cycle {
  0%,
  55%,
  100% {
    opacity: 0;
    transform: translate(var(--ornate-slide-x), var(--ornate-slide-y));
  }

  /* 0.3s of the 6.4s preview cycle. */
  4.6875%,
  50% {
    opacity: 1;
    transform: none;
  }
}

@keyframes ornate-preview-shadow-cycle {
  0%,
  55%,
  100% {
    transform: translateX(0);
  }

  /* 0.18s of the 6.4s preview cycle. */
  2.8125%,
  50% {
    transform: translateX(var(--ornate-shadow-distance));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ornate-preview__line,
  .ornate-preview__segment,
  .ornate-preview__unit,
  .ornate-preview [data-ornate-shadow]::after {
    animation: none !important;
  }

  .ornate-preview__line:not(:first-child) {
    opacity: 0;
  }

  .ornate-preview[data-column-mode='replace']
    .ornate-preview__segment:not(:first-child) {
    display: none;
  }
}
</style>

<style src="./OrnateVerticalPreview.css"></style>
