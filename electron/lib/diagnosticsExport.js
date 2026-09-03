'use strict';

const BUNDLE_VERSION = 1;
const SCHEMA_VERSION = 1;

function emptyLevelCounts() {
  return { debug: 0, info: 0, warning: 0, error: 0 };
}

function countLevels(events) {
  const counts = emptyLevelCounts();
  for (const event of events) {
    if (Object.hasOwn(counts, event?.level)) counts[event.level] += 1;
  }
  return counts;
}

// Events are already normalized/redacted by diagnostics.js's own storage and
// read path (createDiagnosticsService().listRecent()); this only shapes them
// into a single, self-describing support bundle for an explicit user export.
function buildDiagnosticsSupportBundle({
  events,
  appVersion,
  electronVersion,
  exportedAt,
} = {}) {
  const safeEvents = Array.isArray(events) ? events : [];
  return {
    bundleVersion: BUNDLE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt:
      typeof exportedAt === 'string' ? exportedAt : new Date().toISOString(),
    appVersion: typeof appVersion === 'string' ? appVersion : '',
    electronVersion: typeof electronVersion === 'string' ? electronVersion : '',
    eventCount: safeEvents.length,
    levelCounts: countLevels(safeEvents),
    events: safeEvents,
  };
}

module.exports = { buildDiagnosticsSupportBundle };
