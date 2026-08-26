import { readonly, shallowRef } from 'vue';

const OUTPUT_PAGE_IDS = Object.freeze(['workbench', 'gallery', 'settings']);

const activePage = shallowRef('workbench');
const activeKind = shallowRef(null);
const visibleActivePage = readonly(activePage);
const visibleActiveKind = readonly(activeKind);

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

export function useOutputWorkspaceNavigation() {
  return {
    activePage: visibleActivePage,
    activeKind: visibleActiveKind,
    selectPage,
    selectKind,
    ensureAvailableKind,
  };
}
