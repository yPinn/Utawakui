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
import { useLibraryFolderObjects } from '../../composables/useLibraryFolderObjects.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useLibraryAlbumContext } from '../../composables/useLibraryAlbumContext.js';
import { ImagePlus, Plus, StickyNote } from '../../icons/index.js';
import LibraryBrowseContent from './LibraryBrowseContent.vue';
import AppFolderPage from '../layout/AppFolderPage.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import AppFolderNoteEditorModal from '../layout/AppFolderNoteEditorModal.vue';
import AppFolderNoteReaderModal from '../layout/AppFolderNoteReaderModal.vue';
import AppFolderPhotoTextEditorModal from '../layout/AppFolderPhotoTextEditorModal.vue';
import FolderAssetPreviewModal from './FolderAssetPreviewModal.vue';
import LibraryFolderArtifactLayer from './LibraryFolderArtifactLayer.vue';

const { state: playlistState, selectedPlaylist } = usePlaylists();
const { albumSupportingContent } = useLibraryAlbumContext();
const folderObjects = useLibraryFolderObjects();
const confirmation = useAppConfirmation();
// null when closed; { key } edits an existing note, { key: null } creates.
const noteEditor = shallowRef(null);
const noteEditorSaving = ref(false);
const noteError = ref('');
const photoTextError = ref('');
const removalError = ref('');
// Key of the photo whose instant line and caption are being edited.
const photoTextKey = shallowRef(null);
// Key of the long note open on the reading sheet.
const readerKey = shallowRef(null);
const photoTextSaving = ref(false);
const addMenuOpen = ref(false);
const ADD_MENU_CONTENT = Object.freeze({
  kind: 'actions',
  groups: Object.freeze([
    Object.freeze({
      id: 'create',
      items: Object.freeze([
        Object.freeze({
          id: 'photo',
          kind: 'action',
          label: '照片',
          value: 'photo',
          icon: ImagePlus,
        }),
        Object.freeze({
          id: 'note',
          kind: 'action',
          label: '便條',
          value: 'note',
          icon: StickyNote,
        }),
      ]),
    }),
  ]),
});
const searchQuery = ref('');
const selectedAsset = shallowRef(null);
const previewOpen = shallowRef(false);
const addObjectButton = useTemplateRef('addObjectButton');
const addMenuAnchor = computed(() => ({
  kind: 'element',
  element: addObjectButton.value?.$el ?? null,
}));
let focusAddButtonAfterPreviewClose = false;

const documentKey = computed(
  () =>
    selectedPlaylist.value?.id ??
    playlistState.selectedArtistId ??
    `library:${playlistState.libraryView}`,
);
const folderPageIdentity = computed(() => {
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
  async (page, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    await folderObjects.flush();
    if (!current) return;
    previewOpen.value = false;
    selectedAsset.value = null;
    noteEditor.value = null;
    photoTextKey.value = null;
    readerKey.value = null;
    noteError.value = '';
    photoTextError.value = '';
    removalError.value = '';
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
  // A note is created only when its editor saves, never as a blank card.
  if (type === 'note') {
    noteError.value = '';
    noteEditor.value = { key: null };
    return;
  }
  await folderObjects.addPhoto();
}

const editedNote = computed(() =>
  noteEditor.value?.key
    ? (folderObjects.objects.value.find(
        (object) => object.key === noteEditor.value.key,
      ) ?? null)
    : null,
);

function openNoteEditor(key) {
  noteError.value = '';
  noteEditor.value = { key };
}

function closeNoteEditor() {
  if (noteEditorSaving.value) return;
  noteEditor.value = null;
}

async function saveNote(content) {
  const editor = noteEditor.value;
  if (!editor || noteEditorSaving.value) return;
  noteEditorSaving.value = true;
  noteError.value = '';
  const feedback = {
    onError: (message) => {
      if (noteEditor.value !== editor) return false;
      noteError.value = message;
    },
  };
  try {
    const saved = editor.key
      ? await folderObjects.updateNote(editor.key, content, feedback)
      : Boolean(await folderObjects.addNote(content, feedback));
    if (saved && noteEditor.value === editor) noteEditor.value = null;
  } finally {
    noteEditorSaving.value = false;
  }
}

const editedPhoto = computed(() =>
  photoTextKey.value
    ? (folderObjects.objects.value.find(
        (object) => object.key === photoTextKey.value,
      ) ?? null)
    : null,
);

function openPhotoTextEditor(key) {
  photoTextError.value = '';
  photoTextKey.value = key;
}

function closePhotoTextEditor() {
  if (photoTextSaving.value) return;
  photoTextKey.value = null;
}

async function savePhotoText(content) {
  const key = photoTextKey.value;
  if (!key || photoTextSaving.value) return;
  photoTextSaving.value = true;
  photoTextError.value = '';
  const feedback = {
    onError: (message) => {
      if (photoTextKey.value !== key) return false;
      photoTextError.value = message;
    },
  };
  try {
    if (!(await folderObjects.updatePhotoText(key, content, feedback))) return;
    if (photoTextKey.value !== key) return;
    photoTextKey.value = null;
    // An open preview shows the saved text without reopening.
    if (selectedAsset.value?.key === key) {
      selectedAsset.value =
        folderObjects.objects.value.find((object) => object.key === key) ??
        selectedAsset.value;
    }
  } finally {
    photoTextSaving.value = false;
  }
}

const readNote = computed(() =>
  readerKey.value
    ? (folderObjects.objects.value.find(
        (object) => object.key === readerKey.value,
      ) ?? null)
    : null,
);

function openNoteReader(key) {
  removalError.value = '';
  readerKey.value = key;
}

function closeNoteReader() {
  if (folderObjects.removing.value) return;
  readerKey.value = null;
}

// The reading sheet closes once its note is gone.
async function removeReadNote(key) {
  removalError.value = '';
  await confirmRemoveObject(key, {
    onError: (message) => {
      removalError.value = message;
    },
  });
  if (!folderObjects.objects.value.some((object) => object.key === key)) {
    readerKey.value = null;
  }
}

async function confirmRemoveObject(key, feedback) {
  const object = folderObjects.objects.value.find((entry) => entry.key === key);
  if (!object) return;
  const targetPageKey = folderPageKey.value;
  const confirmed = await confirmation.confirm(
    object.type === 'photo'
      ? {
          title: '從頁面移除照片？',
          message: '原始檔案會保留。',
          confirmLabel: '移除照片',
          intent: 'danger',
        }
      : {
          title: '刪除便條？',
          message: '便條內容會被刪除，且無法復原。',
          confirmLabel: '刪除便條',
          intent: 'danger',
        },
  );
  if (
    !confirmed ||
    targetPageKey !== folderPageKey.value ||
    !(await folderObjects.remove(key, feedback))
  )
    return;
  await nextTick();
  addObjectButton.value?.$el?.focus?.();
}

function openAsset(key) {
  removalError.value = '';
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
  removalError.value = '';
  if (
    !(await folderObjects.remove(key, {
      onError: (message) => {
        removalError.value = message;
      },
    }))
  )
    return;
  focusAddButtonAfterPreviewClose = true;
  closeAssetPreview();
}

async function retryFolderAssets() {
  await folderObjects.load(folderPageIdentity.value);
}

onBeforeUnmount(() => {
  void folderObjects.flush();
});
</script>

<template>
  <AppFolderPage
    mode="document"
    :document-key="documentKey"
    body-label="曲目內容"
  >
    <UiNotice
      v-if="folderPageIdentity && folderObjects.readError.value"
      tone="danger"
      title="頁面物件讀取未完成"
      :message="folderObjects.readError.value"
      action-label="重試讀取"
      compact
      @action="retryFolderAssets"
    />

    <LibraryBrowseContent v-model:search-query="searchQuery" />

    <template v-if="showFolderArtifacts" #floating>
      <LibraryFolderArtifactLayer
        :key="folderPageKey"
        :objects="folderObjects.objects.value"
        :summary="artistSummary"
        :fresh-keys="folderObjects.freshKeys.value"
        @layout-change="handleArtifactLayout"
        @activate="openAsset"
        @edit-note="openNoteEditor"
        @edit-photo-text="openPhotoTextEditor"
        @read-note="openNoteReader"
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
      <UiActionMenu
        :open="addMenuOpen"
        :anchor="addMenuAnchor"
        size="sm"
        aria-label="新增頁面物件"
        :content="ADD_MENU_CONTENT"
        @select="selectAddAction"
        @close="addMenuOpen = false"
      />
    </template>
  </AppFolderPage>

  <AppFolderNoteReaderModal
    :open="Boolean(readNote)"
    :note="readNote"
    :removing="folderObjects.removing.value"
    :error="removalError"
    @close="closeNoteReader"
    @edit="openNoteEditor"
    @remove="removeReadNote"
  />

  <AppFolderNoteEditorModal
    :open="Boolean(noteEditor)"
    :mode="noteEditor?.key ? 'edit' : 'create'"
    :title="editedNote?.title ?? ''"
    :text="editedNote?.text ?? ''"
    :paper="editedNote?.paper ?? ''"
    :saving="noteEditorSaving"
    :error="noteError"
    @close="closeNoteEditor"
    @save="saveNote"
  />

  <FolderAssetPreviewModal
    :open="previewOpen"
    :asset="selectedAsset"
    :removing="folderObjects.removing.value"
    :error="removalError"
    @close="closeAssetPreview"
    @after-leave="finishAssetPreviewClose"
    @remove="removeAsset"
    @edit-text="openPhotoTextEditor"
  />

  <AppFolderPhotoTextEditorModal
    :open="Boolean(editedPhoto)"
    :photo="editedPhoto"
    :saving="photoTextSaving"
    :error="photoTextError"
    @close="closePhotoTextEditor"
    @save="savePhotoText"
  />
</template>
