<script setup>
import { computed, onBeforeUnmount, useTemplateRef } from 'vue';
import { Copy, ExternalLink } from '../../icons/index.js';
import { useClipboardFeedback } from '../../composables/useClipboardFeedback.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiTextField from '../ui/UiTextField.vue';

const props = defineProps({
  candidate: { type: Object, required: true },
  modelValue: { type: Object, required: true },
  rejectionReason: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  approvalBlocker: { type: String, default: '' },
  approvalField: { type: String, default: '' },
});

const emit = defineEmits([
  'update:modelValue',
  'update:rejectionReason',
  'approve',
  'reject',
]);

const languageOptionsByStratum = Object.freeze({
  'chinese-rap': ['mandarin', 'cantonese', 'multilingual'],
  'chinese-pop': ['mandarin', 'cantonese', 'multilingual'],
  'english-catalog': ['english', 'multilingual'],
  'japanese-catalog': ['japanese', 'multilingual'],
  'korean-catalog': ['korean', 'multilingual'],
});
const languageLabels = Object.freeze({
  mandarin: '華語',
  cantonese: '粵語',
  english: '英文',
  japanese: '日文',
  korean: '韓文',
  multilingual: '多語',
});
const versionOptions = Object.freeze([
  ['studio', '錄音室版'],
  ['live', '現場版'],
  ['remaster', '重製版'],
  ['cover', '翻唱版'],
  ['remix', '混音版'],
  ['acoustic', '不插電版'],
]);
const rejectionOptions = Object.freeze([
  ['language-mismatch', '語言不符'],
  ['genre-mismatch', '曲風不符'],
  ['credit-mismatch', '演出者／作品不符'],
  ['version-ambiguous', '版本無法確認'],
  ['metadata-insufficient', '資料不足'],
  ['duplicate-recording', '重複錄音'],
  ['release-before-2010', '實際首發早於 2010 年'],
  ['other', '其他受控原因'],
]);
const approvalControlIds = Object.freeze({
  title: 'lyrics-review-title',
  artist: 'lyrics-review-artist',
  durationSeconds: 'lyrics-review-duration',
  languageTag: 'lyrics-review-language',
  version: 'lyrics-review-version',
  eraTag: 'lyrics-review-era',
});
const reviewForm = useTemplateRef('review-form');

const languageOptions = computed(
  () => languageOptionsByStratum[props.candidate.stratum] ?? [],
);
const lookupQuery = computed(
  () =>
    `${props.candidate.reference.artist} ${props.candidate.reference.title}`,
);
const {
  state: copyState,
  copy: copyText,
  dispose: disposeCopyFeedback,
} = useClipboardFeedback({
  writeText: (action) => {
    const runAction =
      globalThis.window?.Utawakui?.runLyricsProviderReviewLookupAction;
    if (typeof runAction !== 'function') {
      return Promise.reject(new Error('review lookup action unavailable'));
    }
    return runAction({ candidateId: props.candidate.id, action });
  },
});

onBeforeUnmount(disposeCopyFeedback);

function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function catalogReachLabel(value) {
  return value === 'mainstream' ? '主流' : '長尾';
}

function copyCandidateId() {
  return copyText('copy-candidate-id', '候選 ID');
}

function copyRecordingMbid() {
  return copyText('copy-recording-mbid', 'Recording MBID');
}

function copyLookupQuery() {
  return copyText('copy-artist-title', '歌手＋歌名');
}

function openMusicBrainz() {
  return copyText('open-musicbrainz-recording', 'MusicBrainz', {
    successMessage: '已開啟 MusicBrainz',
    errorMessage: '無法開啟 MusicBrainz，請改用 Recording MBID 查詢。',
  });
}

function submitApproval() {
  if (!props.approvalField) {
    emit('approve');
    return;
  }

  const controlId = approvalControlIds[props.approvalField];
  const control = controlId
    ? reviewForm.value?.querySelector(`#${controlId}`)
    : null;
  control?.focus();
}
</script>

<template>
  <form ref="review-form" class="review-form" @submit.prevent="submitApproval">
    <header class="review-form__header">
      <div>
        <span class="review-form__eyebrow">審核中</span>
        <h2 dir="auto">
          {{ candidate.reference.artist }} — {{ candidate.reference.title }}
        </h2>
      </div>
      <div class="review-form__header-status">
        <UiChip
          :tone="candidate.catalogReach === 'mainstream' ? 'accent' : 'warning'"
        >
          {{ catalogReachLabel(candidate.catalogReach) }}
        </UiChip>
        <UiChip
          :tone="
            candidate.decision === 'approved'
              ? 'success'
              : candidate.decision === 'rejected'
                ? 'danger'
                : 'warning'
          "
        >
          {{
            candidate.decision === 'approved'
              ? '已核准'
              : candidate.decision === 'rejected'
                ? '已拒絕'
                : '待審'
          }}
        </UiChip>
      </div>
    </header>

    <section class="review-form__lookup" aria-labelledby="review-lookup-title">
      <div class="review-form__lookup-heading">
        <h3 id="review-lookup-title" class="review-form__lookup-title">
          查證輔助
        </h3>
        <span>先確認錄音版本，再決定是否核准。</span>
      </div>

      <div class="review-form__lookup-list">
        <div class="review-form__lookup-row">
          <div class="review-form__lookup-identity">
            <span>候選 ID（本批資料）</span>
            <code class="review-form__lookup-value review-form__selectable">
              {{ candidate.id }}
            </code>
          </div>
          <p>只用於這批 F8 審核資料；可貼到上方搜尋欄定位同一筆。</p>
          <div class="review-form__lookup-actions">
            <UiButton
              :icon="Copy"
              title="複製本批資料的候選 ID"
              aria-label="複製本批資料的候選 ID"
              @click="copyCandidateId"
            >
              複製候選 ID
            </UiButton>
          </div>
        </div>

        <div class="review-form__lookup-row">
          <div class="review-form__lookup-identity">
            <span>Recording MBID（MusicBrainz 錄音 ID）</span>
            <code class="review-form__lookup-value review-form__selectable">
              {{ candidate.evidence.recordingMbid }}
            </code>
          </div>
          <p>用來查同一首歌的特定錄音版本、演出者與發行資料。</p>
          <div class="review-form__lookup-actions">
            <UiButton
              :icon="Copy"
              title="複製 MusicBrainz Recording MBID"
              aria-label="複製 MusicBrainz Recording MBID"
              @click="copyRecordingMbid"
            >
              複製 MBID
            </UiButton>
            <UiButton
              :icon="ExternalLink"
              title="在瀏覽器開啟這筆 MusicBrainz 錄音"
              aria-label="在瀏覽器開啟這筆 MusicBrainz 錄音"
              @click="openMusicBrainz"
            >
              開啟 MusicBrainz
            </UiButton>
          </div>
        </div>

        <div class="review-form__lookup-row">
          <div class="review-form__lookup-identity">
            <span>交叉搜尋文字</span>
            <code
              dir="auto"
              class="review-form__lookup-value review-form__selectable"
            >
              {{ lookupQuery }}
            </code>
          </div>
          <p>貼到音源平台或搜尋引擎，交叉確認同名曲、現場版與翻唱版。</p>
          <div class="review-form__lookup-actions">
            <UiButton
              :icon="Copy"
              title="複製歌手與歌名供外部查詢"
              aria-label="複製歌手與歌名供外部查詢"
              @click="copyLookupQuery"
            >
              複製歌手＋歌名
            </UiButton>
          </div>
        </div>
      </div>
      <p
        class="review-form__copy-feedback"
        :data-tone="copyState.tone"
        :role="copyState.tone === 'error' ? 'alert' : 'status'"
        aria-live="polite"
      >
        {{ copyState.message }}
      </p>
    </section>

    <div class="review-form__comparison">
      <section
        class="review-form__source"
        aria-labelledby="review-source-title"
      >
        <h3 id="review-source-title">候選資料（來源）</h3>
        <dl class="review-form__selectable">
          <div>
            <dt>歌名</dt>
            <dd dir="auto">{{ candidate.reference.title }}</dd>
          </div>
          <div>
            <dt>歌手</dt>
            <dd dir="auto">{{ candidate.reference.artist }}</dd>
          </div>
          <div>
            <dt>專輯</dt>
            <dd dir="auto">{{ candidate.reference.album || '—' }}</dd>
          </div>
          <div>
            <dt>時長</dt>
            <dd>{{ formatDuration(candidate.reference.durationSeconds) }}</dd>
          </div>
          <div>
            <dt>來源語言</dt>
            <dd>
              {{
                languageLabels[candidate.languageTag] || candidate.languageTag
              }}
            </dd>
          </div>
          <div>
            <dt>首次發行</dt>
            <dd>{{ candidate.reference.firstReleaseDate || '—' }}</dd>
          </div>
        </dl>
      </section>

      <section
        class="review-form__confirmation"
        aria-labelledby="review-confirmation-title"
      >
        <h3 id="review-confirmation-title">確認資料</h3>
        <UiTextField
          id="lyrics-review-title"
          label="歌名"
          :model-value="modelValue.title"
          :maxlength="256"
          required
          :invalid="approvalField === 'title'"
          :disabled="saving"
          @update:model-value="update('title', $event)"
        />
        <UiTextField
          id="lyrics-review-artist"
          label="歌手"
          :model-value="modelValue.artist"
          :maxlength="256"
          required
          :invalid="approvalField === 'artist'"
          :disabled="saving"
          @update:model-value="update('artist', $event)"
        />
        <UiTextField
          id="lyrics-review-album"
          label="專輯（選填）"
          :model-value="modelValue.album"
          :maxlength="256"
          :disabled="saving"
          @update:model-value="update('album', $event)"
        />
        <label class="review-form__field" for="lyrics-review-duration">
          <span>時長（秒）</span>
          <input
            id="lyrics-review-duration"
            type="number"
            min="1"
            max="86400"
            step="1"
            required
            :class="{
              'review-form__control--invalid':
                approvalField === 'durationSeconds',
            }"
            :aria-invalid="
              approvalField === 'durationSeconds' ? 'true' : undefined
            "
            :value="modelValue.durationSeconds"
            :disabled="saving"
            @input="update('durationSeconds', Number($event.target.value))"
          />
        </label>
        <label class="review-form__field" for="lyrics-review-language">
          <span>語言</span>
          <select
            id="lyrics-review-language"
            :class="{
              'review-form__control--invalid': approvalField === 'languageTag',
            }"
            :aria-invalid="approvalField === 'languageTag' ? 'true' : undefined"
            :value="modelValue.languageTag"
            :disabled="saving"
            @change="update('languageTag', $event.target.value)"
          >
            <option
              v-for="language in languageOptions"
              :key="language"
              :value="language"
            >
              {{ languageLabels[language] }}
            </option>
          </select>
        </label>
        <label class="review-form__field" for="lyrics-review-version">
          <span>版本</span>
          <select
            id="lyrics-review-version"
            :class="{
              'review-form__control--invalid': approvalField === 'version',
            }"
            :aria-invalid="approvalField === 'version' ? 'true' : undefined"
            :value="modelValue.version"
            :disabled="saving"
            @change="update('version', $event.target.value)"
          >
            <option
              v-for="option in versionOptions"
              :key="option[0]"
              :value="option[0]"
            >
              {{ option[1] }}
            </option>
          </select>
        </label>
        <label class="review-form__field" for="lyrics-review-era">
          <span>確認為 2010 年或之後發行</span>
          <select
            id="lyrics-review-era"
            class="review-form__era-control"
            :class="{
              'review-form__control--invalid': approvalField === 'eraTag',
            }"
            :aria-invalid="approvalField === 'eraTag' ? 'true' : undefined"
            :value="modelValue.eraTag || ''"
            :disabled="saving"
            @change="update('eraTag', $event.target.value || null)"
          >
            <option value="">請確認</option>
            <option value="recent-release">已確認為 2010 年或之後</option>
          </select>
        </label>
        <label class="review-form__checkbox">
          <input
            type="checkbox"
            :checked="modelValue.versionTrap"
            :disabled="saving"
            @change="update('versionTrap', $event.target.checked)"
          />
          <span>這筆是容易配錯的版本陷阱</span>
        </label>
      </section>
    </div>

    <details class="review-form__evidence">
      <summary>來源證據</summary>
      <dl class="review-form__selectable">
        <div>
          <dt>MBID</dt>
          <dd>{{ candidate.evidence.recordingMbid }}</dd>
        </div>
        <div>
          <dt>ListenBrainz 收聽數</dt>
          <dd>{{ candidate.evidence.listenCount }}</dd>
        </div>
        <div>
          <dt>ListenBrainz 使用者數</dt>
          <dd>{{ candidate.evidence.userCount }}</dd>
        </div>
        <div>
          <dt>候選日期</dt>
          <dd>{{ candidate.reference.firstReleaseDate || '—' }}</dd>
        </div>
      </dl>
    </details>

    <footer class="review-form__actions">
      <p
        v-if="approvalBlocker"
        id="lyrics-review-approval-blocker"
        class="review-form__approval-blocker"
        role="status"
        aria-live="polite"
      >
        {{ approvalBlocker }}
      </p>
      <label class="review-form__reject-reason" for="lyrics-review-rejection">
        <span>拒絕原因</span>
        <select
          id="lyrics-review-rejection"
          :value="rejectionReason"
          :disabled="saving"
          @change="emit('update:rejectionReason', $event.target.value)"
        >
          <option value="">請選擇</option>
          <option
            v-for="option in rejectionOptions"
            :key="option[0]"
            :value="option[0]"
          >
            {{ option[1] }}
          </option>
        </select>
      </label>
      <UiButton
        class="review-form__reject"
        :disabled="saving || !rejectionReason"
        @click="emit('reject')"
      >
        拒絕並下一首
        <span class="review-form__key">Ctrl+Backspace</span>
      </UiButton>
      <UiButton
        type="submit"
        variant="accent"
        :disabled="saving"
        :aria-describedby="
          approvalBlocker ? 'lyrics-review-approval-blocker' : undefined
        "
      >
        {{
          saving ? '儲存中…' : approvalField ? '前往未完成欄位' : '核准並下一首'
        }}
        <span class="review-form__key">Ctrl+Enter</span>
      </UiButton>
      <span class="review-form__save-note">每次決定會立即儲存</span>
    </footer>
  </form>
</template>

<style scoped>
.review-form {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  background: var(--ui-color-surface);
}

.review-form__header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  min-height: 4rem;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.review-form__header > div:first-child {
  min-width: 0;
}

.review-form__eyebrow {
  color: var(--ui-color-current);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.review-form__header h2 {
  margin: var(--ui-space-1) 0 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-form__header-status {
  flex: 0 0 auto;
  display: flex;
  gap: var(--ui-space-2);
}

.review-form__lookup {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface-raised);
}

.review-form__lookup-heading {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
}

.review-form .review-form__lookup-title {
  margin: 0;
  font-size: var(--ui-font-size-sm);
}

.review-form__lookup-heading > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.review-form__lookup-list {
  min-width: 0;
  display: grid;
}

.review-form__lookup-row {
  min-width: 0;
  display: grid;
  grid-template-columns:
    minmax(15rem, 1fr) minmax(16rem, 1.15fr)
    auto;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-1) 0;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.review-form__lookup-identity {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.review-form__lookup-identity > span {
  color: var(--ui-color-text-muted);
  font-size: 0.75rem;
  font-weight: var(--ui-font-weight-strong);
}

.review-form__lookup-value {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-form__lookup-row > p {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: 0.75rem;
  line-height: var(--ui-line-height-body);
}

.review-form__lookup-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

.review-form__copy-feedback {
  min-height: 1rem;
  margin: 0;
  color: var(--ui-color-success);
  font-size: 0.75rem;
  line-height: 1rem;
  text-align: end;
}

.review-form__copy-feedback[data-tone='error'] {
  color: var(--ui-color-danger);
}

.review-form__selectable {
  user-select: text;
}

.review-form__comparison {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.9fr) minmax(18rem, 1.1fr);
  overflow-y: auto;
}

.review-form__source,
.review-form__confirmation {
  min-width: 0;
  padding: var(--ui-space-4);
}

.review-form__source {
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
}

.review-form h3 {
  margin: 0 0 var(--ui-space-3);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
}

.review-form dl {
  display: grid;
  gap: 0;
  margin: 0;
}

.review-form dl > div {
  min-width: 0;
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.review-form dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.review-form dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.review-form__confirmation {
  display: grid;
  align-content: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-3);
}

.review-form__confirmation h3,
.review-form__confirmation > :nth-child(-n + 4) {
  grid-column: 1 / -1;
}

.review-form__field {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.review-form__field > span,
.review-form__reject-reason > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.review-form input[type='number'],
.review-form select {
  width: 100%;
  min-width: 0;
  min-height: var(--ui-control-height);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius);
  outline: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
}

.review-form input:focus-visible,
.review-form select:focus-visible,
.review-form summary:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.review-form .review-form__control--invalid {
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-danger);
}

.review-form__checkbox {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.review-form__checkbox input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--ui-color-accent);
}

.review-form__evidence {
  margin: 0 var(--ui-space-4) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.review-form__evidence summary {
  padding: var(--ui-space-2) var(--ui-space-3);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  cursor: pointer;
}

.review-form__evidence dl {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0 var(--ui-space-3) var(--ui-space-3);
}

.review-form__evidence dl > div {
  grid-template-columns: 1fr;
  gap: var(--ui-space-1);
}

.review-form__actions {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) auto auto auto;
  align-items: end;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
}

.review-form__reject-reason {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.review-form__approval-blocker {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ui-color-warning);
  font-size: 0.75rem;
  font-weight: var(--ui-font-weight-medium);
}

.review-form__reject.ui-btn {
  border: var(--ui-border-width) solid var(--ui-color-danger);
  color: var(--ui-color-danger);
}

.review-form__key,
.review-form__save-note {
  color: var(--ui-color-text-muted);
  font-size: 0.75rem;
  font-weight: var(--ui-font-weight-regular);
}

.review-form__save-note {
  align-self: center;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .review-form__lookup-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }

  .review-form__lookup-actions {
    justify-content: flex-start;
  }

  .review-form__copy-feedback {
    text-align: start;
  }

  .review-form__comparison {
    grid-template-columns: 1fr;
  }

  .review-form__source {
    border-inline-end: 0;
    border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  }

  .review-form__actions {
    grid-template-columns: 1fr 1fr;
  }

  .review-form__save-note {
    text-align: end;
  }
}
</style>
