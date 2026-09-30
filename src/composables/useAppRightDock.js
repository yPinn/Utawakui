import { computed, reactive, readonly, shallowRef } from 'vue';

export const RIGHT_DOCK_SURFACE_METADATA = 'metadata';
export const RIGHT_DOCK_SURFACE_QUEUE = 'queue';
export const RIGHT_DOCK_SURFACE_SEPARATION = 'separation';

const SURFACE_PRIORITY = [
  RIGHT_DOCK_SURFACE_METADATA,
  RIGHT_DOCK_SURFACE_QUEUE,
  RIGHT_DOCK_SURFACE_SEPARATION,
];
const surfaces = reactive({
  [RIGHT_DOCK_SURFACE_METADATA]: false,
  [RIGHT_DOCK_SURFACE_QUEUE]: false,
  [RIGHT_DOCK_SURFACE_SEPARATION]: false,
});
const mountedSurfaces = reactive({
  [RIGHT_DOCK_SURFACE_METADATA]: false,
  [RIGHT_DOCK_SURFACE_QUEUE]: false,
  [RIGHT_DOCK_SURFACE_SEPARATION]: false,
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

  // Remember the last removed surface so the collapsed rail and resize axis
  // can restore it bidirectionally without inventing a new default.
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

  // Metadata's artwork is a direct navigation target, not a toggle for a
  // hidden underlay. Spotify's right rail closes Queue before presenting
  // now-playing details, whether metadata had already been retained beneath
  // Queue or needs to be added now.
  if (
    surface === RIGHT_DOCK_SURFACE_METADATA &&
    topSurface.value !== RIGHT_DOCK_SURFACE_METADATA
  ) {
    mountedSurfaces[RIGHT_DOCK_SURFACE_METADATA] = true;
    surfaces[RIGHT_DOCK_SURFACE_METADATA] = true;
    surfaces[RIGHT_DOCK_SURFACE_QUEUE] = false;
    surfaces[RIGHT_DOCK_SURFACE_SEPARATION] = false;
    lastSurface.value = RIGHT_DOCK_SURFACE_METADATA;
    isExpanded.value = true;
    return;
  }

  // Playback and accompaniment are sibling operator tools. Activating the
  // lower-priority playback list must replace the accompaniment foreground;
  // metadata may remain underneath either one.
  if (
    surface === RIGHT_DOCK_SURFACE_QUEUE &&
    topSurface.value === RIGHT_DOCK_SURFACE_SEPARATION
  ) {
    mountedSurfaces[RIGHT_DOCK_SURFACE_QUEUE] = true;
    surfaces[RIGHT_DOCK_SURFACE_QUEUE] = true;
    surfaces[RIGHT_DOCK_SURFACE_SEPARATION] = false;
    lastSurface.value = RIGHT_DOCK_SURFACE_QUEUE;
    isExpanded.value = true;
    return;
  }

  // A trigger on a physically collapsed Dock always means "show me this
  // surface". It must not remove a surface that merely happens to be retained
  // beneath the collapsed shell.
  if (!isExpanded.value) {
    showSurface(surface);
    return;
  }

  if (surfaces[surface]) {
    hideSurface(surface);
  } else {
    showSurface(surface);
  }
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
