'use strict';

const { createAppError } = require('../lib/appError');
const { createArtistIndexCache } = require('../lib/artists/artistIndex');
const {
  addFolderPageNote,
  addFolderPagePhoto,
  listFolderPageObjects,
  removeFolderPageObject,
  saveFolderPageLayout,
  updateFolderPageNoteText,
  validateFolderPageIdentity,
} = require('../lib/library/folderPageObjects');
const { listTracks } = require('../lib/library');
const { loadPlaylists } = require('../lib/playlists');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

const OPERATION_ERRORS = Object.freeze({
  list: Object.freeze({
    code: 'FOLDER_PAGE_OBJECT_LIST_FAILED',
    title: '無法讀取頁面物件',
    message: '目前無法讀取這個頁面的物件，請稍後再試。',
  }),
  add: Object.freeze({
    code: 'FOLDER_PAGE_OBJECT_ADD_FAILED',
    title: '無法新增頁面照片',
    message: '這張照片目前無法加入頁面，請檢查格式或大小後再試。',
  }),
  note: Object.freeze({
    code: 'FOLDER_PAGE_OBJECT_NOTE_FAILED',
    title: '無法儲存頁面便條',
    message: '這張便條目前無法新增或儲存，請再試一次。',
  }),
  layout: Object.freeze({
    code: 'FOLDER_PAGE_OBJECT_LAYOUT_FAILED',
    title: '無法儲存頁面配置',
    message: '物件的位置、固定狀態或層次目前無法儲存，請再試一次。',
  }),
  remove: Object.freeze({
    code: 'FOLDER_PAGE_OBJECT_REMOVE_FAILED',
    title: '無法移除頁面物件',
    message: '這個物件目前無法從頁面移除，請再試一次。',
  }),
});

async function pageExistsInLibrary(
  directory,
  pageValue,
  artistIndexCache = createArtistIndexCache(),
) {
  const page = validateFolderPageIdentity(pageValue);
  if (!page) return false;
  if (page.kind === 'artist') {
    const index = await artistIndexCache.getIndex(
      directory,
      listTracks(directory),
    );
    return index.artists.some((artist) => artist.id === page.id);
  }
  return loadPlaylists(directory).some(
    (playlist) => playlist.id === page.id && playlist.kind === page.kind,
  );
}

function pageInvalidError() {
  return createAppError({
    code: 'FOLDER_PAGE_OBJECT_PAGE_INVALID',
    title: '無法使用這個頁面',
    message: '目前頁面已不存在，請重新選擇播放清單、專輯或藝人。',
    context: { retryable: false },
  });
}

function layoutEntry(value) {
  const entry = {
    key: value?.key,
    placement: {
      region: value?.placement?.region,
      anchor: {
        x: value?.placement?.anchor?.x,
        y: value?.placement?.anchor?.y,
      },
    },
    pinned: value?.pinned,
    order: value?.order,
  };
  if (Object.hasOwn(value ?? {}, 'type')) entry.type = value.type;
  if (Object.hasOwn(value ?? {}, 'rotation')) entry.rotation = value.rotation;
  return entry;
}

function registerFolderPageObjectHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  recordDiagnostic,
  artistIndexCache = createArtistIndexCache(),
  validatePageExists = (directory, page) =>
    pageExistsInLibrary(directory, page, artistIndexCache),
  listObjects = listFolderPageObjects,
  addPhoto = addFolderPagePhoto,
  addNote = addFolderPageNote,
  updateNoteText = updateFolderPageNoteText,
  saveLayout = saveFolderPageLayout,
  removeObject = removeFolderPageObject,
}) {
  function withBoundary(operation, work) {
    const presentation = OPERATION_ERRORS[operation];
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'folder-page-objects',
          operation,
          code: presentation.code,
        },
        publicError: {
          ...presentation,
          context: { retryable: true },
        },
      },
      work,
    );
  }

  async function resolvePage(pageValue, operation) {
    const page = validateFolderPageIdentity(pageValue);
    if (!page) throw pageInvalidError();
    const resolved = await withBoundary(operation, async () => {
      const directory = resolveDownloadDir(getConfig());
      return (await validatePageExists(directory, page))
        ? { directory, page }
        : null;
    });
    if (!resolved) throw pageInvalidError();
    return resolved;
  }

  ipcMain.handle('folder-page-objects:list', async (event, pageValue) => {
    const { directory, page } = await resolvePage(pageValue, 'list');
    return withBoundary('list', () => listObjects(directory, page));
  });

  ipcMain.handle(
    'folder-page-objects:choose-photo',
    async (event, pageValue) => {
      const { directory, page } = await resolvePage(pageValue, 'add');
      return withBoundary('add', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
          properties: ['openFile'],
          filters: [
            { name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
          ],
        });
        if (result.canceled || !result.filePaths?.[0]) {
          return { status: 'cancelled' };
        }
        return {
          status: 'added',
          object: addPhoto(directory, page, result.filePaths[0]),
        };
      });
    },
  );

  ipcMain.handle(
    'folder-page-objects:create-note',
    async (event, pageValue) => {
      const { directory, page } = await resolvePage(pageValue, 'note');
      return withBoundary('note', () => addNote(directory, page));
    },
  );

  ipcMain.handle(
    'folder-page-objects:update-note',
    async (event, intent = {}) => {
      const { directory, page } = await resolvePage(intent.page, 'note');
      return withBoundary('note', () =>
        updateNoteText(directory, page, intent.key, intent.text),
      );
    },
  );

  ipcMain.handle(
    'folder-page-objects:save-layout',
    async (event, intent = {}) => {
      const { directory, page } = await resolvePage(intent.page, 'layout');
      const entries = Array.isArray(intent.entries)
        ? intent.entries.map(layoutEntry)
        : [];
      return withBoundary('layout', () => saveLayout(directory, page, entries));
    },
  );

  ipcMain.handle('folder-page-objects:remove', async (event, intent = {}) => {
    const { directory, page } = await resolvePage(intent.page, 'remove');
    return withBoundary('remove', () => {
      removeObject(directory, page, intent.key);
      return listObjects(directory, page);
    });
  });
}

module.exports = {
  pageExistsInLibrary,
  registerFolderPageObjectHandlers,
};
