import { shallowReactive } from 'vue';

const MAX_PARALLEL = 2;
// Bounds memory during long catalog browsing.
const MAX_CACHED = 150;

// Visible rows first, the rest in the background.
export function createCompanionThumbnails({
  getArtwork,
  isLive,
  isPinned = () => false,
  createUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
}) {
  const urls = shallowReactive(new Map());
  const inFlight = new Map();
  // Insertion order is the background order.
  const waiting = new Set();

  function store(id, url) {
    urls.set(id, url);
    for (const [oldId, oldUrl] of urls) {
      if (urls.size <= MAX_CACHED) break;
      if (oldId === id || isPinned(oldId)) continue;
      if (oldUrl) revokeUrl(oldUrl);
      urls.delete(oldId);
    }
  }

  async function fetchOne(id) {
    const request = new AbortController();
    inFlight.set(id, request);
    try {
      const blob = await getArtwork(id, request.signal);
      if (!request.signal.aborted) store(id, blob ? createUrl(blob) : null);
    } catch {
      // Shared thumbnail fallback stays visible.
    } finally {
      if (inFlight.get(id) === request) inFlight.delete(id);
      pump();
    }
  }

  function pump() {
    while (inFlight.size < MAX_PARALLEL && waiting.size && isLive()) {
      const [id] = waiting;
      waiting.delete(id);
      void fetchOne(id);
    }
  }

  function request(id, { urgent = false } = {}) {
    if (!id || urls.has(id) || inFlight.has(id) || !isLive()) return;
    if (urgent) {
      const rest = [...waiting].filter((other) => other !== id);
      waiting.clear();
      waiting.add(id);
      for (const other of rest) waiting.add(other);
    } else {
      waiting.add(id);
    }
    pump();
  }

  function preload(ids) {
    for (const id of ids) request(id);
  }

  function pause() {
    waiting.clear();
    for (const controller of inFlight.values()) controller.abort();
    inFlight.clear();
  }

  function dispose() {
    pause();
    for (const url of urls.values()) if (url) revokeUrl(url);
    urls.clear();
  }

  function withThumbnail(track) {
    const thumbnailUrl = urls.get(track?.id);
    return thumbnailUrl ? { ...track, thumbnailUrl } : track;
  }

  return { request, preload, pause, dispose, withThumbnail };
}
