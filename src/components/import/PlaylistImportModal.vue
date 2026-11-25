<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { notificationKey } from '../../constants/notificationKeys.js';
import { Ellipsis, FolderOpen } from '../../icons/index.js';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import { useAppView } from '../../composables/useAppView.js';
import { useImportSession } from '../../composables/useImportSession.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { platformVideoRequest } from '../../composables/usePlatformVideoPairing.js';
import { formatDuration } from '../../utils/format.js';
import { normalizeAppError } from '../../utils/appErrors.js';
import { playbackKindLabel } from '../../utils/importCandidateDisplay.js';
import { t } from '../../utils/i18n.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStack from '../ui/UiStack.vue';
import UiTextField from '../ui/UiTextField.vue';
const emit = defineEmits(['close', 'submitted']);
const { openSettings } = useAppView();
const { refresh } = usePlaylists();
const { notify } = useAppNotifications();
const { findReviewedPlaylistTrack, submitReviewedPlaylist } =
  useImportSession();
const account = shallowRef(null);
const spotify = shallowRef(null);
const spotifyLink = ref('');
const spotifyOneTime = ref(false);
const draft = shallowRef(null);
const review = shallowRef(null);
const moreAnchor = shallowRef(null);
const busy = ref('');
const error = ref('');
const entryId = ref('');
const name = ref('');
const selections = ref([]);
const remoteOptions = shallowRef({});
const findingIndex = ref(null);
const page = ref(0);
const pageSize = 30;
let closed = false;

const moreOptions = {
  kind: 'actions',
  groups: [
    {
      id: 'sources',
      items: [
        {
          kind: 'action',
          id: 'file',
          label: t('import.playlists.fileImport'),
          icon: FolderOpen,
        },
      ],
    },
  ],
};

const playlistOptions = computed(() =>
  (draft.value?.entries ?? []).map(({ id, name }) => ({
    value: id,
    label: name || t('import.playlists.untitled'),
  })),
);
const selectedCount = computed(() => selections.value.filter(Boolean).length);
const uniqueCount = computed(
  () => new Set(selections.value.filter(Boolean)).size,
);
const downloadSelected = computed(() =>
  selections.value.some(
    (id, index) =>
      id &&
      !review.value?.rows[index]?.candidates.some(
        (candidate) => candidate.id === id,
      ) &&
      remoteOptions.value[index]?.some((candidate) => candidate.id === id),
  ),
);
const pageCount = computed(() =>
  Math.ceil((review.value?.rows.length ?? 0) / pageSize),
);
const visibleRows = computed(
  () =>
    review.value?.rows.slice(
      page.value * pageSize,
      (page.value + 1) * pageSize,
    ) ?? [],
);
const canSave = computed(
  () =>
    !busy.value &&
    uniqueCount.value > 0 &&
    (!downloadSelected.value || uniqueCount.value <= 500) &&
    name.value.trim().length > 0,
);

onMounted(async () => {
  const [result, spotifyStatus] = await Promise.all([
    platformVideoRequest('getPlatformVideoAccount'),
    Promise.resolve(window.Utawakui.getSpotifyPlaylistImportStatus?.()).catch(
      () => null,
    ),
  ]);
  if (!closed && result.ok) account.value = result.value;
  if (!closed) spotify.value = spotifyStatus;
});

function clearDraft(id) {
  if (id) void window.Utawakui.clearPlaylistImport(id).catch(() => {});
}

onBeforeUnmount(() => {
  closed = true;
  if (busy.value === 'spotify-link') cancelSpotify();
  clearDraft(draft.value?.id);
});

function resetReview() {
  review.value = null;
  selections.value = [];
  remoteOptions.value = {};
  name.value = '';
  page.value = 0;
}

function showError(result) {
  if (!closed)
    error.value =
      result?.error?.message || t('errors.PLAYLIST_IMPORT_FAILED.message');
}

function cancelSpotify() {
  void window.Utawakui.cancelSpotifyPlaylistRead().catch(() => {});
}

function toggleMoreOptions(event) {
  moreAnchor.value = moreAnchor.value
    ? null
    : { kind: 'element', element: event.currentTarget };
}

async function start(source) {
  if (busy.value) return;
  busy.value = source === 'spotify-link' ? source : 'source';
  error.value = '';
  clearDraft(draft.value?.id);
  draft.value = null;
  entryId.value = '';
  resetReview();
  try {
    let result;
    if (source === 'spotify-link')
      result = await window.Utawakui.readSpotifyPlaylistLink(
        spotifyOneTime.value
          ? { link: spotifyLink.value.trim(), oneTime: true }
          : spotifyLink.value.trim(),
      );
    else if (source === 'youtube')
      result = await window.Utawakui.listYoutubeAccountPlaylists();
    else result = await window.Utawakui.chooseSpotifyPlaylistFile();
    if (result?.error?.code === 'PLATFORM_VIDEO_CANCELLED') return;
    if (!result?.ok) {
      if (result?.error?.code === 'PLAYLIST_IMPORT_SPOTIFY_RECONNECT') {
        spotify.value = { ...spotify.value, bound: false };
        spotifyOneTime.value = false;
      }
      return showError(result);
    }
    if (closed) return clearDraft(result.value?.id);
    if (!result.value) return;
    draft.value = { ...result.value, source };
  } catch {
    showError();
  } finally {
    busy.value = '';
  }
  if (playlistOptions.value.length === 1)
    await preview(playlistOptions.value[0].value);
}

async function preview(id) {
  if (busy.value || !draft.value) return;
  entryId.value = id;
  resetReview();
  error.value = '';
  busy.value = 'preview';
  try {
    const result = await window.Utawakui.previewPlaylistImport({
      id: draft.value.id,
      entryId: id,
    });
    if (!result?.ok) return showError(result);
    if (closed) return;
    review.value = result.value;
    selections.value = review.value.rows.map((row) => row.selected);
    if (draft.value.source !== 'youtube') {
      name.value =
        draft.value.entries.find((entry) => entry.id === id)?.name ?? '';
    }
  } catch {
    showError();
  } finally {
    busy.value = '';
  }
}

async function find(row) {
  if (busy.value || !review.value) return;
  busy.value = 'find';
  findingIndex.value = row.index;
  error.value = '';
  try {
    const result = await findReviewedPlaylistTrack({
      id: draft.value.id,
      token: review.value.token,
      index: row.index,
    });
    if (!result || closed) return;
    if (!result.ok) return showError(result);
    if (closed) return;
    remoteOptions.value = { ...remoteOptions.value, [row.index]: result.value };
  } catch (error) {
    showError({ error: normalizeAppError(error) });
  } finally {
    findingIndex.value = null;
    busy.value = '';
  }
}

function optionsFor(row) {
  const local = new Set(row.candidates.map(({ id }) => id));
  return [
    ...row.candidates,
    ...(remoteOptions.value[row.index] ?? []).filter(
      ({ id }) => !local.has(id),
    ),
  ];
}

function candidateOptions(row) {
  return [
    { value: '', label: t('import.playlists.skip') },
    ...optionsFor(row).map((track) => ({
      value: track.id,
      label: [
        track.title,
        track.artist,
        track.album,
        track.duration && formatDuration(track.duration),
        track.remote && playbackKindLabel(track.playbackKind),
      ]
        .filter(Boolean)
        .join(' · '),
    })),
  ];
}

function connectInSettings() {
  emit('close');
  openSettings('platform-accounts');
}

async function save() {
  if (!canSave.value) return;
  busy.value = 'save';
  error.value = '';
  try {
    const request = {
      id: draft.value.id,
      token: review.value.token,
      name: name.value.trim(),
      selections: [...selections.value],
    };
    if (downloadSelected.value) {
      const result = await submitReviewedPlaylist(request);
      if (!result) return;
      if (!result.ok) return showError(result);
      if (!closed) emit('submitted', result.value);
      return;
    }
    const result = await window.Utawakui.savePlaylistImport(request);
    if (!result?.ok) return showError(result);
    await refresh().catch(() => {});
    notify({
      key: notificationKey.playlists('import'),
      title: t('import.playlists.saved', { name: name.value.trim() }),
    });
    emit('close');
  } catch {
    showError();
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <UiModal
    open
    :title="t('import.playlists.title')"
    size="wide"
    max-block-size="medium"
    :close-disabled="busy === 'save'"
    @close="emit('close')"
  >
    <template #header-actions>
      <UiIconButton
        :icon="Ellipsis"
        :label="t('import.playlists.moreImportOptions')"
        :disabled="Boolean(busy)"
        aria-haspopup="menu"
        :aria-expanded="Boolean(moreAnchor)"
        @click="toggleMoreOptions"
      />
      <UiActionMenu
        :open="Boolean(moreAnchor)"
        :anchor="moreAnchor || undefined"
        :aria-label="t('import.playlists.moreImportOptions')"
        :content="moreOptions"
        size="sm"
        @close="moreAnchor = null"
        @select="start('spotify')"
      />
    </template>
    <div class="playlist-import">
      <form v-if="spotify?.configured" @submit.prevent="start('spotify-link')">
        <UiStack direction="column" :gap="2">
          <UiTextField
            id="playlist-import-spotify-link"
            v-model="spotifyLink"
            :label="t('import.playlists.spotifyLink')"
            :maxlength="2048"
            :disabled="Boolean(busy)"
            inputmode="url"
          />
          <UiCheckbox
            v-if="spotify.bound"
            id="playlist-import-spotify-other-account"
            v-model="spotifyOneTime"
            :label="t('import.playlists.spotifyOtherAccount')"
            :disabled="Boolean(busy)"
          />
          <UiStack align="center" :gap="2" wrap>
            <UiButton
              type="submit"
              variant="secondary"
              :disabled="Boolean(busy) || !spotifyLink.trim()"
              :loading="busy === 'spotify-link'"
              >{{ t('import.playlists.readSpotify') }}</UiButton
            >
            <UiButton v-if="busy === 'spotify-link'" @click="cancelSpotify">{{
              t('common.cancel')
            }}</UiButton>
            <UiButton
              v-else-if="!spotify.bound"
              variant="ghost"
              :disabled="Boolean(busy)"
              @click="connectInSettings"
            >
              {{ t('platformVideo.bindSpotify') }}
            </UiButton>
          </UiStack>
          <UiHint
            v-if="busy === 'spotify-link' && (!spotify.bound || spotifyOneTime)"
            role="status"
            >{{ t('import.playlists.spotifyAuthorize') }}</UiHint
          >
        </UiStack>
      </form>
      <UiHint v-else-if="spotify">{{
        t('errors.PLAYLIST_IMPORT_SPOTIFY_NOT_CONFIGURED.message')
      }}</UiHint>
      <UiStack
        v-if="
          account?.configured &&
          (account.channel || (account.secure && !account.needsReset))
        "
        align="center"
        :gap="2"
        wrap
      >
        <UiButton
          v-if="account.channel"
          :disabled="Boolean(busy)"
          @click="start('youtube')"
        >
          {{ t('import.playlists.readYoutube') }}
        </UiButton>
        <UiButton v-else :disabled="Boolean(busy)" @click="connectInSettings">
          {{ t('platformVideo.connectInSettings') }}
        </UiButton>
      </UiStack>
      <UiHint v-if="busy === 'source' || busy === 'preview'" role="status">
        {{ t('import.playlists.loading') }}
      </UiHint>
      <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
      <UiHint v-if="draft && !playlistOptions.length" role="status">
        {{ t('import.playlists.empty') }}
      </UiHint>
      <UiSelect
        v-if="playlistOptions.length"
        id="playlist-import-source"
        :label="
          t(
            draft.source === 'youtube'
              ? 'import.playlists.sourceYoutube'
              : 'import.playlists.sourceSpotify',
          )
        "
        :placeholder="t('import.playlists.chooseList')"
        :model-value="entryId"
        :options="playlistOptions"
        :disabled="Boolean(busy)"
        @update:model-value="preview"
      />
      <UiButton v-if="error && entryId && !busy" @click="preview(entryId)">
        {{ t('import.playlists.reviewAgain') }}
      </UiButton>
      <UiHint
        v-if="draft?.truncated || review?.truncated"
        tone="warning"
        role="status"
      >
        {{ t('import.playlists.truncated') }}
      </UiHint>
      <template v-if="review">
        <UiHint
          v-if="downloadSelected && uniqueCount > 500"
          tone="warning"
          role="status"
          >{{ t('import.execution.batchTooLarge') }}</UiHint
        >
        <UiTextField
          id="playlist-import-name"
          v-model="name"
          :label="t('import.playlists.name')"
          :maxlength="200"
          :disabled="busy === 'save'"
        />
        <UiHint role="status">
          {{
            t('import.playlists.summary', {
              added: uniqueCount,
              skipped: review.rows.length - selectedCount,
            })
          }}
          <template v-if="selectedCount > uniqueCount">
            {{
              t('import.playlists.duplicates', {
                count: selectedCount - uniqueCount,
              })
            }}
          </template>
        </UiHint>
        <ol
          v-if="visibleRows.length"
          class="playlist-import__rows"
          :start="page * pageSize + 1"
        >
          <li
            v-for="row in visibleRows"
            :key="row.index"
            class="playlist-import__row"
          >
            <div class="playlist-import__identity">
              {{ row.title || t('import.playlists.unknownTrack') }}
              <UiHint v-if="row.artist">{{ row.artist }}</UiHint>
            </div>
            <UiStack direction="column" :gap="1">
              <UiSelect
                v-if="optionsFor(row).length"
                :id="`playlist-import-track-${row.index}`"
                v-model="selections[row.index]"
                :label="t('import.playlists.matchFor', { title: row.title })"
                :options="candidateOptions(row)"
                :disabled="Boolean(busy)"
                label-hidden
              />
              <UiHint v-else>{{
                t(
                  row.unavailable
                    ? 'import.playlists.unavailable'
                    : remoteOptions[row.index]
                      ? 'import.playlists.noSources'
                      : 'import.playlists.missing',
                )
              }}</UiHint>
              <UiButton
                v-if="
                  review.canSearch &&
                  !row.unavailable &&
                  !selections[row.index] &&
                  !remoteOptions[row.index]?.length
                "
                :disabled="Boolean(busy)"
                :loading="findingIndex === row.index"
                @click="find(row)"
                >{{ t('import.playlists.findSource') }}</UiButton
              >
            </UiStack>
          </li>
        </ol>
        <UiStack v-if="pageCount > 1" align="center" :gap="2" wrap>
          <UiButton :disabled="!page" @click="page--">{{
            t('import.playlists.previous')
          }}</UiButton>
          <UiHint>{{
            t('import.playlists.page', { page: page + 1, total: pageCount })
          }}</UiHint>
          <UiButton :disabled="page + 1 === pageCount" @click="page++">{{
            t('import.playlists.next')
          }}</UiButton>
        </UiStack>
      </template>
    </div>
    <template v-if="review" #footer>
      <UiButton
        variant="accent"
        :disabled="!canSave"
        :loading="busy === 'save'"
        @click="save"
      >
        {{
          t(
            downloadSelected
              ? 'import.playlists.downloadAndSave'
              : 'playlist.sidebar.create',
          )
        }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.playlist-import,
.playlist-import__rows {
  display: grid;
  gap: var(--ui-space-3);
}

.playlist-import__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.playlist-import__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-2);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.playlist-import__identity {
  overflow-wrap: anywhere;
}
</style>
