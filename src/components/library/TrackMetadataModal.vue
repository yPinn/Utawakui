<script setup>
import { computed } from 'vue';
import { ExternalLink, ImagePlus, Search, Trash2 } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  artist: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  artworkSaving: { type: Boolean, default: false },
  artworkSearching: { type: Boolean, default: false },
  artworkSearchOpen: { type: Boolean, default: false },
  artworkSearchCompleted: { type: Boolean, default: false },
  artworkQuery: {
    type: Object,
    default: () => ({ title: '', artist: '', album: '' }),
  },
  artworkCandidates: { type: Array, default: () => [] },
  selectedArtworkCandidateId: { type: String, default: null },
  error: { type: String, default: '' },
});

const emit = defineEmits([
  'close',
  'save',
  'chooseThumbnail',
  'clearThumbnail',
  'openArtworkSearch',
  'closeArtworkSearch',
  'updateArtworkQuery',
  'searchArtwork',
  'selectArtworkCandidate',
  'applyArtwork',
  'openArtworkSource',
  'updateTitle',
  'updateArtist',
]);

const previewTrack = computed(() => ({
  title: props.title,
  artist: props.artist,
  thumbnailUrl: props.thumbnailUrl,
}));

const REASON_LABELS = Object.freeze({
  'title-exact': '歌名完全一致',
  'title-contains': '歌名部分一致',
  'title-token-overlap': '歌名有共同詞彙',
  'artist-exact': '演唱者完全一致',
  'artist-contains': '演唱者部分一致',
  'artist-token-overlap': '演唱者有共同詞彙',
  'album-exact': '專輯完全一致',
  'album-contains': '專輯部分一致',
  'duration-known': '可比較曲長',
  'duration-conflict': '曲長差距較大',
  'isrc-exact': 'ISRC 一致',
  'isrc-conflict': 'ISRC 衝突',
  'version-conflict': '版本提示可能不同',
  'official-release': '正式發行',
  'pseudo-release': '翻譯或轉寫發行',
  bootleg: '非正式發行',
  promotion: '宣傳發行',
  compilation: '合輯',
  'live-release': '現場發行',
  'remix-release': '混音發行',
  'year-close': '發行年份一致',
  'year-near': '發行年份接近',
  'year-conflict': '發行年份差距較大',
  'front-available': '有正面封面',
});

function confidenceLabel(confidence) {
  if (confidence === 'high') return '高信心';
  if (confidence === 'medium') return '中信心';
  return '低信心';
}

function confidenceTone(confidence) {
  if (confidence === 'high') return 'success';
  if (confidence === 'medium') return 'warning';
  return 'muted';
}

function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

function matchKindLabel(kind) {
  return (
    {
      original: '原始文字',
      'catalog-alias': 'Catalog 別名',
      'script-normalized': '跨文字正規化',
      romanization: '羅馬字查詢',
      fuzzy: '模糊查詢',
    }[kind] || '原始文字'
  );
}

function candidateTrack(candidate) {
  return {
    title: candidate.releaseTitle,
    artist: candidate.artistCredit,
    thumbnailUrl: candidate.previewUrl,
  };
}

function candidateReleaseMeta(candidate) {
  return [
    candidate.firstReleaseYear,
    candidate.primaryType,
    ...(candidate.secondaryTypes || []),
    candidate.country,
    candidate.status,
  ]
    .filter(Boolean)
    .join(' · ');
}
</script>

<template>
  <UiModal
    :open="open"
    title="編輯資訊"
    :size="artworkSearchOpen ? 'wide' : 'default'"
    @close="emit('close')"
  >
    <div class="track-metadata">
      <section class="track-metadata__artwork" aria-labelledby="track-artwork">
        <UiTrackThumb
          class="track-metadata__thumb"
          :track="previewTrack"
          size="var(--ui-space-8)"
          :decorative="false"
          aria-label="目前封面"
        />
        <div class="track-metadata__artwork-body">
          <div>
            <h3 id="track-artwork" class="track-metadata__artwork-title">
              封面
            </h3>
          </div>
          <div class="track-metadata__artwork-actions">
            <UiButton
              :icon="ImagePlus"
              :disabled="saving || artworkSaving"
              aria-label="選擇封面圖片"
              title="選擇封面圖片"
              @click="emit('chooseThumbnail')"
            >
              選擇圖片
            </UiButton>
            <UiButton
              :icon="Search"
              :disabled="saving || artworkSaving || artworkSearching"
              aria-label="線上搜尋封面"
              title="從 MusicBrainz 與 Cover Art Archive 搜尋封面"
              @click="emit('openArtworkSearch')"
            >
              線上搜尋
            </UiButton>
            <UiButton
              v-if="thumbnailUrl"
              :icon="Trash2"
              :disabled="saving || artworkSaving"
              aria-label="移除封面圖片"
              title="移除封面圖片"
              @click="emit('clearThumbnail')"
            >
              移除
            </UiButton>
          </div>
        </div>
      </section>

      <section
        v-if="artworkSearchOpen"
        class="track-metadata__artwork-search"
        aria-labelledby="track-artwork-search-heading"
      >
        <div class="track-metadata__search-heading">
          <div>
            <h3
              id="track-artwork-search-heading"
              class="track-metadata__artwork-title"
            >
              線上搜尋封面
            </h3>
            <p class="track-metadata__search-description">
              搜尋文字只影響本次搜尋，不會修改曲庫資訊。所有結果都需要手動確認後才會套用。
            </p>
          </div>
          <UiButton
            :disabled="artworkSearching || artworkSaving"
            @click="emit('closeArtworkSearch')"
          >
            收合
          </UiButton>
        </div>

        <div class="track-metadata__query-grid">
          <label class="track-metadata__field">
            <span class="track-metadata__label">歌曲名稱</span>
            <input
              :value="artworkQuery.title"
              class="track-metadata__input"
              aria-label="封面搜尋歌曲名稱"
              maxlength="200"
              required
              @input="emit('updateArtworkQuery', 'title', $event.target.value)"
              @keydown.enter.prevent="emit('searchArtwork')"
            />
          </label>
          <label class="track-metadata__field">
            <span class="track-metadata__label">演唱者</span>
            <input
              :value="artworkQuery.artist"
              class="track-metadata__input"
              aria-label="封面搜尋演唱者"
              maxlength="200"
              @input="emit('updateArtworkQuery', 'artist', $event.target.value)"
              @keydown.enter.prevent="emit('searchArtwork')"
            />
          </label>
          <label class="track-metadata__field">
            <span class="track-metadata__label">專輯（選填）</span>
            <input
              :value="artworkQuery.album"
              class="track-metadata__input"
              aria-label="封面搜尋專輯"
              maxlength="200"
              @input="emit('updateArtworkQuery', 'album', $event.target.value)"
              @keydown.enter.prevent="emit('searchArtwork')"
            />
          </label>
        </div>

        <div class="track-metadata__search-actions">
          <UiButton
            variant="accent"
            :icon="Search"
            :loading="artworkSearching"
            loading-label="搜尋中"
            :disabled="
              saving ||
              artworkSaving ||
              !String(artworkQuery.title || '').trim()
            "
            @click="emit('searchArtwork')"
          >
            搜尋 MusicBrainz
          </UiButton>
        </div>

        <div
          v-if="artworkCandidates.length > 0"
          class="track-metadata__candidate-grid"
          role="radiogroup"
          aria-label="線上封面候選"
        >
          <article
            v-for="candidate in artworkCandidates"
            :key="candidate.id"
            class="track-metadata__candidate"
            :class="{
              'is-selected': selectedArtworkCandidateId === candidate.id,
            }"
          >
            <button
              type="button"
              class="track-metadata__candidate-select"
              role="radio"
              :aria-checked="selectedArtworkCandidateId === candidate.id"
              :disabled="artworkSearching || artworkSaving"
              @click="emit('selectArtworkCandidate', candidate.id)"
            >
              <UiTrackThumb
                class="track-metadata__candidate-thumb"
                :track="candidateTrack(candidate)"
                size="var(--ui-track-artwork-size-preview)"
                :decorative="false"
                :aria-label="`${candidate.releaseTitle || '未知發行'}封面`"
              />
              <span class="track-metadata__candidate-copy">
                <span class="track-metadata__candidate-title">
                  {{ candidate.releaseTitle || '未知發行' }}
                </span>
                <span class="track-metadata__candidate-artist">
                  {{ candidate.artistCredit || '未知演唱者' }}
                </span>
                <span class="track-metadata__candidate-meta">
                  {{ candidateReleaseMeta(candidate) || '發行資訊未提供' }}
                </span>
              </span>
            </button>

            <div class="track-metadata__candidate-badges">
              <UiChip :tone="confidenceTone(candidate.confidence)">
                {{ confidenceLabel(candidate.confidence) }}
              </UiChip>
              <UiChip v-if="candidate.recommended" tone="accent">
                建議候選
              </UiChip>
              <UiChip tone="muted">
                {{ matchKindLabel(candidate.matchKind) }}
              </UiChip>
            </div>

            <ul class="track-metadata__candidate-reasons">
              <li v-for="reason in candidate.reasons" :key="reason">
                {{ reasonLabel(reason) }}
              </li>
            </ul>

            <UiButton
              :icon="ExternalLink"
              :disabled="artworkSearching || artworkSaving"
              @click="emit('openArtworkSource', candidate.id)"
            >
              查看 MusicBrainz
            </UiButton>
          </article>
        </div>

        <p
          v-else-if="artworkSearchCompleted && !artworkSearching"
          class="track-metadata__search-empty"
        >
          找不到有正面封面的候選。可以調整歌曲名稱、演唱者或專輯後再試一次。
        </p>

        <div
          v-if="artworkCandidates.length > 0"
          class="track-metadata__search-actions"
        >
          <UiButton
            variant="accent"
            :disabled="
              saving ||
              artworkSaving ||
              artworkSearching ||
              !selectedArtworkCandidateId
            "
            :loading="artworkSaving"
            loading-label="套用中"
            @click="emit('applyArtwork')"
          >
            套用所選封面
          </UiButton>
        </div>
      </section>

      <label class="track-metadata__field">
        <span class="track-metadata__label">歌名</span>
        <input
          :value="title"
          class="track-metadata__input"
          maxlength="200"
          required
          @input="emit('updateTitle', $event.target.value)"
          @keydown.enter="emit('save')"
        />
      </label>

      <label class="track-metadata__field">
        <span class="track-metadata__label">歌手</span>
        <input
          :value="artist"
          class="track-metadata__input"
          maxlength="200"
          @input="emit('updateArtist', $event.target.value)"
          @keydown.enter="emit('save')"
        />
      </label>

      <UiNotice
        v-if="error"
        tone="danger"
        :title="artworkSearchOpen ? '封面搜尋未完成' : '曲目資訊未更新'"
        :message="error"
        compact
      />

      <div class="track-metadata__actions">
        <UiButton
          variant="accent"
          :disabled="saving || artworkSaving || artworkSearching"
          @click="emit('save')"
        >
          儲存
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.track-metadata {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.track-metadata__field {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.track-metadata__artwork {
  display: grid;
  grid-template-columns: var(--ui-space-8) minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: start;
  padding-bottom: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.track-metadata__thumb {
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.track-metadata__artwork-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.track-metadata__artwork-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-label);
}

.track-metadata__artwork-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.track-metadata__artwork-search {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  background: var(--ui-color-canvas);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
}

.track-metadata__search-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.track-metadata__search-description,
.track-metadata__search-empty {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.track-metadata__query-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-2);
}

.track-metadata__search-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

.track-metadata__candidate-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-2);
}

.track-metadata__candidate {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.track-metadata__candidate.is-selected {
  border-color: var(--ui-color-accent);
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-accent);
}

.track-metadata__candidate-select {
  display: grid;
  grid-template-columns: var(--ui-track-artwork-size-preview) minmax(0, 1fr);
  gap: var(--ui-space-2);
  align-items: start;
  width: 100%;
  padding: 0;
  background: transparent;
  color: inherit;
  border: 0;
  text-align: left;
  cursor: pointer;
}

.track-metadata__candidate-select:disabled {
  cursor: default;
}

.track-metadata__candidate-select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.track-metadata__candidate-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.track-metadata__candidate-title,
.track-metadata__candidate-artist,
.track-metadata__candidate-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-metadata__candidate-title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-label);
}

.track-metadata__candidate-artist,
.track-metadata__candidate-meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.track-metadata__candidate-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.track-metadata__candidate-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-3);
  margin: 0;
  padding-left: var(--ui-space-4);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

@media (max-width: 760px) {
  .track-metadata__query-grid,
  .track-metadata__candidate-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.track-metadata__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.track-metadata__input {
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
  border: none;
  border-radius: var(--ui-radius);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.track-metadata__input:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.track-metadata__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
