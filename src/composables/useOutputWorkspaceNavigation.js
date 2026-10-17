import { readonly, shallowRef } from 'vue';

const OUTPUT_PAGE_IDS = Object.freeze(['workbench', 'gallery']);
const OUTPUT_PREVIEW_BACKDROP_IDS = Object.freeze(['checker', 'dark', 'light']);

const activePage = shallowRef('workbench');
const activeKind = shallowRef(null);
const previewBackdrop = shallowRef('checker');
const showLyricsGuide = shallowRef(true);
// A null preference lets the layout use its CSS default. Both modes share it.
const sideWidth = shallowRef(null);
const sideCollapsed = shallowRef(false);
const compactSideOpen = shallowRef(false);
const visibleActivePage = readonly(activePage);
const visibleActiveKind = readonly(activeKind);
const visiblePreviewBackdrop = readonly(previewBackdrop);
const visibleShowLyricsGuide = readonly(showLyricsGuide);

function selectPage(page) {
  if (!OUTPUT_PAGE_IDS.includes(page)) return false;
  activePage.value = page;
  return true;
}

function selectKind(kind, availableKinds) {
  if (!Array.isArray(availableKinds) || !availableKinds.includes(kind)) {
    return false;
  }
  activeKind.value = kind;
  return true;
}

function ensureAvailableKind(availableKinds) {
  if (!Array.isArray(availableKinds)) return activeKind.value;
  if (availableKinds.includes(activeKind.value)) return activeKind.value;

  activeKind.value =
    availableKinds.find((kind) => typeof kind === 'string' && kind) ?? null;
  return activeKind.value;
}

function selectPreviewBackdrop(backdrop) {
  if (!OUTPUT_PREVIEW_BACKDROP_IDS.includes(backdrop)) return false;
  previewBackdrop.value = backdrop;
  return true;
}

function setLyricsGuideVisible(visible) {
  showLyricsGuide.value = visible === true;
  return true;
}

export function useOutputWorkspaceNavigation() {
  return {
    sideWidth: readonly(sideWidth),
    sideCollapsed: readonly(sideCollapsed),
    compactSideOpen: readonly(compactSideOpen),
    setSideWidth(value) {
      if (value !== null && (!Number.isFinite(value) || value <= 0))
        return false;
      sideWidth.value = value;
      return true;
    },
    setSideCollapsed(value) {
      if (typeof value !== 'boolean') return false;
      sideCollapsed.value = value;
      return true;
    },
    setCompactSideOpen(value) {
      if (typeof value !== 'boolean') return false;
      compactSideOpen.value = value;
      return true;
    },
    activePage: visibleActivePage,
    activeKind: visibleActiveKind,
    previewBackdrop: visiblePreviewBackdrop,
    showLyricsGuide: visibleShowLyricsGuide,
    selectPage,
    selectKind,
    ensureAvailableKind,
    selectPreviewBackdrop,
    setLyricsGuideVisible,
  };
}
