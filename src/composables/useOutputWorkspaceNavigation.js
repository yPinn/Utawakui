import { readonly, shallowRef } from 'vue';

const OUTPUT_PAGE_IDS = Object.freeze(['workbench', 'gallery', 'settings']);
const OUTPUT_PREVIEW_BACKDROP_IDS = Object.freeze(['checker', 'dark', 'light']);

const activePage = shallowRef('workbench');
const activeKind = shallowRef(null);
const previewBackdrop = shallowRef('checker');
const showLyricsGuide = shallowRef(true);
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
