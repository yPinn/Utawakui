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
import TrackStyleTagsPanel from './TrackStyleTagsPanel.vue';
import TrackContextActions from '../playback/context/TrackContextActions.vue';
import UiTabs from '../ui/UiTabs.vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import { RotateCcw } from '../../icons/index.js';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import WorkLinkSearch from './WorkLinkSearch.vue';
import WorkVersionFields from './WorkVersionFields.vue';
import WorkVersionTrackRow from './WorkVersionTrackRow.vue';
import { t } from '../../utils/i18n.js';

const songEditor = useSongEditor();
const editor = songEditor.work;
const metadata = songEditor.metadata;
const sourceActions = useTemplateRef('sourceActions');
const tabs = [
  { id: 'metadata', label: t('work.editor.tabs.metadata') },
  { id: 'organization', label: t('work.editor.tabs.organization') },
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
  { value: 'unknown', label: t('work.editor.relationship.unknown') },
  { value: 'original', label: t('work.editor.relationship.original') },
  { value: 'cover', label: t('work.editor.relationship.cover') },
];
const selectionLabel = computed(() => {
  if (state.selection.kind === 'none') return t('work.editor.unlinkPending');
  if (state.selection.kind === 'new')
    return t(
      state.selection.targetTrackId
        ? 'work.editor.pendingLinked'
        : 'work.editor.pending',
      { title: state.selection.title || t('work.editor.untitled') },
    );
  if (state.selection.kind === 'track')
    return t('work.editor.pending', {
      title:
        tracksById.value.get(state.selection.targetTrackId)?.title ||
        state.results.tracks.find(
          (track) => track.id === state.selection.targetTrackId,
        )?.title ||
        t('work.editor.selectedTrack'),
    });
  if (state.selection.kind === 'existing')
    return t('work.editor.pending', {
      title:
        state.results.works.find((work) => work.id === state.selection.workId)
          ?.title || t('work.editor.selectedSong'),
    });
  return state.snapshot?.work?.title || t('work.editor.notLinked');
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
onMounted(() => {
  editor.initialize();
  initializeLibrary();
});
onUnmounted(songEditor.dispose);
</script>

<template>
  <UiModal
    :open="songEditor.isOpen.value"
    :title="t('work.editor.title')"
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
          :aria-label="t('work.editor.label')"
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
            :title-error="metadata.state.titleError"
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
          >
            <template v-if="state.track" #style-tags>
              <UiDisclosure
                v-if="state.names && state.snapshot"
                :label="t('work.editor.presentationSettings')"
              >
                <div class="work-version-editor__name-fields">
                  <UiTextField
                    id="work-display-title"
                    :label="t('work.editor.displayTitle')"
                    :hint="t('work.editor.displayTitleHint')"
                    :model-value="state.names.displayTitle"
                    :maxlength="200"
                    :disabled="disabled"
                    @update:model-value="
                      editor.updateName('displayTitle', $event)
                    "
                  />
                  <UiCheckbox
                    v-if="hasWork && state.relationship === 'cover'"
                    id="work-inherit-title"
                    :label="t('work.editor.inheritTitle')"
                    :model-value="state.names.inheritTitle"
                    :disabled="disabled"
                    @update:model-value="
                      editor.updateName('inheritTitle', $event)
                    "
                  />
                  <UiTextarea
                    id="work-artist-credits"
                    :label="t('work.editor.artistCredits')"
                    :hint="t('work.editor.artistCreditsHint')"
                    :model-value="state.names.artistCredits"
                    :maxlength="3216"
                    :rows="2"
                    :disabled="disabled"
                    @update:model-value="
                      editor.updateName('artistCredits', $event)
                    "
                  />
                </div>
              </UiDisclosure>
              <TrackStyleTagsPanel
                :editor="songEditor.style"
                :disabled="songEditor.busy.value"
                @reload="songEditor.style.load(state.track.id)"
              />
            </template>
          </TrackMetadataFields>
        </section>
        <section
          v-show="songEditor.state.section === 'organization'"
          id="song-editor-organization-panel"
          role="tabpanel"
          aria-labelledby="song-editor-organization-tab"
          class="work-version-editor__organization"
        >
          <p v-if="state.loading" role="status">
            {{ t('work.editor.loading') }}
          </p>
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
                      :label="t('work.editor.relationshipLabel')"
                      :options="relationshipOptions"
                      :model-value="state.relationship"
                      :disabled="disabled"
                      @update:model-value="editor.setRelationship"
                    />
                  </template>
                </WorkVersionFields>
                <UiHint
                  v-if="state.titleSuggestion || state.pendingCoverSuggestion"
                >
                  {{ t('work.editor.titleSuggestion') }}
                </UiHint>
              </div>
              <div class="work-version-editor__link-pane">
                <section
                  ref="linkSection"
                  class="work-version-editor__section"
                  aria-labelledby="work-link-heading"
                >
                  <h3 id="work-link-heading" class="work-version-editor__title">
                    {{ t('work.editor.linkTracks') }}
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
                  <UiDisclosure
                    v-if="
                      state.names &&
                      state.snapshot.work &&
                      state.selection.kind === 'keep'
                    "
                    :label="t('work.editor.workNames')"
                  >
                    <div class="work-version-editor__name-fields">
                      <UiTextField
                        id="work-common-title"
                        :label="t('work.editor.workTitle')"
                        :model-value="state.names.workTitle"
                        :maxlength="200"
                        :disabled="disabled"
                        @update:model-value="
                          editor.updateName('workTitle', $event)
                        "
                      />
                      <UiTextarea
                        id="work-aliases"
                        :label="t('work.editor.workAliases')"
                        :hint="t('work.editor.workAliasesHint')"
                        :model-value="state.names.aliases"
                        :maxlength="3216"
                        :rows="2"
                        :disabled="disabled"
                        @update:model-value="
                          editor.updateName('aliases', $event)
                        "
                      />
                    </div>
                  </UiDisclosure>
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
                      :label="t('work.editor.undo')"
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
                    {{ t('work.editor.linkedVersions') }}
                  </h3>
                  <p v-if="!related.length" class="work-version-editor__hint">
                    {{ t('work.editor.noVersions') }}
                  </p>
                  <ul v-else class="work-version-editor__tracks">
                    <WorkVersionTrackRow
                      v-for="version in related"
                      :key="version.trackId"
                      :track="version.track"
                      :before-navigate="songEditor.close"
                      @play="playRelated"
                    />
                  </ul>
                  <UiButton
                    v-if="state.snapshot.hasMore"
                    variant="secondary"
                    :loading="state.loadingMore"
                    :loading-label="t('work.editor.loadingMore')"
                    :disabled="disabled"
                    @click="editor.loadMore"
                    >{{ t('work.editor.loadMore') }}</UiButton
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
        <div
          v-if="
            metadata.state.error ||
            state.error ||
            songEditor.state.partialMessage ||
            state.snapshot?.bindingStatus === 'changed'
          "
          class="work-version-editor__notices"
          :aria-label="t('work.editor.notices')"
        >
          <UiNotice
            v-if="metadata.state.error"
            compact
            tone="danger"
            :message="metadata.state.error"
          />
          <UiNotice
            v-if="state.error"
            compact
            tone="danger"
            :message="state.error"
            :action-label="t('work.editor.reload')"
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
            :message="t('work.editor.audioChanged')"
          />
        </div>
        <div class="work-version-editor__footer-row">
          <UiHint
            v-if="
              songEditor.state.section === 'metadata' &&
              !songEditor.canEditMetadata.value
            "
            class="work-version-editor__footer-hint"
            >{{ t('work.editor.sourceManaged') }}</UiHint
          >
          <div class="work-version-editor__actions">
            <UiButton
              variant="secondary"
              :disabled="songEditor.busy.value"
              @click="songEditor.close"
              >{{ t('work.editor.close') }}</UiButton
            >
            <UiButton
              v-if="state.snapshot?.bindingStatus === 'changed'"
              variant="accent"
              :disabled="disabled"
              :loading="songEditor.state.saving"
              :loading-label="t('work.editor.saving')"
              @click="songEditor.save({ reconfirm: true })"
              >{{ t('work.editor.confirmAndSave') }}</UiButton
            >
            <UiButton
              v-else
              variant="accent"
              :disabled="
                disabled ||
                (!songEditor.isDirty.value && !editor.hasSuggestions?.value)
              "
              :loading="songEditor.state.saving"
              :loading-label="t('work.editor.saving')"
              @click="songEditor.save"
              >{{ t('work.editor.save') }}</UiButton
            >
          </div>
        </div>
      </div>
    </template>
  </UiModal>
</template>

<style scoped>
.work-version-editor__name-fields {
  display: grid;
  gap: var(--ui-space-3);
}

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
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
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
  display: grid;
  gap: var(--ui-space-3);
  inline-size: 100%;
  min-inline-size: 0;
}
.work-version-editor__notices {
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.work-version-editor__footer-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
  min-inline-size: 0;
}
.work-version-editor__footer-hint {
  flex: 1 1 12rem;
  text-wrap: balance;
}
.work-version-editor__actions {
  justify-content: flex-end;
  margin-inline-start: auto;
}
</style>
