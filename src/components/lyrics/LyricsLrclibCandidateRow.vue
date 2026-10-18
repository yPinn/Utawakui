<script setup>
import { computed, useId } from 'vue';
import { ChevronDown, ChevronRight } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import { formatLyricTime } from '../../utils/lyrics.js';
import {
  candidateImportMessage,
  capabilityLabel,
  warningLabels,
} from '../../utils/lrclibPresentation.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiStack from '../ui/UiStack.vue';

const props = defineProps({
  candidate: { type: Object, required: true },
  expanded: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  saveDisabled: { type: Boolean, default: false },
  changedCandidate: { type: Object, default: null },
  providerLabel: { type: String, default: 'LRCLIB' },
  showProvider: { type: Boolean, default: false },
  recommended: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle', 'save', 'confirmChanged', 'cancelChanged']);
const previewId = `lyrics-candidate-preview-${useId()}`;

const presentedCandidate = computed(
  () => props.changedCandidate || props.candidate,
);
const visibleWarnings = computed(() =>
  warningLabels(
    presentedCandidate.value.warnings,
    presentedCandidate.value.capability,
  ),
);
const importMessage = computed(() =>
  candidateImportMessage(presentedCandidate.value),
);

const capabilityTone = computed(() => {
  const level = presentedCandidate.value.capability?.level;
  if (level === 'T2' && !presentedCandidate.value.capability?.partial)
    return 'accent';
  if (level === 'unsupported') return 'warning';
  if (level === 'instrumental') return 'muted';
  return 'info';
});

const accessibleIdentity = computed(() =>
  [presentedCandidate.value.trackName, presentedCandidate.value.artistName]
    .filter(Boolean)
    .join('，'),
);

function formatDurationDifference(delta) {
  if (delta === 0) return '相同';
  return delta > 0 ? `多 ${delta} 秒` : `少 ${Math.abs(delta)} 秒`;
}

function durationLabel(candidate) {
  if (!Number.isFinite(candidate.duration)) return null;
  const delta = Number.isFinite(candidate.durationDeltaSigned)
    ? ` · ${formatDurationDifference(candidate.durationDeltaSigned)}`
    : '';
  return `${formatDuration(candidate.duration)}${delta}`;
}

function previewLineHasTiming(line) {
  return Number.isFinite(line?.start);
}
</script>

<template>
  <li class="lyrics-lrclib-candidate-row">
    <div class="lyrics-lrclib-candidate-row__header">
      <UiButton
        :icon="expanded ? ChevronDown : ChevronRight"
        class="lyrics-lrclib-candidate-row__toggle"
        :aria-expanded="expanded"
        :aria-controls="previewId"
        :aria-label="`${expanded ? '收合' : '展開'} ${accessibleIdentity}${recommended ? '，建議來源' : ''}`"
        @click="emit('toggle')"
      >
        <span class="lyrics-lrclib-candidate-row__info">
          <span class="lyrics-lrclib-candidate-row__title-row">
            <span class="lyrics-lrclib-candidate-row__title" dir="auto">
              {{ presentedCandidate.trackName }}
            </span>
            <UiChip
              v-if="recommended"
              class="lyrics-lrclib-candidate-row__recommendation"
              tone="accent"
              aria-hidden="true"
            >
              建議來源
            </UiChip>
          </span>
          <span class="lyrics-lrclib-candidate-row__subtitle" dir="auto">
            {{ presentedCandidate.artistName }}
            <template v-if="presentedCandidate.albumName"
              >・{{ presentedCandidate.albumName }}</template
            >
          </span>
        </span>
      </UiButton>

      <div class="lyrics-lrclib-candidate-row__summary">
        <span class="lyrics-lrclib-candidate-row__summary-details">
          <span
            v-if="showProvider"
            class="lyrics-lrclib-candidate-row__provider-slot"
          >
            <span class="lyrics-lrclib-candidate-row__provider" dir="auto">
              {{ providerLabel }}
            </span>
          </span>
          <span
            v-if="durationLabel(presentedCandidate)"
            class="lyrics-lrclib-candidate-row__duration"
            :class="{
              'lyrics-lrclib-candidate-row__duration--divided': showProvider,
            }"
          >
            {{ durationLabel(presentedCandidate) }}
          </span>
        </span>
        <div class="lyrics-lrclib-candidate-row__metadata">
          <div
            v-if="candidate.alreadySaved"
            class="lyrics-lrclib-candidate-row__saved-status"
          >
            <UiChip tone="success">已儲存</UiChip>
          </div>
          <UiChip
            v-if="candidate.saveState === 'update-available'"
            tone="warning"
          >
            有更新
          </UiChip>
          <UiChip :tone="capabilityTone">{{
            capabilityLabel(presentedCandidate)
          }}</UiChip>
        </div>
      </div>
    </div>

    <div
      v-if="expanded"
      :id="previewId"
      class="lyrics-lrclib-candidate-row__expanded"
    >
      <UiSurface
        v-if="presentedCandidate.previewLines?.length"
        tag="ol"
        tone="canvas"
        radius="sm"
        class="lyrics-lrclib-candidate-preview__lines"
        aria-label="歌詞預覽"
      >
        <li
          v-for="(line, index) in presentedCandidate.previewLines"
          :key="index"
          class="lyrics-lrclib-candidate-preview__line"
          :class="{
            'lyrics-lrclib-candidate-preview__line--untimed':
              !previewLineHasTiming(line),
          }"
        >
          <span
            v-if="previewLineHasTiming(line)"
            class="lyrics-lrclib-candidate-preview__time"
            >{{ formatLyricTime(line.start) }}</span
          >
          <span class="lyrics-lrclib-candidate-preview__text" dir="auto">{{
            line.text
          }}</span>
        </li>
      </UiSurface>

      <UiNotice
        v-if="changedCandidate"
        tone="warning"
        title="來源內容已更新"
        :message="`${providerLabel} 的內容與預覽時不同。請先確認，再決定是否改用更新後內容。`"
        compact
      />

      <UiStack
        class="lyrics-lrclib-candidate-row__support"
        :gap="2"
        align="center"
        wrap
      >
        <div class="lyrics-lrclib-candidate-row__warning-slot">
          <ul
            v-if="visibleWarnings.length"
            class="lyrics-lrclib-candidate-row__warnings"
          >
            <li v-for="warning in visibleWarnings" :key="warning">
              {{ warning }}
            </li>
          </ul>
        </div>

        <div
          v-if="!importMessage && (changedCandidate || !candidate.alreadySaved)"
          class="lyrics-lrclib-candidate-row__footer"
        >
          <template v-if="changedCandidate">
            <UiButton @click="emit('cancelChanged')">取消</UiButton>
            <UiButton
              variant="accent"
              :disabled="saveDisabled"
              @click="emit('confirmChanged')"
            >
              {{ saving ? '儲存中…' : '改用更新內容' }}
            </UiButton>
          </template>
          <UiButton
            v-else
            variant="accent"
            :disabled="saveDisabled"
            :aria-label="`${candidate.saveState === 'update-available' ? '更新' : '儲存'} ${accessibleIdentity}`"
            @click="emit('save')"
          >
            {{
              saving
                ? '儲存中…'
                : candidate.saveState === 'update-available'
                  ? '更新'
                  : '儲存'
            }}
          </UiButton>
        </div>
      </UiStack>
      <p v-if="importMessage" class="lyrics-lrclib-candidate-row__availability">
        {{ importMessage }}
      </p>
    </div>
  </li>
</template>

<style scoped>
.lyrics-lrclib-candidate-row__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.lyrics-lrclib-candidate-row__metadata {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  margin-inline-start: auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.lyrics-lrclib-candidate-row__saved-status {
  flex: 0 0 auto;
}

.lyrics-lrclib-candidate-row__info {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.lyrics-lrclib-candidate-row__title-row {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
}

.lyrics-lrclib-candidate-row__title {
  min-width: 0;
  flex: 0 1 auto;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-body-line-height);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-lrclib-candidate-row__recommendation {
  flex: 0 0 auto;
}

.lyrics-lrclib-candidate-row__subtitle {
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: anywhere;
}

.lyrics-lrclib-candidate-row__summary {
  display: grid;
  grid-template-rows:
    calc(var(--ui-type-body-size) * var(--ui-type-body-line-height))
    calc(var(--ui-type-caption-size) * var(--ui-type-caption-line-height));
  justify-items: end;
  align-content: start;
  gap: var(--ui-space-1);
  flex-shrink: 0;
  padding-top: calc(var(--ui-border-width) + var(--ui-space-1));
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.lyrics-lrclib-candidate-row__summary-details {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.lyrics-lrclib-candidate-row__provider-slot {
  flex: 0 0 var(--ui-lyrics-provider-slot-width);
  width: var(--ui-lyrics-provider-slot-width);
  box-sizing: border-box;
  padding-inline-end: var(--ui-space-2);
  text-align: end;
}

.lyrics-lrclib-candidate-row__provider {
  display: block;
  overflow: hidden;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-lrclib-candidate-row__duration {
  flex: 0 0 var(--ui-lyrics-duration-slot-width);
  width: var(--ui-lyrics-duration-slot-width);
  box-sizing: border-box;
  text-align: end;
  white-space: nowrap;
}

.lyrics-lrclib-candidate-row__duration--divided {
  padding-inline-start: var(--ui-space-2);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-lrclib-candidate-row__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-3);
  flex: 0 0 auto;
  max-inline-size: 100%;
}

.lyrics-lrclib-candidate-preview__lines {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.lyrics-lrclib-candidate-preview__line {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--ui-space-7) minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.lyrics-lrclib-candidate-preview__line--untimed {
  grid-template-columns: minmax(0, 1fr);
}

.lyrics-lrclib-candidate-preview__time {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}

.lyrics-lrclib-candidate-preview__text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.lyrics-lrclib-candidate-row {
  --ui-lyrics-provider-slot-width: 5.5rem;
  --ui-lyrics-duration-slot-width: 7.5rem;
  --ui-lyrics-candidate-content-inset: calc(
    var(--ui-border-width) + var(--ui-space-3) + var(--ui-space-4) +
      var(--ui-space-1)
  );

  padding: var(--ui-space-2) var(--ui-space-3);
  border: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 0;
  background: transparent;
}

.lyrics-lrclib-candidate-row:last-child {
  border-bottom: 0;
}

.lyrics-lrclib-candidate-row__header > .lyrics-lrclib-candidate-row__toggle {
  min-width: 0;
  flex: 1;
  align-items: flex-start;
  justify-content: flex-start;
  text-align: start;
}

.lyrics-lrclib-candidate-row__toggle :deep(.ui-btn__icon) {
  margin-block-start: var(--ui-space-1);
}

.lyrics-lrclib-candidate-row__title,
.lyrics-lrclib-candidate-row__subtitle {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
  white-space: normal;
}

.lyrics-lrclib-candidate-row__title {
  -webkit-line-clamp: 2;
}

.lyrics-lrclib-candidate-row__subtitle {
  -webkit-line-clamp: 2;
}

.lyrics-lrclib-candidate-row__expanded {
  display: grid;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-2);
  padding-inline-start: var(--ui-lyrics-candidate-content-inset);
}

.lyrics-lrclib-candidate-row__warnings {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  padding-inline-start: calc(var(--ui-border-width) + var(--ui-space-3));
  list-style: none;
  color: var(--ui-color-warning);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.lyrics-lrclib-candidate-row__warning-slot {
  min-inline-size: 0;
  flex: 1 1 0;
  display: grid;
  align-content: center;
  min-block-size: calc(
    var(--ui-type-caption-size) * var(--ui-type-caption-line-height) * 2 +
      var(--ui-space-1)
  );
}

.lyrics-lrclib-candidate-row__availability {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.lyrics-lrclib-candidate-preview__lines {
  padding: var(--ui-space-2) var(--ui-space-3);
}

@media (max-width: 680px) {
  .lyrics-lrclib-candidate-row__header {
    display: grid;
  }

  .lyrics-lrclib-candidate-row__summary {
    flex-wrap: wrap;
    padding-inline-start: var(--ui-lyrics-candidate-content-inset);
  }

  .lyrics-lrclib-candidate-row__expanded {
    padding-inline-start: 0;
  }
}
</style>
