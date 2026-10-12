import { computed, reactive, readonly, shallowRef } from 'vue';

export const RIGHT_DOCK_SURFACE_METADATA = 'metadata';
export const RIGHT_DOCK_SURFACE_QUEUE = 'queue';
export const RIGHT_DOCK_SURFACE_PREPARATION = 'preparation';

const SURFACE_PRIORITY = [
  RIGHT_DOCK_SURFACE_METADATA,
  RIGHT_DOCK_SURFACE_QUEUE,
  RIGHT_DOCK_SURFACE_PREPARATION,
];
const surfaces = reactive({
  [RIGHT_DOCK_SURFACE_METADATA]: false,
  [RIGHT_DOCK_SURFACE_QUEUE]: false,
  [RIGHT_DOCK_SURFACE_PREPARATION]: false,
});
const mountedSurfaces = reactive({
  [RIGHT_DOCK_SURFACE_METADATA]: false,
  [RIGHT_DOCK_SURFACE_QUEUE]: false,
  [RIGHT_DOCK_SURFACE_PREPARATION]: false,
});
const isExpanded = shallowRef(false);
const lastSurface = shallowRef(null);

const hasSurfaces = computed(() =>
  SURFACE_PRIORITY.some((surface) => surfaces[surface]),
);
const topSurface = computed(() => {
  for (let index = SURFACE_PRIORITY.length - 1; index >= 0; index -= 1) {
    const surface = SURFACE_PRIORITY[index];
    if (surfaces[surface]) return surface;
  }
  return null;
});

function assertSurface(surface) {
  if (!SURFACE_PRIORITY.includes(surface)) {
    throw new RangeError(`Unknown right dock surface: ${surface}`);
  }
}

function showSurface(surface) {
  assertSurface(surface);
  mountedSurfaces[surface] = true;
  surfaces[surface] = true;
  lastSurface.value = surface;
  isExpanded.value = true;
}

function hideSurface(surface) {
  assertSurface(surface);
  if (!surfaces[surface]) return;

  surfaces[surface] = false;
  if (hasSurfaces.value) {
    lastSurface.value = topSurface.value;
    return;
  }

  // Remember the last removed surface so the collapsed restore control can
  // reopen it without inventing a new default.
  lastSurface.value = surface;
  isExpanded.value = false;
}

function forgetSurface(surface) {
  assertSurface(surface);
  const wasLastSurface = lastSurface.value === surface;
  surfaces[surface] = false;
  mountedSurfaces[surface] = false;

  if (hasSurfaces.value) {
    lastSurface.value = topSurface.value;
    return;
  }

  if (wasLastSurface) lastSurface.value = null;
  isExpanded.value = false;
}

function toggleSurface(surface) {
  assertSurface(surface);

  // A surface trigger is direct navigation. Bring that surface to the front
  // and dismiss only higher-priority layers; lower layers remain available
  // when the foreground closes. A trigger on a physically collapsed Dock
  // likewise means "show me this surface", never remove a retained layer.
  if (!isExpanded.value || topSurface.value !== surface) {
    const surfaceIndex = SURFACE_PRIORITY.indexOf(surface);
    for (
      let index = surfaceIndex + 1;
      index < SURFACE_PRIORITY.length;
      index += 1
    ) {
      surfaces[SURFACE_PRIORITY[index]] = false;
    }
    showSurface(surface);
    return;
  }

  hideSurface(surface);
}

function setExpanded(expanded) {
  if (!expanded) {
    isExpanded.value = false;
    return;
  }

  if (hasSurfaces.value) {
    isExpanded.value = true;
    return;
  }

  if (lastSurface.value) showSurface(lastSurface.value);
}

function toggleExpanded() {
  setExpanded(!isExpanded.value);
}

export function useAppRightDock() {
  return {
    surfaces: readonly(surfaces),
    mountedSurfaces: readonly(mountedSurfaces),
    isExpanded: readonly(isExpanded),
    hasSurfaces,
    topSurface,
    lastSurface: readonly(lastSurface),
    showSurface,
    hideSurface,
    forgetSurface,
    toggleSurface,
    setExpanded,
    toggleExpanded,
  };
}
