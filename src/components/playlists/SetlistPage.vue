<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useSetlistFolderObjects } from '../../composables/useSetlistFolderObjects.js';
import { usePerformanceSessionWorkspace } from '../../composables/usePerformanceSessionWorkspace.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useSetlistAlbumContext } from '../../composables/useSetlistAlbumContext.js';
import { libraryViewTitle } from '../../utils/playlistMenu.js';
import { ImagePlus, Plus, StickyNote } from '../../icons/index.js';
import SetlistView from '../../views/SetlistView.vue';
import AppFolderPage from '../layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import FolderAssetPreviewModal from './FolderAssetPreviewModal.vue';
import SetlistFolderArtifactLayer from './SetlistFolderArtifactLayer.vue';

const { state: playlistState, selectedPlaylist } = usePlaylists();
const { albumSupportingContent } = useSetlistAlbumContext();
const performanceSessionWorkspace = usePerformanceSessionWorkspace();
const folderObjects = useSetlistFolderObjects();
const confirmation = useAppConfirmation();
const editingNoteKey = ref(null);
const addMenuOpen = ref(false);
const ADD_MENU_ITEMS = Object.freeze([
  Object.freeze({
    key: 'photo',
    label: '照片',
    value: 'photo',
    icon: ImagePlus,
  }),
  Object.freeze({
    key: 'note',
    label: '便條',
    value: 'note',
    icon: StickyNote,
  }),
]);
const searchQuery = ref('');
const selectedAsset = shallowRef(null);
const previewOpen = shallowRef(false);
const addObjectButton = useTemplateRef('addObjectButton');
let focusAddButtonAfterPreviewClose = false;

const pageMode = computed(() =>
  performanceSessionWorkspace.isOpen.value ? 'workspace' : 'document',
);
const showLibraryHeader = computed(
  () =>
    !performanceSessionWorkspace.isOpen.value &&
    !selectedPlaylist.value &&
    !playlistState.selectedArtistId,
);
const pageTitle = computed(() => libraryViewTitle(playlistState.libraryView));
const documentKey = computed(
  () =>
    selectedPlaylist.value?.id ??
    playlistState.selectedArtistId ??
    `library:${playlistState.libraryView}`,
);
const folderPageIdentity = computed(() => {
  if (performanceSessionWorkspace.isOpen.value) return null;
  if (selectedPlaylist.value) {
    return {
      kind: selectedPlaylist.value.kind === 'album' ? 'album' : 'playlist',
      id: selectedPlaylist.value.id,
    };
  }
  if (playlistState.selectedArtistId) {
    return { kind: 'artist', id: playlistState.selectedArtistId };
  }
  return null;
});
const folderPageKey = computed(() =>
  folderPageIdentity.value
    ? `${folderPageIdentity.value.kind}:${folderPageIdentity.value.id}`
    : 'none',
);
const artistSummary = computed(() =>
  albumSupportingContent.value
    ? {
        artist: albumSupportingContent.value.artist,
        ...albumSupportingContent.value.summary,
      }
    : null,
);
const folderArtifactsReady = computed(
  () =>
    Boolean(folderPageIdentity.value) &&
    folderObjects.page.value?.kind === folderPageIdentity.value?.kind &&
    folderObjects.page.value?.id === folderPageIdentity.value?.id &&
    !folderObjects.loading.value,
);
const showFolderArtifacts = computed(
  () =>
    folderArtifactsReady.value &&
    (Boolean(artistSummary.value) ||
      folderObjects.objects.value.some((object) => object.source === 'user')),
);
const addObjectLabel = computed(() => {
  if (folderObjects.adding.value) return '正在新增頁面物件';
  return folderObjects.limitReached.value
    ? '頁面物件已達 12 個上限'
    : '新增頁面物件';
});

watch(
  folderPageIdentity,
  async (page) => {
    await folderObjects.flush();
    previewOpen.value = false;
    selectedAsset.value = null;
    editingNoteKey.value = null;
    addMenuOpen.value = false;
    focusAddButtonAfterPreviewClose = false;
    await folderObjects.load(page);
  },
  { immediate: true },
);

function handleArtifactLayout(entries, options) {
  void folderObjects.saveLayout(entries, options);
}

// Stop the opening click so the menu's outside-click close does not see it.
function toggleAddMenu(event) {
  event.stopPropagation();
  addMenuOpen.value = !addMenuOpen.value;
}

async function selectAddAction(type) {
  addMenuOpen.value = false;
  const key =
    type === 'photo'
      ? await folderObjects.addPhoto()
      : await folderObjects.addNote();
  if (key && type === 'note') editingNoteKey.value = key;
}

// A note left empty is discarded instead of kept as a blank card.
function commitNote(key, text) {
  if (text.trim() === '') {
    void folderObjects.remove(key);
    return;
  }
  void folderObjects.updateNoteText(key, text.trimEnd());
}

async function confirmRemoveObject(key) {
  const object = folderObjects.objects.value.find((entry) => entry.key === key);
  if (!object) return;
  const confirmed = await confirmation.confirm(
    object.type === 'photo'
      ? {
          title: '移除這張照片？',
          message: '照片會從此頁面移除，原始檔案仍會保留。',
          confirmLabel: '移除',
          intent: 'danger',
        }
      : {
          title: '刪除這張便條？',
          message: '便條內容會從此頁面刪除，無法復原。',
          confirmLabel: '刪除',
          intent: 'danger',
        },
  );
  if (!confirmed || !(await folderObjects.remove(key))) return;
  await nextTick();
  addObjectButton.value?.$el?.focus?.();
}

function openAsset(key) {
  const asset = folderObjects.objects.value.find((entry) => entry.key === key);
  if (!asset) return;
  selectedAsset.value = asset;
  previewOpen.value = true;
}

function closeAssetPreview() {
  previewOpen.value = false;
}

async function finishAssetPreviewClose() {
  selectedAsset.value = null;
  if (!focusAddButtonAfterPreviewClose) return;
  focusAddButtonAfterPreviewClose = false;
  await nextTick();
  addObjectButton.value?.$el?.focus?.();
}

async function removeAsset(key) {
  if (!(await folderObjects.remove(key))) return;
  focusAddButtonAfterPreviewClose = true;
  closeAssetPreview();
}

async function retryFolderAssets() {
  await folderObjects.flush();
  await folderObjects.load(folderPageIdentity.value);
}

onBeforeUnmount(() => {
  void folderObjects.flush();
});
</script>

<template>
  <AppSurfaceBoundary
    surface-id="setlist"
    :child-hosts="['performance-session-workspace']"
  >
    <AppFolderPage
      :mode="pageMode"
      :document-key="documentKey"
      body-label="曲目內容"
    >
      <template v-if="showLibraryHeader" #header>
        <UiPageHeader :title="pageTitle">
          <template #actions>
            <UiSearchBox v-model="searchQuery" />
          </template>
        </UiPageHeader>
      </template>

      <UiNotice
        v-if="folderPageIdentity && folderObjects.error.value"
        tone="danger"
        title="頁面物件操作未完成"
        :message="folderObjects.error.value"
        action-label="重試讀取"
        compact
        @action="retryFolderAssets"
      />

      <SetlistView v-model:search-query="searchQuery" />

      <template v-if="showFolderArtifacts" #floating>
        <SetlistFolderArtifactLayer
          :key="folderPageKey"
          v-model:editing-key="editingNoteKey"
          :objects="folderObjects.objects.value"
          :summary="artistSummary"
          :fresh-keys="folderObjects.freshKeys.value"
          @layout-change="handleArtifactLayout"
          @activate="openAsset"
          @note-commit="commitNote"
          @remove="confirmRemoveObject"
        />
      </template>

      <template v-if="folderPageIdentity" #folder-tools>
        <UiIconButton
          ref="addObjectButton"
          :icon="Plus"
          :label="addObjectLabel"
          variant="command"
          aria-haspopup="menu"
          :aria-expanded="addMenuOpen"
          :disabled="
            folderObjects.loading.value ||
            folderObjects.adding.value ||
            folderObjects.limitReached.value
          "
          @click="toggleAddMenu"
        />
        <UiContextMenu
          :open="addMenuOpen"
          :anchor-el="addObjectButton?.$el ?? null"
          :width="160"
          aria-label="新增頁面物件"
          :items="ADD_MENU_ITEMS"
          @select="selectAddAction"
          @close="addMenuOpen = false"
        />
      </template>
    </AppFolderPage>

    <FolderAssetPreviewModal
      :open="previewOpen"
      :asset="selectedAsset"
      :removing="folderObjects.removing.value"
      @close="closeAssetPreview"
      @after-leave="finishAssetPreviewClose"
      @remove="removeAsset"
    />
  </AppSurfaceBoundary>
</template>
