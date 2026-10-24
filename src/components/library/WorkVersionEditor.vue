<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  useTemplateRef,
} from 'vue';
import { useSongEditor } from '../../composables/useSongEditor.js';
import TrackMetadataFields from './TrackMetadataFields.vue';
import TrackContextActions from '../playback/context/TrackContextActions.vue';
import UiTabs from '../ui/UiTabs.vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import { RotateCcw } from '../../icons/index.js';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSelect from '../ui/UiSelect.vue';
import WorkLinkSearch from './WorkLinkSearch.vue';
import WorkVersionFields from './WorkVersionFields.vue';
import WorkVersionTrackRow from './WorkVersionTrackRow.vue';

const songEditor = useSongEditor();
const editor = songEditor.work;
const metadata = songEditor.metadata;
const sourceActions = useTemplateRef('sourceActions');
const tabs = [
  { id: 'metadata', label: '歌曲資訊' },
  { id: 'organization', label: '版本與連結' },
];
const { state } = editor;
const { tracksById, initialize: initializeLibrary } = useLibrary();
const { playTrack } = usePlayer();
const { enqueueTrack, setCurrentTrack } = usePlaybackQueue();
const linkSection = useTemplateRef('linkSection');
const disabled = computed(
  () => state.loading || songEditor.busy.value || state.needsReload,
);
const hasWork = computed(
  () =>
    state.selection.kind === 'existing' ||
    state.selection.kind === 'new' ||
    state.selection.kind === 'track' ||
    (state.selection.kind === 'keep' && Boolean(state.snapshot?.work)),
);
const relationshipOptions = [
  { value: 'unknown', label: '未設定' },
  { value: 'original', label: '原唱' },
  { value: 'cover', label: '翻唱' },
];
const selectionLabel = computed(() => {
  if (state.selection.kind === 'none') return '儲存後解除，保留版本資料。';
  if (state.selection.kind === 'new')
    return `${state.selection.title || '未命名'}（待儲存${state.selection.targetTrackId ? '，連結兩首' : ''}）`;
  if (state.selection.kind === 'track')
    return `${tracksById.value.get(state.selection.targetTrackId)?.title || state.results.tracks.find((track) => track.id === state.selection.targetTrackId)?.title || '已選曲目'}（待儲存）`;
  if (state.selection.kind === 'existing')
    return `${state.results.works.find((work) => work.id === state.selection.workId)?.title || '已選擇歌曲'}（待儲存）`;
  return state.snapshot?.work?.title || '尚未連結歌曲';
});
const related = computed(() =>
  (state.snapshot?.relatedVersions || []).flatMap((version) => {
    const track = tracksById.value.get(version.trackId);
    return track ? [{ ...version, track }] : [];
  }),
);
const searchResults = computed(() => ({
  tracks: state.results.tracks
    .filter(
      (track) =>
        state.selection.kind !== 'keep' ||
        !state.snapshot?.work ||
        track.workId !== state.snapshot.work.id,
    )
    .map((track) => ({
      ...track,
      thumbnailUrl:
        tracksById.value.get(track.id)?.thumbnailUrl || track.thumbnailUrl,
    })),
}));

async function select(selection) {
  songEditor.setSection('organization');
  editor.select(selection);
  await nextTick();
  (
    linkSection.value?.querySelector?.('[data-work-undo]') ||
    linkSection.value?.querySelector?.('input')
  )?.focus();
}
function playRelated(track) {
  enqueueTrack(track);
  setCurrentTrack(track.id);
  playTrack(toPlayableTrack(track));
}
function relatedLabel(version) {
  const dimensions = {
    acoustic: 'Acoustic',
    remix: 'Remix',
    other: '其他編曲',
    studio: '錄音室',
    live: '現場',
    demo: 'Demo',
    instrumental: '純伴奏',
  };
  const labels = version.versionInfo?.label
    ? [version.versionInfo.label]
    : [
        dimensions[version.versionInfo?.arrangement],
        dimensions[version.versionInfo?.performance],
        version.versionInfo?.vocal === 'instrumental'
          ? dimensions.instrumental
          : '',
      ].filter(Boolean);
  if (
    version.relationship === 'cover' &&
    !labels.some((label) => label.includes('翻唱'))
  )
    labels.push('翻唱');
  return labels.join(' · ');
}
onMounted(() => {
  editor.initialize();
  initializeLibrary();
});
onUnmounted(songEditor.dispose);
</script>

<template>
  <UiModal
    :open="songEditor.isOpen.value"
    title="整理歌曲"
    size="wide"
    max-block-size="large"
    body-mode="workspace"
    :close-disabled="songEditor.busy.value"
    @close="songEditor.close"
  >
    <template #default>
      <UiScrollLayout
        class="work-version-editor"
        content-class="work-version-editor__content"
      >
        <ul v-if="state.track" class="work-version-editor__tracks">
          <TrackIdentityRow
            :track="state.track"
            overflow="ellipsis"
            @contextmenu.prevent.stop="sourceActions?.open($event)"
          >
            <template #trail
              ><TrackContextActions
                ref="sourceActions"
                :track="state.track"
                context="editor"
                trigger="inline"
                :can-unlink-work="
                  Boolean(state.snapshot?.work) &&
                  state.selection.kind === 'keep' &&
                  !disabled
                "
                :before-navigate="songEditor.close"
                @unlink-work="select({ kind: 'none' })"
            /></template>
          </TrackIdentityRow>
        </ul>
        <UiTabs
          :items="tabs"
          :active-id="songEditor.state.section"
          aria-label="歌曲整理"
          tab-id-prefix="song-editor"
          panel-id-prefix="song-editor"
          variant="bar"
          @update:active-id="songEditor.setSection"
        />
        <section
          v-show="songEditor.state.section === 'metadata'"
          id="song-editor-metadata-panel"
          role="tabpanel"
          aria-labelledby="song-editor-metadata-tab"
        >
          <TrackMetadataFields
            :open="songEditor.state.section === 'metadata'"
            :read-only="!songEditor.canEditMetadata.value"
            :title="
              metadata.state.track
                ? metadata.state.titleDraft
                : state.track?.title || ''
            "
            :artist="metadata.state.artistDraft"
            :thumbnail-url="metadata.state.artworkPreviewUrl"
            :artwork-changed="metadata.isArtworkDirty.value"
            :saving="songEditor.state.saving"
            :artwork-preparing="metadata.state.isArtworkPreparing"
            :artwork-searching="metadata.state.isArtworkSearching"
            :artwork-search-open="metadata.state.artworkSearchOpen"
            :artwork-search-completed="metadata.state.artworkSearchCompleted"
            :artwork-query="metadata.state.artworkQuery"
            :artwork-candidates="metadata.state.artworkCandidates"
            :selected-artwork-candidate-id="
              metadata.state.selectedArtworkCandidateId
            "
            :error="
              metadata.state.error === '歌名必填' ? metadata.state.error : ''
            "
            @save="songEditor.save"
            @choose-thumbnail="metadata.chooseThumbnail"
            @clear-thumbnail="metadata.clearThumbnail"
            @open-artwork-search="metadata.openArtworkSearch"
            @close-artwork-search="metadata.closeArtworkSearch"
            @update-artwork-query="metadata.setArtworkQueryField"
            @search-artwork="metadata.searchArtwork"
            @select-artwork-candidate="metadata.selectArtworkCandidate"
            @update-title="metadata.setTitleDraft"
            @update-artist="metadata.setArtistDraft"
          />
        </section>
        <section
          v-show="songEditor.state.section === 'organization'"
          id="song-editor-organization-panel"
          role="tabpanel"
          aria-labelledby="song-editor-organization-tab"
          class="work-version-editor__organization"
        >
          <p v-if="state.loading" role="status">讀取中…</p>
          <template v-if="state.snapshot">
            <div class="work-version-editor__layout">
              <div class="work-version-editor__version-pane">
                <WorkVersionFields
                  :version-info="state.versionInfo"
                  :disabled="disabled"
                  @update="editor.updateVersion"
                >
                  <template #relationship>
                    <UiSelect
                      v-if="hasWork"
                      id="work-relationship"
                      label="演唱類別"
                      :options="relationshipOptions"
                      :model-value="state.relationship"
                      :disabled="disabled"
                      @update:model-value="editor.setRelationship"
                    />
                  </template>
                </WorkVersionFields>
              </div>
              <div class="work-version-editor__link-pane">
                <section
                  ref="linkSection"
                  class="work-version-editor__section"
                  aria-labelledby="work-link-heading"
                >
                  <h3 id="work-link-heading" class="work-version-editor__title">
                    連結曲目
                  </h3>
                  <WorkLinkSearch
                    :key="state.track.id"
                    :query="state.query"
                    :results="searchResults"
                    :searching="state.searching"
                    :searched="state.searched"
                    :selected-track-id="
                      state.selection.kind === 'track'
                        ? state.selection.targetTrackId
                        : ''
                    "
                    :disabled="disabled"
                    :error="state.searchError"
                    @query="editor.updateQuery"
                    @search="editor.search"
                    @select="select"
                  />
                  <div
                    v-if="state.selection.kind !== 'keep'"
                    class="work-version-editor__pending"
                  >
                    <p class="work-version-editor__selection" role="status">
                      {{ selectionLabel }}
                    </p>
                    <UiIconButton
                      data-work-undo
                      :icon="RotateCcw"
                      label="復原變更"
                      :disabled="disabled"
                      @click="select({ kind: 'keep' })"
                    />
                  </div>
                </section>
                <section
                  v-if="state.snapshot.work && state.selection.kind === 'keep'"
                  class="work-version-editor__section work-version-editor__related"
                  aria-labelledby="work-related-heading"
                >
                  <h3
                    id="work-related-heading"
                    class="work-version-editor__title"
                  >
                    已連結版本
                  </h3>
                  <p v-if="!related.length" class="work-version-editor__hint">
                    尚無其他版本。
                  </p>
                  <ul v-else class="work-version-editor__tracks">
                    <WorkVersionTrackRow
                      v-for="version in related"
                      :key="version.trackId"
                      :track="version.track"
                      :version-label="relatedLabel(version)"
                      :before-navigate="songEditor.close"
                      @play="playRelated"
                    />
                  </ul>
                  <UiButton
                    v-if="state.snapshot.hasMore"
                    variant="secondary"
                    :loading="state.loadingMore"
                    loading-label="載入中"
                    :disabled="disabled"
                    @click="editor.loadMore"
                    >載入更多</UiButton
                  >
                </section>
              </div>
            </div>
          </template>
        </section>
      </UiScrollLayout>
    </template>
    <template #footer>
      <div class="work-version-editor__footer">
        <div class="work-version-editor__notices" aria-label="歌曲整理提示">
          <UiNotice
            v-if="metadata.state.error && metadata.state.error !== '歌名必填'"
            compact
            tone="danger"
            :message="metadata.state.error"
          />
          <UiNotice
            v-if="state.error"
            compact
            tone="danger"
            :message="state.error"
            action-label="重新載入"
            :action-disabled="songEditor.busy.value || state.loading"
            @action="editor.reload"
          />
          <UiNotice
            v-if="songEditor.state.partialMessage"
            compact
            tone="warning"
            :message="songEditor.state.partialMessage"
          />
          <UiNotice
            v-if="state.snapshot?.bindingStatus === 'changed'"
            compact
            tone="warning"
            message="音源已變更，請確認版本資料。"
          />
          <UiNotice
            v-if="
              songEditor.state.section === 'metadata' &&
              !songEditor.canEditMetadata.value
            "
            compact
            tone="info"
            message="歌曲資訊由來源管理。版本與連結仍可編輯。"
          />
        </div>
        <div class="work-version-editor__actions">
          <UiButton
            variant="secondary"
            :disabled="songEditor.busy.value"
            @click="songEditor.close"
            >關閉</UiButton
          >
          <UiButton
            v-if="state.snapshot?.bindingStatus === 'changed'"
            variant="accent"
            :disabled="disabled"
            :loading="songEditor.state.saving"
            loading-label="儲存中"
            @click="songEditor.save({ reconfirm: true })"
            >確認音源並儲存</UiButton
          >
          <UiButton
            v-else
            variant="accent"
            :disabled="songEditor.busy.value || !songEditor.isDirty.value"
            :loading="songEditor.state.saving"
            loading-label="儲存中"
            @click="songEditor.save"
            >儲存</UiButton
          >
        </div>
      </div>
    </template>
  </UiModal>
</template>

<style scoped>
.work-version-editor {
  min-block-size: 0;
  container: work-version-editor / inline-size;
}
.work-version-editor__organization,
.work-version-editor__layout,
.work-version-editor__version-pane,
.work-version-editor__link-pane {
  display: grid;
  align-items: start;
  gap: var(--ui-space-5);
  min-inline-size: 0;
}
@container work-version-editor (min-width: 40rem) {
  .work-version-editor__layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    column-gap: var(--ui-space-6);
  }
}
.work-version-editor :deep(.work-version-editor__content) {
  display: grid;
  gap: var(--ui-space-5);
  padding: var(--ui-space-1);
}
.work-version-editor__section {
  display: grid;
  gap: var(--ui-space-3);
  min-inline-size: 0;
}
.work-version-editor__link-pane > .work-version-editor__related {
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.work-version-editor__title {
  margin: 0;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.work-version-editor__selection {
  margin: 0;
  overflow-wrap: anywhere;
}
.work-version-editor__tracks {
  list-style: none;
  padding: 0;
  margin: 0;
}
.work-version-editor__hint {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
.work-version-editor__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.work-version-editor__pending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.work-version-editor__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  inline-size: 100%;
  min-inline-size: 0;
}
.work-version-editor__notices {
  flex: 1 1 18rem;
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.work-version-editor__actions {
  margin-inline-start: auto;
}
</style>
