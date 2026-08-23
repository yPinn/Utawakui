<script setup>
import { computed } from 'vue';
import { Check, ChevronRight } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import { formatLyricTime } from '../../utils/lyrics.js';
import {
  capabilityLabel,
  matchReasonLabels,
  warningLabels,
} from '../../utils/lrclibPresentation.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  candidate: { type: Object, required: true },
  expanded: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  saveDisabled: { type: Boolean, default: false },
  changedCandidate: { type: Object, default: null },
});

const emit = defineEmits(['toggle', 'save', 'confirmChanged', 'cancelChanged']);

const presentedCandidate = computed(
  () => props.changedCandidate || props.candidate,
);
const visibleWarnings = computed(() =>
  warningLabels(presentedCandidate.value.warnings),
);
const visibleReasons = computed(() =>
  matchReasonLabels(presentedCandidate.value.matchReasons),
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

function formatSignedDelta(delta) {
  if (delta === 0) return '0s';
  return delta > 0 ? `+${delta}s` : `${delta}s`;
}

function durationLabel(candidate) {
  if (!Number.isFinite(candidate.duration)) return null;
  const delta = Number.isFinite(candidate.durationDeltaSigned)
    ? `（${formatSignedDelta(candidate.durationDeltaSigned)}）`
    : '';
  return `${formatDuration(candidate.duration)}${delta}`;
}

function retrievedAtLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
</script>

<template>
  <li
    class="lyrics-lrclib-candidate-row"
    :class="{ 'lyrics-lrclib-candidate-row--expanded': expanded }"
  >
    <div class="lyrics-lrclib-candidate-row__header">
      <button
        type="button"
        class="lyrics-lrclib-candidate-row__toggle"
        :aria-expanded="expanded"
        :aria-label="`${expanded ? '收合' : '展開'} ${accessibleIdentity}`"
        @click="emit('toggle')"
      >
        <ChevronRight
          class="lyrics-lrclib-candidate-row__chevron"
          :class="{
            'lyrics-lrclib-candidate-row__chevron--expanded': expanded,
          }"
          aria-hidden="true"
        />
        <span class="lyrics-lrclib-candidate-row__info">
          <span class="lyrics-lrclib-candidate-row__title" dir="auto">
            {{ presentedCandidate.trackName }}
          </span>
          <span class="lyrics-lrclib-candidate-row__subtitle" dir="auto">
            {{ presentedCandidate.artistName }}
            <template v-if="presentedCandidate.albumName"
              >・{{ presentedCandidate.albumName }}</template
            >
          </span>
        </span>
      </button>

      <div class="lyrics-lrclib-candidate-row__summary">
        <span v-if="durationLabel(presentedCandidate)">{{
          durationLabel(presentedCandidate)
        }}</span>
        <UiChip :tone="capabilityTone">{{
          capabilityLabel(presentedCandidate)
        }}</UiChip>
        <UiChip v-if="presentedCandidate.language" tone="muted">
          {{ presentedCandidate.language }}
        </UiChip>
        <UiChip
          v-if="candidate.saveState === 'update-available'"
          tone="warning"
        >
          有更新
        </UiChip>
      </div>
    </div>

    <p
      v-if="presentedCandidate.previewLines?.[0]"
      class="lyrics-lrclib-candidate-row__preview-line"
      dir="auto"
    >
      {{ presentedCandidate.previewLines[0].text }}
    </p>

    <div v-if="expanded" class="lyrics-lrclib-candidate-row__expanded">
      <ul
        v-if="visibleWarnings.length"
        class="lyrics-lrclib-candidate-row__warnings"
      >
        <li v-for="warning in visibleWarnings" :key="warning">{{ warning }}</li>
      </ul>

      <ol
        v-if="presentedCandidate.previewLines?.length"
        class="lyrics-lrclib-candidate-preview__lines"
        aria-label="歌詞預覽"
      >
        <li
          v-for="(line, index) in presentedCandidate.previewLines"
          :key="index"
        >
          <span class="lyrics-lrclib-candidate-preview__time">{{
            formatLyricTime(line.start)
          }}</span>
          <span dir="auto">{{ line.text }}</span>
        </li>
      </ol>

      <details class="lyrics-lrclib-candidate-row__details">
        <summary>更多比對資訊</summary>
        <dl>
          <div>
            <dt>LRCLIB id</dt>
            <dd>{{ presentedCandidate.id }}</dd>
          </div>
          <div>
            <dt>資料量</dt>
            <dd>
              {{ presentedCandidate.lineCount }} 行・{{
                presentedCandidate.segmentCount
              }}
              段
            </dd>
          </div>
          <div v-if="visibleReasons.length">
            <dt>符合依據</dt>
            <dd>{{ visibleReasons.join('、') }}</dd>
          </div>
          <div v-if="retrievedAtLabel(presentedCandidate.retrievedAt)">
            <dt>上次保存</dt>
            <dd>{{ retrievedAtLabel(presentedCandidate.retrievedAt) }}</dd>
          </div>
        </dl>
      </details>

      <UiNotice
        v-if="changedCandidate"
        tone="warning"
        title="來源內容已更新"
        message="LRCLIB 的內容與預覽時不同。請先確認，再決定是否改用更新後內容。"
        compact
      />

      <div class="lyrics-lrclib-candidate-row__footer">
        <template v-if="changedCandidate">
          <UiButton @click="emit('cancelChanged')">取消</UiButton>
          <UiButton
            variant="accent"
            :disabled="saveDisabled"
            @click="emit('confirmChanged')"
          >
            {{ saving ? '保存中…' : '改用更新內容' }}
          </UiButton>
        </template>
        <UiButton
          v-else-if="candidate.alreadySaved"
          :icon="Check"
          disabled
          :aria-label="`${accessibleIdentity} 已保存`"
        >
          已保存
        </UiButton>
        <UiButton
          v-else
          :disabled="saveDisabled"
          :aria-label="`${candidate.saveState === 'update-available' ? '更新' : '保存'} ${accessibleIdentity}`"
          @click="emit('save')"
        >
          {{
            saving
              ? '保存中…'
              : candidate.saveState === 'update-available'
                ? '更新'
                : '保存'
          }}
        </UiButton>
      </div>
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

.lyrics-lrclib-candidate-row__info {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.lyrics-lrclib-candidate-row__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-lrclib-candidate-row__subtitle {
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.lyrics-lrclib-candidate-row__summary {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.lyrics-lrclib-candidate-row__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-2);
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

.lyrics-lrclib-candidate-preview__lines li {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.lyrics-lrclib-candidate-preview__time {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}

.lyrics-lrclib-candidate-row {
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 0;
  background: transparent;
}

.lyrics-lrclib-candidate-row:last-child {
  border-bottom: 0;
}

.lyrics-lrclib-candidate-row--expanded {
  background: var(--ui-color-canvas);
}

.lyrics-lrclib-candidate-row__toggle {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.lyrics-lrclib-candidate-row__toggle:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-lrclib-candidate-row__chevron {
  width: 1rem;
  flex: 0 0 1rem;
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  transition: transform var(--ui-motion-fast) var(--ui-motion-ease);
}

.lyrics-lrclib-candidate-row__chevron--expanded {
  transform: rotate(90deg);
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

.lyrics-lrclib-candidate-row__preview-line {
  margin: var(--ui-space-2) 0 0 calc(1rem + var(--ui-space-2));
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-lrclib-candidate-row__expanded {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
  padding-left: calc(1rem + var(--ui-space-2));
}

.lyrics-lrclib-candidate-row__warnings {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding-left: var(--ui-space-5);
  color: var(--ui-color-warning);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-lrclib-candidate-preview__lines {
  padding: var(--ui-space-2) var(--ui-space-3);
  border-left: var(--ui-border-width) solid var(--ui-color-border-strong);
  background: var(--ui-color-surface);
}

.lyrics-lrclib-candidate-row__details {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-lrclib-candidate-row__details summary {
  width: fit-content;
  color: var(--ui-color-text);
  cursor: pointer;
}

.lyrics-lrclib-candidate-row__details summary:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-lrclib-candidate-row__details dl {
  display: grid;
  gap: var(--ui-space-1);
  margin: var(--ui-space-2) 0 0;
}

.lyrics-lrclib-candidate-row__details dl div {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.lyrics-lrclib-candidate-row__details dt {
  font-weight: var(--ui-font-weight-strong);
}

.lyrics-lrclib-candidate-row__details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 680px) {
  .lyrics-lrclib-candidate-row__header {
    display: grid;
  }

  .lyrics-lrclib-candidate-row__summary {
    flex-wrap: wrap;
    padding-left: calc(1rem + var(--ui-space-2));
  }

  .lyrics-lrclib-candidate-row__expanded {
    padding-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lyrics-lrclib-candidate-row__chevron {
    transition: none;
  }
}
</style>
