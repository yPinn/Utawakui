import { computed, reactive, readonly, shallowRef } from 'vue';
import { useAppNotifications } from './useAppNotifications.js';

export const LIBRARY_FOLDER_USER_OBJECT_LIMIT = 12;
export const LIBRARY_FOLDER_LAYOUT_SAVE_DELAY_MS = 300;

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

function pageIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  if (!['playlist', 'album', 'artist'].includes(value.kind)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  return { kind: value.kind, id: value.id };
}

function samePage(left, right) {
  return Boolean(
    left && right && left.kind === right.kind && left.id === right.id,
  );
}

function layoutEntry(value) {
  const entry = {
    key: value.key,
    placement: {
      region: value.placement?.region,
      anchor: { x: value.placement?.anchor?.x, y: value.placement?.anchor?.y },
    },
    pinned: value.pinned === true,
    order: value.order,
  };
  if (Object.hasOwn(value, 'type')) entry.type = value.type;
  if (Object.hasOwn(value, 'rotation')) entry.rotation = value.rotation;
  return entry;
}

export function createLibraryFolderObjects(options = {}) {
  const bridge = resolveBridge(options.bridge);
  const notifications = useAppNotifications();
  const delayMs =
    Number.isFinite(options.delayMs) && options.delayMs >= 0
      ? options.delayMs
      : LIBRARY_FOLDER_LAYOUT_SAVE_DELAY_MS;
  const page = shallowRef(null);
  const objects = shallowRef([]);
  // Keys added this session, set in the same tick as the object so the
  // canvas sees both when it first renders the new object.
  const freshKeys = shallowRef([]);
  const state = reactive({
    loading: false,
    adding: false,
    removing: false,
    saving: false,
    error: '',
    readError: '',
  });
  // Failed writes stay with their original document until an explicit retry or
  // a newer edit. Only requested batches run; a failed batch never spins.
  const layoutBatches = new Map();
  const requestedLayouts = new Set();
  let inFlightLayout = null;
  let loadRevision = 0;
  let saveTimer = null;
  let workerPromise = null;
  let disposed = false;

  const userObjectCount = computed(
    () => objects.value.filter((object) => object.source === 'user').length,
  );

  function setObjects(value) {
    objects.value = Array.isArray(value) ? value : [];
  }

  function isActivePage(value) {
    return samePage(page.value, value);
  }

  function pageKey(value) {
    return `${value.kind}:${value.id}`;
  }

  function failure(
    operation,
    targetPage,
    message,
    { onError } = {},
    action = null,
  ) {
    if (isActivePage(targetPage)) state.error = message;
    // A departed editor cannot consume a failure behind a different document.
    if (onError && isActivePage(targetPage) && onError(message) !== false)
      return;
    notifications.notify({
      key: `folder:${operation}:${pageKey(targetPage)}`,
      title: operation === 'layout' ? '頁面配置未儲存' : '頁面物件操作未完成',
      message,
      tone: 'danger',
      actionLabel: action ? '重試儲存' : '',
      action,
    });
  }

  function recovered(operation, targetPage) {
    notifications.clear(`folder:${operation}:${pageKey(targetPage)}`);
    if (isActivePage(targetPage)) state.error = '';
  }

  function clearSaveTimer() {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  function mergeLocalLayout(entries) {
    const next = [...objects.value];
    for (const entry of entries) {
      const index = next.findIndex((object) => object.key === entry.key);
      const layout = {
        placement: entry.placement,
        pinned: entry.pinned,
        order: entry.order,
      };
      if (index >= 0) {
        next[index] = { ...next[index], ...layout };
      } else if (entry.key.startsWith('derived:')) {
        next.push({
          key: entry.key,
          type: entry.type,
          source: 'derived',
          ...layout,
          rotation: entry.rotation ?? 0,
        });
      }
    }
    objects.value = next;
  }

  async function processSaveQueue() {
    state.saving = true;
    let succeeded = true;
    while (requestedLayouts.size > 0 && !disposed) {
      const key = requestedLayouts.values().next().value;
      requestedLayouts.delete(key);
      const batch = layoutBatches.get(key);
      if (!batch || batch.entries.size === 0) continue;
      const entries = [...batch.entries.values()];
      batch.entries.clear();
      const batchPage = batch.page;
      inFlightLayout = { page: batchPage, entries };
      try {
        await bridge.saveFolderPageLayout({ page: batchPage, entries });
        recovered('layout', batchPage);
        if (batch.entries.size === 0) layoutBatches.delete(key);
      } catch {
        succeeded = false;
        // Newer changes to the same object always win over the failed snapshot.
        batch.entries = new Map([
          ...entries.map((entry) => [entry.key, entry]),
          ...batch.entries,
        ]);
        requestedLayouts.delete(key);
        failure('layout', batchPage, '目前無法儲存頁面物件配置。', {}, () => {
          if (disposed || !layoutBatches.has(key)) return false;
          requestedLayouts.add(key);
          return startWorker();
        });
      } finally {
        inFlightLayout = null;
      }
    }
    state.saving = false;
    return succeeded;
  }

  function startWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = processSaveQueue().finally(() => {
      workerPromise = null;
      if (requestedLayouts.size > 0 && !disposed) void startWorker();
    });
    return workerPromise;
  }

  async function flush() {
    clearSaveTimer();
    for (const key of layoutBatches.keys()) requestedLayouts.add(key);
    if (workerPromise) await workerPromise;
    else if (requestedLayouts.size > 0) await startWorker();
    return layoutBatches.size === 0;
  }

  async function saveLayout(values, { immediate = false } = {}) {
    if (!page.value || disposed || !Array.isArray(values)) return false;
    const entries = values
      .filter((value) => typeof value?.key === 'string')
      .map(layoutEntry);
    if (entries.length === 0) return false;
    mergeLocalLayout(entries);
    const targetPage = { ...page.value };
    const key = pageKey(targetPage);
    let batch = layoutBatches.get(key);
    if (!batch) {
      batch = { page: targetPage, entries: new Map() };
      layoutBatches.set(key, batch);
    }
    for (const entry of entries) batch.entries.set(entry.key, entry);
    requestedLayouts.add(key);
    clearSaveTimer();
    if (immediate || workerPromise) return startWorker();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void startWorker();
    }, delayMs);
    return true;
  }

  async function load(pageValue) {
    const nextPage = pageIdentity(pageValue);
    const revision = ++loadRevision;
    page.value = nextPage;
    setObjects([]);
    freshKeys.value = [];
    state.error = '';
    state.readError = '';
    if (!nextPage || typeof bridge?.listFolderPageObjects !== 'function') {
      state.loading = false;
      return false;
    }

    state.loading = true;
    try {
      const snapshot = await bridge.listFolderPageObjects(nextPage);
      if (revision !== loadRevision) return false;
      setObjects(snapshot);
      const pending = layoutBatches.get(pageKey(nextPage));
      if (samePage(inFlightLayout?.page, nextPage))
        mergeLocalLayout(inFlightLayout.entries);
      if (pending) mergeLocalLayout([...pending.entries.values()]);
      return true;
    } catch {
      if (revision === loadRevision) {
        state.readError = '目前無法讀取頁面物件。';
        state.error = state.readError;
      }
      return false;
    } finally {
      if (revision === loadRevision) state.loading = false;
    }
  }

  // Returns the new photo key, or null when nothing was added.
  async function addPhoto() {
    if (
      !page.value ||
      state.adding ||
      userObjectCount.value >= LIBRARY_FOLDER_USER_OBJECT_LIMIT ||
      typeof bridge?.chooseFolderPagePhoto !== 'function'
    ) {
      return null;
    }
    const activePage = { ...page.value };
    state.adding = true;
    state.error = '';
    try {
      const result = await bridge.chooseFolderPagePhoto(activePage);
      if (!isActivePage(activePage)) return null;
      if (result?.status !== 'added' || !result.object) return null;
      freshKeys.value = [...freshKeys.value, result.object.key];
      setObjects([...objects.value, result.object]);
      recovered('add-photo', activePage);
      return result.object.key;
    } catch {
      failure('add-photo', activePage, '目前無法新增頁面照片。');
      return null;
    } finally {
      state.adding = false;
    }
  }

  // Creates a note from saved editor content; returns its key or null.
  async function addNote(content, feedback) {
    if (
      !page.value ||
      state.adding ||
      userObjectCount.value >= LIBRARY_FOLDER_USER_OBJECT_LIMIT ||
      typeof bridge?.createFolderPageNote !== 'function'
    ) {
      return null;
    }
    const activePage = { ...page.value };
    state.adding = true;
    state.error = '';
    try {
      const note = await bridge.createFolderPageNote({
        page: activePage,
        title: content?.title ?? '',
        text: content?.text ?? '',
        paper: content?.paper ?? '',
      });
      if (!isActivePage(activePage) || !note?.key) return null;
      freshKeys.value = [...freshKeys.value, note.key];
      setObjects([...objects.value, note]);
      recovered('add-note', activePage);
      return note.key;
    } catch {
      failure('add-note', activePage, '目前無法新增頁面便條。', feedback);
      return null;
    } finally {
      state.adding = false;
    }
  }

  async function updateNote(key, content, feedback) {
    const title = content?.title ?? '';
    const text = content?.text ?? '';
    const paper = content?.paper ?? '';
    if (
      !page.value ||
      typeof title !== 'string' ||
      typeof text !== 'string' ||
      typeof bridge?.updateFolderPageNote !== 'function'
    ) {
      return false;
    }
    const activePage = { ...page.value };
    try {
      await bridge.updateFolderPageNote({
        page: activePage,
        key,
        title,
        text,
        paper,
      });
      if (!isActivePage(activePage)) return false;
      objects.value = objects.value.map((object) =>
        object.key === key
          ? { ...object, title, text, ...(paper ? { paper } : {}) }
          : object,
      );
      recovered('update-note', activePage);
      return true;
    } catch {
      failure('update-note', activePage, '目前無法儲存頁面便條。', feedback);
      return false;
    }
  }

  // Main picks the caption paper, so the saved projection replaces the photo.
  async function updatePhotoText(key, content, feedback) {
    const label = content?.label ?? '';
    const captionTitle = content?.captionTitle ?? '';
    const caption = content?.caption ?? '';
    const captionPaper = content?.captionPaper ?? '';
    if (
      !page.value ||
      typeof label !== 'string' ||
      typeof captionTitle !== 'string' ||
      typeof caption !== 'string' ||
      typeof bridge?.updateFolderPagePhotoText !== 'function'
    ) {
      return false;
    }
    const activePage = { ...page.value };
    try {
      const photo = await bridge.updateFolderPagePhotoText({
        page: activePage,
        key,
        label,
        captionTitle,
        caption,
        captionPaper,
      });
      if (!isActivePage(activePage) || photo?.key !== key) return false;
      objects.value = objects.value.map((object) =>
        object.key === key ? { ...object, ...photo } : object,
      );
      recovered('photo-text', activePage);
      return true;
    } catch {
      failure('photo-text', activePage, '目前無法儲存照片文字。', feedback);
      return false;
    }
  }

  async function remove(key, feedback) {
    if (
      !page.value ||
      state.removing ||
      typeof bridge?.removeFolderPageObject !== 'function'
    ) {
      return false;
    }
    const activePage = { ...page.value };
    state.removing = true;
    state.error = '';
    try {
      await flush();
      const snapshot = await bridge.removeFolderPageObject({
        page: activePage,
        key,
      });
      if (!isActivePage(activePage)) return false;
      setObjects(snapshot);
      const batchKey = pageKey(activePage);
      const pending = layoutBatches.get(batchKey);
      pending?.entries.delete(key);
      if (pending?.entries.size === 0) {
        layoutBatches.delete(batchKey);
        requestedLayouts.delete(batchKey);
        recovered('layout', activePage);
      }
      recovered('remove', activePage);
      return true;
    } catch {
      failure('remove', activePage, '目前無法移除頁面物件。', feedback);
      return false;
    } finally {
      state.removing = false;
    }
  }

  function clearError() {
    state.error = '';
  }

  function dispose() {
    disposed = true;
    clearSaveTimer();
    layoutBatches.clear();
    requestedLayouts.clear();
  }

  return {
    page: readonly(page),
    objects: readonly(objects),
    freshKeys: readonly(freshKeys),
    loading: computed(() => state.loading),
    adding: computed(() => state.adding),
    removing: computed(() => state.removing),
    saving: computed(() => state.saving),
    error: computed(() => state.error),
    readError: computed(() => state.readError),
    limitReached: computed(
      () => userObjectCount.value >= LIBRARY_FOLDER_USER_OBJECT_LIMIT,
    ),
    load,
    addPhoto,
    addNote,
    updateNote,
    updatePhotoText,
    saveLayout,
    remove,
    flush,
    clearError,
    dispose,
  };
}

let singleton;

export function useLibraryFolderObjects() {
  singleton ??= createLibraryFolderObjects();
  return singleton;
}
