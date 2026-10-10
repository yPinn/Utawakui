<script setup>
import { computed, shallowRef, useId } from 'vue';
import AppFolderContentField from '../layout/AppFolderContentField.vue';
import AppFolderLayout from '../layout/AppFolderLayout.vue';
import AppFolderPage from '../layout/AppFolderPage.vue';
import SetlistAlbumSupportingContent from '../playlists/SetlistAlbumSupportingContent.vue';
import SetlistCollectionHeader from '../playlists/SetlistCollectionHeader.vue';
import SetlistPlaylistTable from '../playlists/SetlistPlaylistTable.vue';
import UiButton from '../ui/UiButton.vue';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiFolderArtifactCanvas from '../ui/UiFolderArtifactCanvas.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const previewMode = shallowRef('wide');
const contentMode = shallowRef('overflow');
const activeFolderId = shallowRef('setlist');
const demoSearchQuery = shallowRef('');
const demoSort = shallowRef({ key: null, direction: 'asc' });
const demoCollectionPlaying = shallowRef(false);
const demoCollectionShuffle = shallowRef(false);
const demoSupportingAlbumPlayingId = shallowRef('');
const emptyTrackIds = new Set();
const instanceId = useId();
const specimenTitleId = `demo-page-layout-specimen-title-${instanceId}`;
const overviewTitleId = `demo-page-layout-overview-title-${instanceId}`;
const materialsTitleId = `demo-page-layout-materials-title-${instanceId}`;
const nextTitleId = `demo-page-layout-next-title-${instanceId}`;
const notesTitleId = `demo-page-layout-notes-title-${instanceId}`;
const previewModes = [
  { id: 'wide', label: '寬版' },
  { id: 'narrow', label: '窄版' },
];
const contentModes = [
  { id: 'short', label: '短內容' },
  { id: 'overflow', label: '長內容' },
];
const folderDefinitions = [
  {
    id: 'setlist',
    label: 'Setlist',
    title: '夏季 Cover 工作集',
    description: '整理曲目、素材與輸出狀態。',
    action: '新增素材',
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    title: '同步歌詞工作區',
    description: '確認歌詞、時間軸與演出提示。',
    action: '匯入歌詞',
  },
  {
    id: 'output',
    label: 'Output',
    title: '直播輸出工作區',
    description: '檢查版型與公開輸出狀態。',
    action: '新增版型',
  },
  {
    id: 'import',
    label: 'Import',
    title: '素材匯入工作區',
    description: '加入本機素材並確認必要資訊。',
    action: '選擇檔案',
  },
];
const materialRows = [
  { name: '主唱錄音', detail: 'WAV · 48 kHz', state: '已整理' },
  { name: '伴奏版本', detail: 'Instrumental', state: '待確認' },
  { name: '同步歌詞', detail: 'LRC · 繁體中文', state: '已完成' },
  { name: '封面影像', detail: 'PNG · 3000 × 3000', state: '需補充' },
];
const demoAlbums = [
  {
    id: 'demo-album-current',
    name: '夏季 Cover 工作集',
    coverUrl: '',
    tracks: [
      {
        id: 'demo-track-current-1',
        title: '目不轉睛',
        artist: '王以太',
        duration: 221,
      },
      {
        id: 'demo-track-current-2',
        title: '危險派對',
        artist: '王以太',
        duration: 198,
      },
      {
        id: 'demo-track-current-3',
        title: '別怕變老',
        artist: '王以太',
        duration: 246,
      },
      {
        id: 'demo-track-current-4',
        title: '人間天堂',
        artist: '王以太',
        duration: 205,
      },
      {
        id: 'demo-track-current-5',
        title: '山羊',
        artist: '王以太',
        duration: 149,
      },
      {
        id: 'demo-track-current-6',
        title: 'Feel Alive',
        artist: '王以太',
        duration: 329,
      },
    ],
    releaseYear: 2024,
    trackCount: 12,
    durationLabel: '29 分',
    description: '本機曲庫中的專輯資料與演出準備內容。',
  },
  {
    id: 'demo-album-1',
    name: '演說家',
    coverUrl: '',
    tracks: [
      {
        id: 'demo-track-1',
        title: '目不轉睛',
        artist: '王以太',
        duration: 221,
      },
    ],
    releaseYear: 2018,
    trackCount: 11,
    durationLabel: '36 分',
    description: '本機曲庫中的專輯資料。',
  },
  {
    id: 'demo-album-2',
    name: 'Love Me Later',
    coverUrl: '',
    tracks: [
      {
        id: 'demo-track-2',
        title: '別怕變老',
        artist: '王以太',
        duration: 246,
      },
    ],
    releaseYear: 2021,
    trackCount: 10,
    durationLabel: '32 分',
    description: '本機曲庫中的專輯資料。',
  },
  {
    id: 'demo-album-3',
    name: '幸存者的負罪感',
    coverUrl: '',
    tracks: [
      {
        id: 'demo-track-3',
        title: '危險派對',
        artist: '王以太',
        duration: 198,
      },
    ],
    releaseYear: 2024,
    trackCount: 9,
    durationLabel: '31 分',
    description: '本機曲庫中的專輯資料。',
  },
];
const demoSelectedAlbumId = shallowRef('demo-album-current');
const selectedDemoAlbum = computed(
  () =>
    demoAlbums.find((album) => album.id === demoSelectedAlbumId.value) ??
    demoAlbums[0],
);
const demoRelatedAlbums = computed(() =>
  demoAlbums.filter((album) => album.id !== demoSelectedAlbumId.value),
);
const demoAlbumMeta = computed(
  () =>
    `${selectedDemoAlbum.value.releaseYear} · ${selectedDemoAlbum.value.trackCount} 首曲目 · ${selectedDemoAlbum.value.durationLabel}`,
);
const visibleDemoAlbumEntries = computed(() => {
  const query = demoSearchQuery.value.trim().toLocaleLowerCase();
  const limit = contentMode.value === 'short' ? 3 : Number.POSITIVE_INFINITY;
  const entries = selectedDemoAlbum.value.tracks
    .filter((track) =>
      [track.title, track.artist].some((value) =>
        value?.toLocaleLowerCase().includes(query),
      ),
    )
    .map((track, playlistIndex) => ({
      track,
      playlistIndex,
      visibleIndex: playlistIndex,
      addedAt: `2026-08-${String(29 - playlistIndex).padStart(2, '0')}T00:00:00.000Z`,
    }));

  const { key, direction } = demoSort.value;
  if (key) {
    const multiplier = direction === 'desc' ? -1 : 1;
    entries.sort((left, right) => {
      if (key === 'duration') {
        return (left.track.duration - right.track.duration) * multiplier;
      }
      if (key === 'addedAt') {
        return left.addedAt.localeCompare(right.addedAt) * multiplier;
      }
      return left.track.title.localeCompare(right.track.title) * multiplier;
    });
  }

  return entries.slice(0, limit).map((entry, visibleIndex) => ({
    ...entry,
    visibleIndex,
  }));
});
const demoArtistSummaryBody = '38 首曲目 · 4 張專輯 · 2018–2024';
const demoFolderArtifacts = [
  {
    id: 'artist-summary',
    kind: 'note',
    label: '藝人曲庫摘要',
    initialPlacement: { region: 'bottom', anchor: { x: 0.9, y: 0.85 } },
    rotation: -1.5,
  },
];
const demoAddToPlaylistItems = [
  { key: 'demo-target-1', label: '直播準備', value: 'demo-target-1' },
  { key: 'demo-target-2', label: 'Cover 待唱', value: 'demo-target-2' },
];
const demoCollectionMoreItems = [
  { key: 'edit', label: '編輯詳細資料', value: 'edit' },
  { key: 'convert', label: '轉為播放清單', value: 'convert' },
  { key: 'divider', separator: true },
  { key: 'remove', label: '移除', value: 'remove', danger: true },
];

const previewClasses = computed(() => ({
  'demo-page-layout__preview--narrow': previewMode.value === 'narrow',
}));
const activeFolder = computed(() => {
  const definition =
    folderDefinitions.find((page) => page.id === activeFolderId.value) ??
    folderDefinitions[0];
  if (definition.id !== 'setlist') return definition;
  return {
    ...definition,
    title: selectedDemoAlbum.value.name,
    description: `王以太 · ${selectedDemoAlbum.value.releaseYear} · ${selectedDemoAlbum.value.trackCount} 首曲目`,
  };
});

function selectFolder(pageId) {
  activeFolderId.value = pageId;
}

function selectDemoAlbum(albumId) {
  if (demoAlbums.some((album) => album.id === albumId)) {
    demoSelectedAlbumId.value = albumId;
  }
}

function toggleDemoSort(key) {
  demoSort.value = {
    key,
    direction:
      demoSort.value.key === key && demoSort.value.direction === 'asc'
        ? 'desc'
        : 'asc',
  };
}

function toggleDemoCollectionPlayback() {
  demoCollectionPlaying.value = !demoCollectionPlaying.value;
}

function toggleDemoSupportingAlbumPlayback(albumId) {
  demoSupportingAlbumPlayingId.value =
    demoSupportingAlbumPlayingId.value === albumId ? '' : albumId;
}

function toggleDemoCollectionShuffle() {
  demoCollectionShuffle.value = !demoCollectionShuffle.value;
  demoCollectionPlaying.value = true;
}
</script>

<template>
  <div class="demo-page-layout">
    <header class="demo-page-layout__tools">
      <div class="demo-page-layout__tools-copy">
        <strong>Folder 外框</strong>
        <p>Folder 外觀色屬於元件，內容保持中性。</p>
      </div>
      <div class="demo-page-layout__controls">
        <div class="demo-page-layout__control">
          <span>寬度</span>
          <UiSegmentedControl
            v-model="previewMode"
            :items="previewModes"
            aria-label="頁面版型預覽寬度"
          />
        </div>
        <div class="demo-page-layout__control">
          <span>內容</span>
          <UiSegmentedControl
            v-model="contentMode"
            :items="contentModes"
            aria-label="頁面版型內容量"
          />
        </div>
      </div>
    </header>

    <div class="demo-page-layout__stage">
      <div
        class="demo-page-layout__preview"
        :class="previewClasses"
        :data-preview-width="previewMode"
        :data-content-mode="contentMode"
        :data-folder-view="activeFolder.id"
        :aria-labelledby="specimenTitleId"
      >
        <AppFolderLayout
          :active-destination="activeFolder.id"
          @navigate="selectFolder"
        >
          <AppFolderPage
            mode="document"
            :document-key="`${activeFolder.id}:${demoSelectedAlbumId}`"
            :body-label="activeFolder.title + '內容'"
            :aria-labelledby="specimenTitleId"
          >
            <template v-if="activeFolder.id !== 'setlist'" #header>
              <UiPageHeader
                :title="activeFolder.title"
                :title-id="specimenTitleId"
              >
                <template #description>
                  {{ activeFolder.description }}
                </template>
                <template #actions>
                  <UiButton variant="accent">
                    {{ activeFolder.action }}
                  </UiButton>
                </template>
              </UiPageHeader>
            </template>

            <template v-if="activeFolder.id === 'setlist'">
              <SetlistCollectionHeader
                v-model:search-query="demoSearchQuery"
                entity-kind="album"
                :title="selectedDemoAlbum.name"
                :title-id="specimenTitleId"
                artist="王以太"
                :meta="demoAlbumMeta"
                :cover-tracks="selectedDemoAlbum.tracks"
                :cover-url="selectedDemoAlbum.coverUrl"
                :description="selectedDemoAlbum.description"
                :playing="demoCollectionPlaying"
                :shuffle-active="demoCollectionShuffle"
                :can-play="selectedDemoAlbum.tracks.length > 0"
                :can-shuffle="selectedDemoAlbum.tracks.length > 1"
                :can-add-to-queue="selectedDemoAlbum.tracks.length > 0"
                :can-add-to-playlist="selectedDemoAlbum.tracks.length > 0"
                :add-to-playlist-items="demoAddToPlaylistItems"
                :more-items="demoCollectionMoreItems"
                @toggle-playback="toggleDemoCollectionPlayback"
                @toggle-shuffle="toggleDemoCollectionShuffle"
              />

              <AppFolderContentField aria-label="專輯曲目">
                <SetlistPlaylistTable
                  :entries="visibleDemoAlbumEntries"
                  :sort="demoSort"
                  :is-album="true"
                  :can-drag="false"
                  :jumpable-track-ids="emptyTrackIds"
                  @toggle-sort="toggleDemoSort"
                />
              </AppFolderContentField>

              <SetlistAlbumSupportingContent
                artist="王以太"
                :related-albums="demoRelatedAlbums"
                :playing-album-id="demoSupportingAlbumPlayingId"
                @select-album="selectDemoAlbum"
                @play-album="toggleDemoSupportingAlbumPlayback"
              />
            </template>

            <AppFolderContentField v-else aria-label="可展開內容範圍">
              <div class="demo-page-layout__sections">
                <section
                  class="demo-page-layout__section"
                  :aria-labelledby="overviewTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h2 :id="overviewTitleId">工作集摘要</h2>
                    <p>12 首曲目，3 項待確認。</p>
                  </header>
                  <dl class="demo-page-layout__facts">
                    <div>
                      <dt>曲目</dt>
                      <dd>12 首</dd>
                    </div>
                    <div>
                      <dt>待確認</dt>
                      <dd>3 項</dd>
                    </div>
                    <div>
                      <dt>已完成</dt>
                      <dd>9 項</dd>
                    </div>
                  </dl>
                  <aside class="demo-page-layout__summary-note">
                    先處理待確認素材，再檢查輸出。
                  </aside>
                </section>

                <section
                  v-if="contentMode === 'overflow'"
                  class="demo-page-layout__section"
                  :aria-labelledby="materialsTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h2 :id="materialsTitleId">素材狀態</h2>
                  </header>
                  <ul class="demo-page-layout__material-list">
                    <li v-for="material in materialRows" :key="material.name">
                      <span class="demo-page-layout__material-copy">
                        <strong>{{ material.name }}</strong>
                        <span>{{ material.detail }}</span>
                      </span>
                      <span class="demo-page-layout__material-state">
                        {{ material.state }}
                      </span>
                    </li>
                  </ul>
                </section>

                <section
                  v-if="contentMode === 'overflow'"
                  class="demo-page-layout__section"
                  :aria-labelledby="nextTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h2 :id="nextTitleId">接續工作</h2>
                  </header>
                  <ol class="demo-page-layout__steps">
                    <li>確認伴奏版本與主唱錄音採樣率。</li>
                    <li>校正歌詞時間軸並完成演出提示。</li>
                    <li>檢查直播版型與 Cover 輸出尺寸。</li>
                  </ol>
                </section>

                <section
                  v-if="contentMode === 'overflow'"
                  class="demo-page-layout__section"
                  :aria-labelledby="notesTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h2 :id="notesTitleId">版面檢查</h2>
                    <p>標題固定，內容獨立捲動。</p>
                  </header>
                </section>
              </div>
            </AppFolderContentField>

            <template v-if="activeFolder.id === 'setlist'" #floating>
              <UiFolderArtifactCanvas
                :artifacts="demoFolderArtifacts"
                material="folder"
                label="Folder 延伸摘要"
              >
                <template #default="{ artifact }">
                  <UiFolderArtifact
                    :kind="artifact.kind"
                    eyebrow="王以太"
                    title="藝人曲庫摘要"
                    :body="demoArtistSummaryBody"
                  />
                </template>
              </UiFolderArtifactCanvas>
            </template>
          </AppFolderPage>
        </AppFolderLayout>
      </div>
    </div>

    <p class="demo-page-layout__caption">
      切換寬窄版與內容量，確認固定區與捲動範圍。
    </p>
  </div>
</template>

<style scoped>
.demo-page-layout {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
}

.demo-page-layout__tools {
  min-width: 0;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--ui-space-4);
}

.demo-page-layout__tools-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-page-layout__tools-copy strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-page-layout__tools-copy p,
.demo-page-layout__caption {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__controls {
  flex: 0 0 auto;
  display: flex;
  align-items: end;
  gap: var(--ui-space-3);
}

.demo-page-layout__control {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__stage {
  min-width: 0;
  display: flex;
  justify-content: center;
  padding: var(--ui-space-4);
  overflow: hidden;
  background: var(--ui-color-canvas);
}

.demo-page-layout__preview {
  width: 100%;
  max-width: 64rem;
  min-width: 0;
  height: 34rem;
}

.demo-page-layout__preview--narrow {
  width: min(28rem, 100%);
}

.demo-page-layout__sections {
  min-width: 0;
}

.demo-page-layout__section {
  min-width: 0;
  display: grid;
  gap: var(--ui-folder-section-gap);
  padding: var(--ui-folder-document-inset) 0;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__section:first-child {
  border-top: 0;
  padding-block-start: 0;
}

.demo-page-layout__section-heading {
  min-width: 0;
  display: grid;
  gap: var(--ui-folder-heading-gap);
}

.demo-page-layout__section-heading h2,
.demo-page-layout__section-heading p {
  margin: 0;
}

.demo-page-layout__section-heading h2 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-page-layout__section-heading p {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
}

.demo-page-layout__facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__summary-note {
  padding-inline-start: var(--ui-space-3);
  border-inline-start: calc(var(--ui-border-width) * 2) solid
    var(--ui-color-accent);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.demo-page-layout__facts div {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3) 0;
}

.demo-page-layout__facts dt,
.demo-page-layout__facts dd {
  margin: 0;
}

.demo-page-layout__facts dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__facts dd {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-page-layout__material-list,
.demo-page-layout__steps {
  margin: 0;
}

.demo-page-layout__material-list {
  padding: 0;
  list-style: none;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__material-list li {
  min-width: 0;
  min-height: var(--ui-track-row-min-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__material-list li:first-child {
  border-top: 0;
}

.demo-page-layout__material-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-page-layout__material-copy strong {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-page-layout__material-copy span,
.demo-page-layout__material-state {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__material-state {
  flex: 0 0 auto;
  font-weight: var(--ui-font-weight-semibold);
}

.demo-page-layout__steps {
  display: grid;
  gap: var(--ui-space-2);
  padding-inline-start: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
}

@container app-folder-layout (max-width: 36rem) {
  .demo-page-layout__facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-page-layout__facts div + div {
    border-top: var(--ui-border-width) solid var(--ui-color-border);
  }
}

@media (max-width: 48rem) {
  .demo-page-layout__tools {
    align-items: stretch;
    flex-direction: column;
  }

  .demo-page-layout__controls {
    flex-wrap: wrap;
  }

  .demo-page-layout__stage {
    padding: var(--ui-space-3);
  }
}
</style>
