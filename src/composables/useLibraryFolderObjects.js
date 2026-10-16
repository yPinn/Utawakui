import { computed, reactive, readonly, shallowRef } from 'vue';

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
  });
  // One pending layout per page object; the latest edit wins.
  const pendingEntries = new Map();
  let pendingPage = null;
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
    while (pendingEntries.size > 0 && !disposed) {
      const batchPage = pendingPage;
      const entries = [...pendingEntries.values()];
      pendingEntries.clear();
      try {
        await bridge?.saveFolderPageLayout?.({ page: batchPage, entries });
      } catch {
        succeeded = false;
        state.error = '目前無法儲存頁面物件配置。';
      }
    }
    state.saving = false;
    return succeeded;
  }

  function startWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = processSaveQueue().finally(() => {
      workerPromise = null;
      if (pendingEntries.size > 0 && !disposed) void startWorker();
    });
    return workerPromise;
  }

  async function flush() {
    clearSaveTimer();
    if (workerPromise) {
      await workerPromise;
      return pendingEntries.size > 0 ? flush() : state.error === '';
    }
    if (pendingEntries.size > 0) return startWorker();
    return state.error === '';
  }

  async function saveLayout(values, { immediate = false } = {}) {
    if (!page.value || disposed || !Array.isArray(values)) return false;
    const entries = values
      .filter((value) => typeof value?.key === 'string')
      .map(layoutEntry);
    if (entries.length === 0) return false;
    if (pendingPage && !isActivePage(pendingPage)) await flush();
    mergeLocalLayout(entries);
    pendingPage = { ...page.value };
    for (const entry of entries) pendingEntries.set(entry.key, entry);
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
    if (!nextPage || typeof bridge?.listFolderPageObjects !== 'function') {
      state.loading = false;
      return false;
    }

    state.loading = true;
    try {
      const snapshot = await bridge.listFolderPageObjects(nextPage);
      if (revision !== loadRevision) return false;
      setObjects(snapshot);
      return true;
    } catch {
      if (revision === loadRevision) state.error = '目前無法讀取頁面物件。';
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
      return result.object.key;
    } catch {
      state.error = '目前無法新增頁面照片。';
      return null;
    } finally {
      state.adding = false;
    }
  }

  // Creates a note from saved editor content; returns its key or null.
  async function addNote(content) {
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
      return note.key;
    } catch {
      state.error = '目前無法新增頁面便條。';
      return null;
    } finally {
      state.adding = false;
    }
  }

  async function updateNote(key, content) {
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
    objects.value = objects.value.map((object) =>
      object.key === key
        ? { ...object, title, text, ...(paper ? { paper } : {}) }
        : object,
    );
    try {
      await bridge.updateFolderPageNote({
        page: activePage,
        key,
        title,
        text,
        paper,
      });
      return true;
    } catch {
      state.error = '目前無法儲存頁面便條。';
      return false;
    }
  }

  // Main picks the caption paper, so the saved projection replaces the photo.
  async function updatePhotoText(key, content) {
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
      return true;
    } catch {
      state.error = '目前無法儲存照片文字。';
      return false;
    }
  }

  async function remove(key) {
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
      return true;
    } catch {
      state.error = '目前無法移除頁面物件。';
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
    pendingEntries.clear();
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
