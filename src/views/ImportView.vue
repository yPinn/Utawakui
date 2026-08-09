<script setup>
import { computed, onMounted, ref } from 'vue';
import { Download, FolderOpen, RotateCcw, X } from '@lucide/vue';
import UiButton from '../components/ui/UiButton.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';

const importInput = ref('');
const status = ref('');
const statusType = ref('idle'); // 'idle' | 'pending' | 'success' | 'error'
const downloadDir = ref('');
const isDefaultDir = ref(true);

// null when the input hasn't resolved to a playlist. Each entry:
// { id, title, artist, duration, alreadyDownloaded, selected, status, error }
const playlistTracks = ref(null);
const isResolving = ref(false);
const isImportingPlaylist = ref(false);
// Cooperative only — yt-dlp has no clean mid-download abort, so "cancel"
// means "stop before the next track," not "kill this one." Plain
// (non-reactive) var — only isImportingPlaylist drives the button state.
let cancelRequested = false;

onMounted(() => {
  refreshConfig();
});

// Tries playlist resolution first (cheap). null means "not a playlist,"
// not an error, and falls through to the single-video flow.
async function handleSubmit() {
  playlistTracks.value = null;
  status.value = '';
  statusType.value = 'idle';
  isResolving.value = true;
  try {
    const entries = await window.Utawakui.listPlaylist(importInput.value);
    if (entries && entries.length > 0) {
      playlistTracks.value = entries.map((entry) => ({
        ...entry,
        selected: !entry.alreadyDownloaded,
        status: 'pending', // 'pending' | 'downloading' | 'done' | 'error'
        error: null,
      }));
    } else {
      await downloadSingle();
    }
  } catch (err) {
    status.value = `error: ${err.message}`;
    statusType.value = 'error';
  } finally {
    isResolving.value = false;
  }
}

async function downloadSingle() {
  status.value = 'downloading…';
  statusType.value = 'pending';
  try {
    const result = await window.Utawakui.downloadAudio(importInput.value);
    status.value = `下載完成:${result.title || result.filePath}`;
    statusType.value = 'success';
  } catch (err) {
    status.value = `error: ${err.message}`;
    statusType.value = 'error';
  }
}

// "Fully selected" only counts tracks that aren't already downloaded —
// select-all shouldn't reach into already-downloaded rows, that stays an
// explicit per-row opt-in.
const allSelected = computed(
  () =>
    playlistTracks.value?.every((t) => t.alreadyDownloaded || t.selected) ??
    false,
);

function toggleSelectAll() {
  if (!playlistTracks.value) return;
  const next = !allSelected.value;
  for (const track of playlistTracks.value) {
    if (!track.alreadyDownloaded) track.selected = next;
  }
}

async function startPlaylistImport() {
  if (!playlistTracks.value) return;
  cancelRequested = false;
  isImportingPlaylist.value = true;
  try {
    for (const track of playlistTracks.value) {
      if (cancelRequested) break;
      if (!track.selected || track.alreadyDownloaded) continue;
      track.status = 'downloading';
      try {
        await window.Utawakui.downloadAudio(track.id);
        track.status = 'done';
      } catch (err) {
        track.status = 'error';
        track.error = err.message;
      }
    }
  } finally {
    isImportingPlaylist.value = false;
  }
}

function cancelPlaylistImport() {
  cancelRequested = true;
}

function togglePlaylistImport() {
  if (isImportingPlaylist.value) cancelPlaylistImport();
  else startPlaylistImport();
}

function dismissPlaylist() {
  playlistTracks.value = null;
}

async function refreshConfig() {
  const config = await window.Utawakui.getConfig();
  downloadDir.value = config.downloadDir;
  isDefaultDir.value = config.isDefault;
}

async function chooseDownloadDir() {
  await window.Utawakui.chooseDownloadDir();
  await refreshConfig();
}

async function resetDownloadDir() {
  await window.Utawakui.resetDownloadDir();
  await refreshConfig();
}
</script>

<template>
  <div>
    <UiPageHeader title="Import" />
    <section class="group">
      <h2 class="group__title">From YouTube</h2>
      <div class="group__row">
        <input
          v-model="importInput"
          class="group__input"
          placeholder="YouTube video/playlist ID or URL"
        />
        <UiButton
          :icon="Download"
          :disabled="isResolving"
          @click="handleSubmit"
        >
          {{ isResolving ? 'checking…' : 'import' }}
        </UiButton>
      </div>
      <p
        v-if="!playlistTracks"
        :class="`status status--${statusType}`"
        role="status"
      >
        {{ status }}
      </p>

      <div v-if="playlistTracks" class="playlist">
        <div class="playlist__header">
          <span class="playlist__count"
            >播放清單:{{ playlistTracks.length }} 首</span
          >
          <UiButton :disabled="isImportingPlaylist" @click="toggleSelectAll">
            {{ allSelected ? '全不選' : '全選' }}
          </UiButton>
          <UiButton
            :icon="X"
            :disabled="isImportingPlaylist"
            aria-label="關閉清單"
            @click="dismissPlaylist"
          />
        </div>

        <ul class="playlist__tracks">
          <UiTrackRow
            v-for="track in playlistTracks"
            :key="track.id"
            :track="track"
          >
            <template #lead>
              <input
                v-model="track.selected"
                type="checkbox"
                :disabled="isImportingPlaylist"
                :aria-label="track.title"
              />
            </template>
            <template #trail>
              <span
                class="track-status"
                :class="`track-status--${track.status}`"
              >
                <template v-if="track.alreadyDownloaded">已下載</template>
                <template v-else-if="track.status === 'downloading'"
                  >下載中…</template
                >
                <template v-else-if="track.status === 'done'">完成</template>
                <template v-else-if="track.status === 'error'">{{
                  track.error
                }}</template>
              </span>
            </template>
          </UiTrackRow>
        </ul>

        <UiButton
          class="playlist__action"
          variant="accent"
          @click="togglePlaylistImport"
        >
          {{ isImportingPlaylist ? '取消' : '開始匯入' }}
        </UiButton>
      </div>
    </section>
    <section class="group">
      <h2 class="group__title">Download location</h2>
      <p>
        download dir{{ isDefaultDir ? ' (default)' : '' }}: {{ downloadDir }}
      </p>
      <div class="group__row">
        <UiButton :icon="FolderOpen" @click="chooseDownloadDir"
          >choose folder</UiButton
        >
        <UiButton :icon="RotateCcw" @click="resetDownloadDir"
          >reset to default</UiButton
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
.group {
  margin-top: var(--ui-space-5);
  padding-top: var(--ui-space-4);
  border-top: 1px solid var(--ui-border);
}

.group:first-of-type {
  margin-top: var(--ui-space-4);
}

.group__title {
  margin: 0 0 var(--ui-space-3);
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-strong);
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Layout only — button/input appearance now lives in UiButton/.group__input,
   this just arranges them in a row that wraps on narrow widths. */
.group__row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin-bottom: var(--ui-space-2);
}

/* Scoped to this one text field, not `.group input` — that broader
   selector also matched the playlist checkboxes below, rendering each
   glyph centered in an invisible 320px box. */
.group__input {
  box-sizing: border-box;
  width: 320px;
  max-width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  background: var(--ui-surface);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
}

.group__input::placeholder {
  color: var(--ui-text-muted);
}

.status {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.status--success {
  color: var(--ui-text);
}

.status--error {
  color: var(--ui-danger);
  font-weight: var(--ui-font-weight-strong);
}

.playlist {
  margin-top: var(--ui-space-3);
  padding: var(--ui-space-3);
  background: var(--ui-surface);
  border-radius: var(--ui-radius);
}

.playlist__header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-2);
}

.playlist__count {
  flex: 1;
  font-size: var(--ui-text-sm);
  color: var(--ui-text);
}

.playlist__tracks {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.track-status {
  flex-shrink: 0;
  width: 8ch;
  text-align: right;
  font-size: var(--ui-text-sm);
  color: var(--ui-text-muted);
}

.track-status--error {
  color: var(--ui-danger);
}

.track-status--done {
  color: var(--ui-text);
}

.playlist__action {
  margin-top: var(--ui-space-2);
}
</style>
