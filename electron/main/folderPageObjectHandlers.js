'use strict';

const { createAppError } = require('../lib/appError');
const { createArtistIndexCache } = require('../lib/artists/artistIndex');
const {
  FOLDER_PAGE_USER_OBJECT_LIMIT,
  addFolderPageNote,
  addFolderPagePhoto,
  listFolderPageObjects,
  removeFolderPageObject,
  saveFolderPageLayout,
  updateFolderPageNote,
  updateFolderPagePhotoText,
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
  photo: Object.freeze({
    code: 'FOLDER_PAGE_OBJECT_PHOTO_TEXT_FAILED',
    title: '無法儲存照片文字',
    message: '這張照片的文字目前無法儲存，請再試一次。',
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

function artistFolderPageContext(page, index) {
  const canonicalId = index.artistRedirects?.[page.id] ?? page.id;
  if (!index.artists.some((artist) => artist.id === canonicalId)) return null;
  const sourceIds = Object.entries(index.artistRedirects ?? {})
    .filter(([, targetId]) => targetId === canonicalId)
    .map(([sourceId]) => sourceId);
  const canonicalPage = { kind: 'artist', id: canonicalId };
  const sourcePages = sourceIds.map((id) => ({ kind: 'artist', id }));
  return {
    canonicalPage,
    storagePages: [canonicalPage, ...sourcePages],
    // New objects stay with a real source credit whenever possible. A later
    // split/undo can then reveal them without copying or deleting assets.
    writePage: sourcePages[0] ?? canonicalPage,
  };
}

async function resolveArtistFolderPages(
  directory,
  page,
  artistIndexCache = createArtistIndexCache(),
) {
  const index = await artistIndexCache.getIndex(
    directory,
    listTracks(directory),
  );
  return artistFolderPageContext(page, index);
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
  resolveArtistPages,
  validatePageExists = (directory, page) =>
    pageExistsInLibrary(directory, page, artistIndexCache),
  listObjects = listFolderPageObjects,
  addPhoto = addFolderPagePhoto,
  addNote = addFolderPageNote,
  updateNote = updateFolderPageNote,
  updatePhotoText = updateFolderPagePhotoText,
  saveLayout = saveFolderPageLayout,
  removeObject = removeFolderPageObject,
}) {
  const deriveArtistPages =
    resolveArtistPages ??
    ((directory, page) =>
      resolveArtistFolderPages(directory, page, artistIndexCache));

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
      if (page.kind === 'artist') {
        const context = await deriveArtistPages(directory, page);
        return context
          ? { directory, page: context.canonicalPage, context }
          : null;
      }
      return (await validatePageExists(directory, page))
        ? {
            directory,
            page,
            context: {
              canonicalPage: page,
              storagePages: [page],
              writePage: page,
            },
          }
        : null;
    });
    if (!resolved) throw pageInvalidError();
    return resolved;
  }

  function listContextObjects(directory, context) {
    const seen = new Set();
    const objects = [];
    for (const storagePage of context.storagePages) {
      for (const object of listObjects(directory, storagePage)) {
        if (!object?.key || seen.has(object.key)) continue;
        seen.add(object.key);
        objects.push(object);
      }
    }
    return objects;
  }

  function objectStoragePage(directory, context, key) {
    return (
      listContextObjects(directory, context).find(
        (object) => object.key === key,
      )?.page ?? context.writePage
    );
  }

  function assertContextObjectCapacity(directory, context) {
    const userCount = listContextObjects(directory, context).filter(
      (object) => object.source === 'user',
    ).length;
    if (userCount >= FOLDER_PAGE_USER_OBJECT_LIMIT) {
      const error = new Error('Folder page object limit reached.');
      error.code = 'FOLDER_PAGE_OBJECT_LIMIT_REACHED';
      throw error;
    }
  }

  ipcMain.handle('folder-page-objects:list', async (event, pageValue) => {
    const { directory, context } = await resolvePage(pageValue, 'list');
    return withBoundary('list', () => listContextObjects(directory, context));
  });

  ipcMain.handle(
    'folder-page-objects:choose-photo',
    async (event, pageValue) => {
      const { directory, context } = await resolvePage(pageValue, 'add');
      return withBoundary('add', async () => {
        assertContextObjectCapacity(directory, context);
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
          object: addPhoto(directory, context.writePage, result.filePaths[0]),
        };
      });
    },
  );

  ipcMain.handle(
    'folder-page-objects:create-note',
    async (event, intent = {}) => {
      const { directory, context } = await resolvePage(intent.page, 'note');
      return withBoundary('note', () => {
        assertContextObjectCapacity(directory, context);
        return addNote(directory, context.writePage, {
          title: intent.title,
          text: intent.text,
          paper: intent.paper,
        });
      });
    },
  );

  ipcMain.handle(
    'folder-page-objects:update-note',
    async (event, intent = {}) => {
      const { directory, context } = await resolvePage(intent.page, 'note');
      return withBoundary('note', () =>
        updateNote(
          directory,
          objectStoragePage(directory, context, intent.key),
          intent.key,
          {
            title: intent.title,
            text: intent.text,
            paper: intent.paper,
          },
        ),
      );
    },
  );

  ipcMain.handle(
    'folder-page-objects:update-photo-text',
    async (event, intent = {}) => {
      const { directory, context } = await resolvePage(intent.page, 'photo');
      return withBoundary('photo', () =>
        updatePhotoText(
          directory,
          objectStoragePage(directory, context, intent.key),
          intent.key,
          {
            label: intent.label,
            captionTitle: intent.captionTitle,
            caption: intent.caption,
            captionPaper: intent.captionPaper,
          },
        ),
      );
    },
  );

  ipcMain.handle(
    'folder-page-objects:save-layout',
    async (event, intent = {}) => {
      const { directory, context } = await resolvePage(intent.page, 'layout');
      const entries = Array.isArray(intent.entries)
        ? intent.entries.map(layoutEntry)
        : [];
      return withBoundary('layout', () => {
        if (entries.length === 0) {
          return saveLayout(directory, context.writePage, entries);
        }
        const pageByKey = new Map(
          listContextObjects(directory, context).map((object) => [
            object.key,
            object.page,
          ]),
        );
        const entriesByPage = new Map();
        for (const entry of entries) {
          const storagePage = pageByKey.get(entry.key) ?? context.writePage;
          const pageKey = `${storagePage.kind}\0${storagePage.id}`;
          const group = entriesByPage.get(pageKey) ?? {
            page: storagePage,
            entries: [],
          };
          group.entries.push(entry);
          entriesByPage.set(pageKey, group);
        }
        for (const group of entriesByPage.values()) {
          saveLayout(directory, group.page, group.entries);
        }
        return listContextObjects(directory, context);
      });
    },
  );

  ipcMain.handle('folder-page-objects:remove', async (event, intent = {}) => {
    const { directory, context } = await resolvePage(intent.page, 'remove');
    return withBoundary('remove', () => {
      removeObject(
        directory,
        objectStoragePage(directory, context, intent.key),
        intent.key,
      );
      return listContextObjects(directory, context);
    });
  });
}

module.exports = {
  artistFolderPageContext,
  pageExistsInLibrary,
  resolveArtistFolderPages,
  registerFolderPageObjectHandlers,
};
