import { reactive, readonly } from 'vue';
import announcement from '../../shared/releaseAnnouncement.json';

// Module-level singleton (same shape as useFeedbackReport.js) so the
// root-level modal and the Settings "重看公告" row share one instance —
// there is only ever one announcement in flight, the one bundled with this
// build. The version/summary text ships inside the app itself and never
// changes for the life of the running process, so only `open` needs to be
// reactive — version/summary are read straight off the static import.
const state = reactive({ open: false });

let initialized = false;

function hasBridge(method) {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.[method] === 'function'
  );
}

// Idempotent: App.vue calls this once on mount, but a second call (e.g. from
// a test) must not re-open a modal the user already dismissed this session.
async function initialize() {
  if (initialized || !hasBridge('getAnnouncementSeenVersion')) return;
  initialized = true;
  try {
    const seenVersion = await window.Utawakui.getAnnouncementSeenVersion();
    if (seenVersion !== announcement.version) state.open = true;
  } catch {
    // Best-effort only — if we can't tell whether this version has been
    // seen, staying quiet is safer than showing the modal on every launch.
  }
}

function dismiss() {
  state.open = false;
  if (!hasBridge('setAnnouncementSeenVersion')) return;
  // Fire-and-forget: worst case on failure is the modal reappears next
  // launch, not lost data.
  window.Utawakui.setAnnouncementSeenVersion(announcement.version).catch(
    () => {},
  );
}

function reopen() {
  state.open = true;
}

export function useAppAnnouncement() {
  return {
    state: readonly(state),
    version: announcement.version,
    summary: announcement.summary,
    initialize,
    dismiss,
    reopen,
  };
}
