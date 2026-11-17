<script setup>
import { computed, onMounted, shallowRef, useId, watch } from 'vue';
import { ARTWORK_SIZE } from '../../constants/ui.js';
import { loadArtworkTone } from '../../utils/artworkTone.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import { t } from '../../utils/i18n.js';
import { performanceArchiveTicketDate } from '../../utils/performanceArchivePresentation.js';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiTooltip from '../ui/UiTooltip.vue';

const props = defineProps({ archive: { type: Object, required: true } });
const emit = defineEmits(['select']);
const name = computed(() => props.archive.name || t('playlist.row.untitled'));
const ticketDate = computed(() => performanceArchiveTicketDate(props.archive));
const dateId = useId();
const failedCoverUrl = shallowRef('');
const coverUrl = computed(() => {
  const url = props.archive.coverUrl;
  return url === failedCoverUrl.value ? '' : url;
});
const tone = shallowRef(null);
const artworkSources = computed(() =>
  [
    coverUrl.value,
    ...(props.archive.coverTracks ?? [])
      .slice(0, 4)
      .map(({ thumbnailUrl }) => thumbnailUrl),
  ].filter(Boolean),
);

onMounted(() => {
  watch(
    artworkSources,
    async (urls, _, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      tone.value = null;
      for (const url of urls) {
        const next = await loadArtworkTone(url);
        if (cancelled) return;
        if (next) {
          tone.value = next;
          return;
        }
      }
    },
    { immediate: true },
  );
});
</script>

<template>
  <UiTooltip :text="name" :described-by="false">
    <template #trigger="{ triggerProps }">
      <button
        v-bind="triggerProps"
        type="button"
        class="archive-ticket"
        :class="{ 'archive-ticket--tinted': tone }"
        :style="tone ? { '--archive-ticket-tone': tone } : undefined"
        :aria-label="t('session.archive.viewNamed', { name })"
        :aria-describedby="ticketDate ? dateId : undefined"
        @click="emit('select')"
      >
        <UiCollageThumb
          class="archive-ticket__artwork"
          :cover-url="coverUrl"
          :tracks="archive.coverTracks"
          :size="ARTWORK_SIZE.md"
          @error.capture="failedCoverUrl = coverUrl || failedCoverUrl"
        />
        <span class="archive-ticket__name" :lang="contentLangAttribute(name)">{{
          name
        }}</span>
        <span class="archive-ticket__stub">
          <time
            v-if="ticketDate"
            :id="dateId"
            class="archive-ticket__date"
            :datetime="ticketDate.datetime"
            :aria-label="ticketDate.label"
          >
            <span class="archive-ticket__month" lang="en">{{
              ticketDate.month
            }}</span>
            <span class="archive-ticket__day">{{ ticketDate.day }}</span>
          </time>
          <span v-else aria-hidden="true">—</span>
        </span>
      </button>
    </template>
  </UiTooltip>
</template>

<style scoped>
.archive-ticket {
  --archive-ticket-stub-width: var(--ui-space-8);
  --archive-ticket-seam: calc(100% - var(--archive-ticket-stub-width));
  --archive-ticket-notch: var(--ui-space-2);
  --archive-ticket-notch-cut:
    transparent calc(var(--archive-ticket-notch) - 1px),
    black var(--archive-ticket-notch);
  --archive-ticket-corner-radius: calc(var(--ui-space-1) * 1.5);
  --archive-ticket-corner:
    transparent calc(var(--archive-ticket-corner-radius) - 1px),
    black var(--archive-ticket-corner-radius);
  --archive-ticket-paper-base: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 68%,
    var(--ui-color-surface-hover)
  );
  --archive-ticket-paper: var(--archive-ticket-paper-base);
  --archive-ticket-stub-paper: var(--ui-color-surface-selected);
  --archive-ticket-ink: color-mix(
    in srgb,
    var(--ui-color-border) 60%,
    var(--archive-ticket-paper)
  );
  --archive-ticket-dot: color-mix(
    in srgb,
    var(--ui-color-text) 10%,
    transparent
  );

  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) var(--archive-ticket-stub-width);
  align-items: center;
  inline-size: 100%;
  max-inline-size: var(--archive-ticket-max-width, 22rem);
  padding: var(--ui-space-2) 0 var(--ui-space-2) var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius-xs);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.archive-ticket--tinted {
  --archive-ticket-paper: color-mix(
    in srgb,
    var(--archive-ticket-paper-base) 78%,
    var(--archive-ticket-tone)
  );
  --archive-ticket-stub-paper: color-mix(
    in srgb,
    var(--archive-ticket-paper-base) 62%,
    var(--archive-ticket-tone)
  );
}

.archive-ticket::before,
.archive-ticket::after {
  position: absolute;
  z-index: var(--ui-layer-behind);
  inset: 0;
  background-origin: border-box;
  mask:
    radial-gradient(circle at top left, var(--archive-ticket-corner)),
    radial-gradient(circle at top right, var(--archive-ticket-corner)),
    radial-gradient(circle at bottom left, var(--archive-ticket-corner)),
    radial-gradient(circle at bottom right, var(--archive-ticket-corner)),
    radial-gradient(
      circle at var(--archive-ticket-seam) top,
      var(--archive-ticket-notch-cut)
    ),
    radial-gradient(
      circle at var(--archive-ticket-seam) bottom,
      var(--archive-ticket-notch-cut)
    );
  mask-composite: intersect;
  pointer-events: none;
  content: '';
}

.archive-ticket::before {
  background:
    radial-gradient(
        circle,
        var(--archive-ticket-dot) calc(var(--ui-border-width) / 2),
        transparent var(--ui-border-width)
      )
      center / var(--ui-space-3) var(--ui-space-3),
    url('../../../overlay/shared/paper-grain.svg?no-inline'),
    linear-gradient(
      to right,
      var(--archive-ticket-paper) var(--archive-ticket-seam),
      var(--archive-ticket-stub-paper) 0
    );
  background-blend-mode: normal, soft-light, normal;
}

.archive-ticket::after {
  --archive-ticket-corner-stroke:
    var(--archive-ticket-ink) var(--archive-ticket-corner-radius),
    transparent
      calc(var(--archive-ticket-corner-radius) + var(--ui-border-width));
  --archive-ticket-notch-stroke:
    var(--archive-ticket-ink) var(--archive-ticket-notch),
    transparent calc(var(--archive-ticket-notch) + var(--ui-border-width));

  border: var(--ui-border-width) solid var(--archive-ticket-ink);
  background-image:
    radial-gradient(circle at top left, var(--archive-ticket-corner-stroke)),
    radial-gradient(circle at top right, var(--archive-ticket-corner-stroke)),
    radial-gradient(circle at bottom left, var(--archive-ticket-corner-stroke)),
    radial-gradient(
      circle at bottom right,
      var(--archive-ticket-corner-stroke)
    ),
    radial-gradient(
      circle at var(--archive-ticket-seam) top,
      var(--archive-ticket-notch-stroke)
    ),
    radial-gradient(
      circle at var(--archive-ticket-seam) bottom,
      var(--archive-ticket-notch-stroke)
    );
}

.archive-ticket:hover {
  --archive-ticket-paper-base: var(--ui-color-surface-hover);
}

.archive-ticket:active {
  --archive-ticket-paper-base: var(--ui-color-surface-active);
}

.archive-ticket:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.archive-ticket__artwork {
  box-shadow: 0 0 0 var(--ui-border-width) var(--archive-ticket-ink);
}

.archive-ticket__name {
  min-inline-size: 0;
  margin-inline: var(--ui-space-2);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
  overflow-wrap: anywhere;
}

.archive-ticket__stub {
  display: grid;
  align-self: stretch;
  place-items: center;
  border-inline-start: var(--ui-border-width) dotted var(--ui-color-current);
  color: var(--ui-color-current);
}

.archive-ticket__date {
  display: grid;
  gap: var(--ui-space-1);
  padding-inline: var(--ui-space-1);
  text-align: center;
  font-family: var(--ui-font-family-utility);
  font-variant-numeric: tabular-nums;
}

.archive-ticket__day {
  font-size: var(--ui-type-heading-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-heading-line-height);
}

.archive-ticket__month {
  font-size: var(--ui-type-label-size);
  line-height: var(--ui-type-label-line-height);
}

.archive-ticket--tinted .archive-ticket__stub {
  border-inline-start-color: color-mix(
    in srgb,
    var(--ui-color-text) 38%,
    transparent
  );
  color: var(--ui-color-text);
}
</style>
