'use strict';

const path = require('node:path');
const { loadPlaylists, fillPlaylistReleaseMetadata } = require('../playlists');
const { createWorkOrganizationService } = require('../works/service');
const {
  fetchYoutubeMusicRelease,
  youtubeMusicReleaseObservations,
} = require('./youtubeMusic');

function supportedSource(source) {
  return (
    ['youtube', 'yt-music'].includes(source?.platform) &&
    typeof source.id === 'string' &&
    /^OLAK5uy_[A-Za-z0-9_-]{1,120}$/.test(source.id)
  );
}
function sourceKey(source) {
  return JSON.stringify([source.platform, source.id]);
}
function needsField(collection, field) {
  const info = collection.releaseInfo;
  if (Object.hasOwn(info?.overrides ?? {}, field)) return false;
  const value = info?.observed?.[field]?.value;
  return field === 'type' ? !value || value === 'unknown' : value == null;
}
function candidates(collections) {
  return collections.filter(
    (entry) =>
      entry.kind === 'album' &&
      supportedSource(entry.source) &&
      ['type', 'date'].some((field) => needsField(entry, field)),
  );
}

// Network work never owns the shared library lane. Only local replay, fresh
// candidate reads and short commits enter it, sharing release-edit/import CAS.
function createReleaseMetadataMaintenance({
  getDirectory,
  requireProvider,
  resolveRelease = (source) =>
    fetchYoutubeMusicRelease(source.id, { force: true }),
  notifyChanged = () => {},
  onProgress = () => {},
  recordFailure = () => {},
}) {
  const lane = createWorkOrganizationService({
    getLibraryContext: getDirectory,
    resolveTrack: async () => null,
  });
  const organized = new Set();
  let active = null;

  function current(scope) {
    const now = getDirectory();
    if (
      path.resolve(now.dir) !== path.resolve(scope.dir) ||
      now.epoch !== scope.epoch
    )
      throw Object.assign(new Error('Release metadata library changed'), {
        expected: true,
      });
  }
  function admit(scope) {
    current(scope);
    try {
      requireProvider();
    } catch {
      throw Object.assign(new Error('Release metadata provider disabled'), {
        expected: true,
      });
    }
  }
  function notify(scope, ids) {
    if (!ids.length) return;
    try {
      notifyChanged({ libraryEpoch: scope.epoch, collectionIds: ids });
    } catch {
      /* Saved facts stay saved if the window closes. */
    }
  }
  function publish(job) {
    const snapshot = { libraryEpoch: job.scope.epoch, ...job.result };
    try {
      onProgress(snapshot);
    } catch {
      /* Progress is optional. */
    }
    return snapshot;
  }
  function report(error) {
    try {
      recordFailure(error);
    } catch {
      /* Diagnostics are fail-open. */
    }
  }

  function organizeSaved() {
    return lane.runInLibrary((scope) => {
      const key = JSON.stringify([scope.dir, scope.epoch]);
      if (organized.has(key)) return { updated: 0 };
      const collections = loadPlaylists(scope.dir);
      const facts = new Map();
      for (const entry of collections) {
        if (entry.kind !== 'album' || !supportedSource(entry.source)) continue;
        const key = sourceKey(entry.source);
        if (!facts.has(key))
          facts.set(key, { type: new Map(), date: new Map() });
        for (const field of ['type', 'date']) {
          const fact = entry.releaseInfo?.observed?.[field];
          if (fact && fact.value != null && fact.value !== 'unknown')
            facts.get(key)[field].set(JSON.stringify(fact.value), fact);
        }
      }
      const updates = candidates(collections).map((entry) => {
        const saved = facts.get(sourceKey(entry.source));
        const observed = {};
        for (const field of ['type', 'date'])
          if (saved?.[field].size === 1)
            observed[field] = [...saved[field].values()][0];
        return { collectionId: entry.id, source: entry.source, observed };
      });
      current(scope);
      const ids = fillPlaylistReleaseMetadata(scope.dir, updates);
      organized.add(key);
      notify(scope, ids);
      return { updated: ids.length };
    });
  }

  async function run(job) {
    const updated = new Set();
    try {
      admit(job.scope);
      const groups = await lane.runInLibrary(() => {
        current(job.scope);
        return [
          ...new Map(
            candidates(loadPlaylists(job.scope.dir)).map((entry) => [
              sourceKey(entry.source),
              entry.source,
            ]),
          ).values(),
        ];
      });
      job.result.total = groups.length;
      publish(job);
      for (const source of groups) {
        if (job.cancelled) break;
        admit(job.scope);
        // Another editor may have supplied the missing information already.
        const needed = await lane.runInLibrary(() => {
          current(job.scope);
          return candidates(loadPlaylists(job.scope.dir)).some(
            (entry) => sourceKey(entry.source) === sourceKey(source),
          );
        });
        if (!needed) {
          job.result.completed++;
          publish(job);
          continue;
        }
        if (job.cancelled) break;
        admit(job.scope);
        let release;
        try {
          release = await resolveRelease(source);
        } catch (error) {
          report(error);
          release = {};
        }
        admit(job.scope);
        if (job.cancelled) break;
        await lane.runInLibrary(() => {
          admit(job.scope);
          if (job.cancelled) return;
          const targets = candidates(loadPlaylists(job.scope.dir)).filter(
            (entry) => sourceKey(entry.source) === sourceKey(source),
          );
          const updates = targets.map((entry) => ({
            collectionId: entry.id,
            source,
            observed: youtubeMusicReleaseObservations(
              release,
              source,
              entry.releaseInfo,
            ),
          }));
          const ids = fillPlaylistReleaseMetadata(job.scope.dir, updates);
          ids.forEach((id) => updated.add(id));
          job.result.updated = updated.size;
          if (
            candidates(loadPlaylists(job.scope.dir)).some(
              (entry) => sourceKey(entry.source) === sourceKey(source),
            )
          )
            job.result.unresolved++;
          notify(job.scope, ids);
        });
        job.result.completed++;
        publish(job);
      }
      job.result.status = job.cancelled ? 'cancelled' : 'complete';
    } catch (error) {
      if (!error.expected) report(error);
      job.result.status = 'interrupted';
    }
    return publish(job);
  }

  function refreshFromSources() {
    // Capture before any await. A changed directory never receives an old job.
    const scope = getDirectory();
    if (active) {
      current(active.scope);
      return active.promise;
    }
    const job = {
      scope: { ...scope },
      cancelled: false,
      result: {
        status: 'running',
        total: 0,
        completed: 0,
        updated: 0,
        unresolved: 0,
      },
    };
    active = job;
    job.promise = run(job).finally(() => {
      if (active === job) active = null;
    });
    return job.promise;
  }
  function cancel() {
    if (active) active.cancelled = true;
    return { cancelling: Boolean(active) };
  }
  return { organizeSaved, refreshFromSources, cancel };
}

module.exports = { createReleaseMetadataMaintenance };
