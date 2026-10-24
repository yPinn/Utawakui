'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { createWorkOrganizationService } = require('../works/service');
const { bindingsEqual } = require('../works/trackBinding');
const {
  scanLibrary,
  inspectAudio,
  classifyReleasePairs,
  stamp,
} = require('./scan');
const {
  failure,
  record,
  identifier,
  digest,
  readDocument,
  readSnapshot,
} = require('./documents');
const { applyFieldDecisions, projectFields } = require('./metadata');
const {
  commitDocuments,
  recoverTransaction,
  assertNoTransaction,
} = require('./transaction');
const { reconciliationState } = require('./state');
const {
  mergedCollection,
  chooseSurvivor,
  mergeFields,
  mergeFolderDocument,
} = require('./merge');

const serialize = (value) => JSON.stringify(value, null, 2);
function paging(input) {
  const offset = input.offset ?? 0,
    limit = input.limit ?? 25;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw failure();
  return { offset, limit };
}
function createReconciliationService({
  getDirectory,
  notifyChanged = () => {},
  onProgress = () => {},
  scanOptions = {},
  now = Date.now,
}) {
  const lane = createWorkOrganizationService({
    getLibraryContext: getDirectory,
    resolveTrack: async () => null,
  });
  let active = null,
    result = null,
    generation = 0;
  const previews = new Map();
  const capture = () => {
    const value = getDirectory();
    return { dir: path.resolve(value.dir), epoch: value.epoch, generation };
  };
  function current(scope) {
    const value = capture();
    if (
      value.dir !== scope.dir ||
      value.epoch !== scope.epoch ||
      scope.generation !== generation
    )
      throw failure('RECONCILIATION_STALE');
  }
  function assertDocuments(scope, snapshot) {
    current(scope);
    assertNoTransaction(scope.dir);
    const latest = readSnapshot(scope.dir);
    if (
      latest.playlists.fingerprint !== snapshot.playlists.fingerprint ||
      latest.index.fingerprint !== snapshot.index.fingerprint
    )
      throw failure('RECONCILIATION_CONFLICT');
  }
  function saved(input) {
    if (
      !result ||
      input.scanId !== result.scanId ||
      now() - result.created > 15 * 60 * 1000
    )
      throw failure('RECONCILIATION_EXPIRED');
    current(result.scope);
    return result;
  }
  const publicItem = (item) => {
    const {
      itemId,
      kind,
      title,
      artist,
      leftName,
      rightName,
      leftId,
      rightId,
      mergeable,
      reason,
      trackIds,
      fields,
      dismissed,
    } = item;
    return {
      itemId,
      kind,
      title,
      artist,
      leftName,
      rightName,
      leftId,
      rightId,
      mergeable,
      reason,
      trackIds,
      fields,
      dismissed,
    };
  };
  function page(input) {
    record(input, ['scanId', 'offset', 'limit', 'kind']);
    const value = saved(input);
    const { offset, limit } = paging(input);
    if (
      input.kind !== undefined &&
      !['all', 'release-pair', 'metadata', 'files', 'reviewed'].includes(
        input.kind,
      )
    )
      throw failure();
    const filtered = value.items.filter((i) =>
      input.kind === 'reviewed'
        ? i.dismissed
        : !i.dismissed &&
          (!input.kind ||
            input.kind === 'all' ||
            (input.kind === 'files' &&
              !['release-pair', 'metadata'].includes(i.kind)) ||
            i.kind === input.kind),
    );
    return {
      status: 'ready',
      scanId: value.scanId,
      libraryEpoch: value.scope.epoch,
      total: filtered.length,
      offset,
      items: filtered.slice(offset, offset + limit).map(publicItem),
      summary: {
        tracks: value.scan.tracks.length,
        releases:
          value.scan.collections.length -
          reconciliationState(value.scan.documents.playlists.data)
            .pendingReleases.length,
        candidates: value.items.filter(
          (p) => p.kind === 'release-pair' && p.mergeable && !p.dismissed,
        ).length,
        issues: value.scan.issues.length,
      },
      merges: reconciliationState(value.scan.documents.playlists.data)
        .merges.filter((m) => !m.undone)
        .slice(-25)
        .reverse()
        .map((m) => ({
          mergeId: m.id,
          name: m.before.kept.name,
          createdAt: m.createdAt,
        })),
    };
  }
  function scan(input) {
    if (input !== undefined) throw failure();
    if (active) return active.promise;
    const scope = capture(),
      controller = new AbortController();
    assertNoTransaction(scope.dir);
    result = null;
    previews.clear();
    const job = { scope, controller };
    active = job;
    job.promise = (async () => {
      const value = await scanLibrary(scope.dir, {
        ...scanOptions,
        signal: controller.signal,
        onProgress: (progress) => {
          current(scope);
          onProgress({ libraryEpoch: scope.epoch, ...progress });
        },
      });
      current(scope);
      const state = reconciliationState(value.documents.playlists.data);
      const pairs = value.pairs.map((pair) => ({
        ...pair,
        itemId: crypto.randomUUID(),
        kind: 'release-pair',
        pairKind: pair.kind,
        leftName: value.collections.find((c) => c.id === pair.leftId).name,
        rightName: value.collections.find((c) => c.id === pair.rightId).name,
        dismissed:
          state.decisions.find((d) => d.evidence === pair.evidence)?.action ===
          'dismiss',
      }));
      const metadata = value.tracks
        .filter((t) => t.status === 'present')
        .map((t) => ({
          itemId: crypto.randomUUID(),
          kind: 'metadata',
          title: t.title,
          artist: t.artist,
          trackIds: [t.id],
          fields:
            value.issues.find(
              (i) => i.kind === 'metadata-difference' && i.trackIds[0] === t.id,
            )?.fields ?? [],
        }));
      const issues = value.issues
        .filter((i) => i.kind !== 'metadata-difference')
        .map((i) => ({ ...i, itemId: crypto.randomUUID() }));
      result = {
        scope,
        scanId: crypto.randomUUID(),
        created: now(),
        scan: value,
        items: [...pairs, ...metadata, ...issues],
      };
      return page({ scanId: result.scanId });
    })().finally(() => {
      if (active === job) active = null;
    });
    return job.promise;
  }
  function findItem(input) {
    const value = saved(input);
    const item = value.items.find((i) => i.itemId === input.itemId);
    if (!item) throw failure('RECONCILIATION_EXPIRED');
    return { value, item };
  }
  async function preview(input) {
    record(input, ['scanId', 'itemId']);
    const { value, item } = findItem(input);
    assertDocuments(value.scope, value.scan.documents);
    let projection, detail;
    if (item.kind === 'metadata') {
      const track = value.scan.tracks.find((t) => t.id === item.trackIds[0]);
      projection = {
        kind: 'metadata',
        trackId: track.id,
        title: track.title,
        fields: projectFields(
          track.entry,
          track.observed,
          Object.keys(track.providerValues),
        ),
        fileTags: track.tags,
        providerValues: track.providerValues,
        tagStatus: track.tagStatus,
      };
      detail = { track };
    } else if (item.kind === 'release-pair') {
      const left = value.scan.collections.find((c) => c.id === item.leftId),
        right = value.scan.collections.find((c) => c.id === item.rightId);
      const [kept, retired] = chooseSurvivor(left, right);
      const folder = readDocument(value.scope.dir, 'folder-page-assets.json');
      let assets = { moved: 0 },
        blocked = null;
      if (item.mergeable)
        try {
          assets = mergeFolderDocument(folder, kept.id, retired.id);
        } catch (e) {
          blocked = e.code;
        }
      projection = {
        kind: item.kind,
        mergeable: item.mergeable && !blocked,
        reason: blocked ?? item.reason,
        kept: {
          id: kept.id,
          name: kept.name,
          coverUrl: kept.coverImage
            ? `utawakui-media://playlist-cover/${encodeURIComponent(kept.id)}/${encodeURIComponent(kept.coverImage)}`
            : null,
        },
        retired: { id: retired.id, name: retired.name },
        fields: item.mergeable
          ? mergeFields(kept, retired, mergedCollection(kept, retired))
          : [],
        tracks: kept.trackIds.map((id) => ({
          id,
          title: value.scan.tracks.find((t) => t.id === id)?.title ?? id,
        })),
        movedObjects: assets.moved,
      };
      detail = {
        keptId: kept.id,
        retiredId: retired.id,
        folder,
        mergeable: projection.mergeable,
      };
    } else throw failure();
    current(value.scope);
    const previewId = crypto.randomUUID();
    while (previews.size >= 32) previews.delete(previews.keys().next().value);
    previews.set(previewId, {
      scope: value.scope,
      snapshot: value.scan.documents,
      scan: value.scan,
      item,
      detail,
      created: now(),
    });
    return {
      status: 'ready',
      previewId,
      libraryEpoch: value.scope.epoch,
      ...projection,
    };
  }
  async function assertMedia(p, ids) {
    const pending =
      readDocument(p.scope.dir, 'works.json', { pendingTrackDeletions: {} })
        .data.pendingTrackDeletions ?? {};
    if (Object.values(pending).some((e) => ids.includes(e.trackId)))
      throw failure('RECONCILIATION_CONFLICT');
    for (const id of ids) {
      const track = p.scan.tracks.find((t) => t.id === id);
      if (!track?.file) throw failure('RECONCILIATION_CONFLICT');
      const fresh = await inspectAudio(track.file, p.scope.dir);
      current(p.scope);
      if (
        !bindingsEqual(track.media.binding, fresh.binding) ||
        track.media.stamp !== fresh.stamp
      )
        throw failure('RECONCILIATION_CONFLICT');
    }
    for (const id of ids) {
      const track = p.scan.tracks.find((t) => t.id === id);
      if (stamp(fs.statSync(track.file)) !== track.media.stamp)
        throw failure('RECONCILIATION_CONFLICT');
    }
    const latestPending =
      readDocument(p.scope.dir, 'works.json', { pendingTrackDeletions: {} })
        .data.pendingTrackDeletions ?? {};
    if (
      Object.values(latestPending).some((entry) => ids.includes(entry.trackId))
    )
      throw failure('RECONCILIATION_CONFLICT');
    assertDocuments(p.scope, p.snapshot);
  }
  function notify(scope, ids = []) {
    try {
      notifyChanged({ libraryEpoch: scope.epoch, collectionIds: ids });
    } catch {
      /* A closed window cannot undo saved data. */
    }
  }
  function getPreview(id) {
    const p = previews.get(id);
    if (!p || now() - p.created > 10 * 60 * 1000)
      throw failure('RECONCILIATION_EXPIRED');
    current(p.scope);
    return p;
  }
  function commit(input) {
    record(input, ['previewId', 'decisions', 'mergeChoices']);
    return lane.runInLibrary(async () => {
      const p = getPreview(input.previewId);
      assertDocuments(p.scope, p.snapshot);
      if (p.item.kind === 'metadata') {
        if (input.mergeChoices !== undefined) throw failure();
        await assertMedia(p, [p.detail.track.id]);
        const entry = applyFieldDecisions(
          p.detail.track.entry,
          p.detail.track.observed,
          input.decisions,
          { followFields: Object.keys(p.detail.track.providerValues) },
        );
        const doc = structuredClone(p.snapshot.index.data);
        doc.tracks[p.detail.track.id] = entry;
        commitDocuments(p.scope.dir, [
          {
            filename: 'library.json',
            before: p.snapshot.index.raw,
            after: serialize(doc),
          },
        ]);
        previews.delete(input.previewId);
        notify(p.scope);
        return { status: 'saved', libraryEpoch: p.scope.epoch };
      }
      if (input.decisions !== undefined || !p.detail.mergeable) throw failure();
      const { keptId, retiredId, folder } = p.detail;
      await assertMedia(
        p,
        p.scan.collections.find((c) => c.id === keptId).trackIds,
      );
      const doc = structuredClone(p.snapshot.playlists.data),
        state = reconciliationState(doc);
      const keptIndex = doc.playlists.findIndex((c) => c.id === keptId),
        retiredIndex = doc.playlists.findIndex((c) => c.id === retiredId);
      const retiredPending = retiredIndex < 0;
      const kept = doc.playlists[keptIndex],
        retired = retiredPending
          ? state.pendingReleases.find((c) => c.id === retiredId)
          : doc.playlists[retiredIndex];
      if (!kept || !retired) throw failure('RECONCILIATION_CONFLICT');
      const media = new Map(p.scan.tracks.map((t) => [t.id, t.media]));
      if (!classifyReleasePairs([kept, retired], media)[0]?.mergeable)
        throw failure('RECONCILIATION_CONFLICT');
      const merged = mergedCollection(kept, retired, input.mergeChoices);
      const folders = mergeFolderDocument(folder, keptId, retiredId);
      if (
        readDocument(p.scope.dir, 'folder-page-assets.json').fingerprint !==
        folder.fingerprint
      )
        throw failure('RECONCILIATION_CONFLICT');
      const mergeId = crypto.randomUUID();
      const redirectsBefore = { ...state.redirects };
      state.redirects[retiredId] = keptId;
      doc.playlists = doc.playlists
        .filter((c) => c.id !== retiredId)
        .map((c) => (c.id === keptId ? merged : c));
      state.pendingReleases = state.pendingReleases.filter(
        (c) => c.id !== retiredId,
      );
      state.merges.push({
        id: mergeId,
        createdAt: new Date(now()).toISOString(),
        before: { kept, retired, keptIndex, retiredIndex, retiredPending },
        after: digest(merged),
        redirectsBefore,
        redirectsAfter: digest(state.redirects),
        folderBefore: folder.raw,
        folderAfter: digest(folders.raw ?? 'absent'),
        undone: false,
      });
      if (state.merges.length > 500) throw failure('RECONCILIATION_LIMIT');
      doc.reconciliation = state;
      doc.version = 4;
      const changes = [
        {
          filename: 'playlists.json',
          before: p.snapshot.playlists.raw,
          after: serialize(doc),
        },
      ];
      if (folders.raw !== folder.raw)
        changes.push({
          filename: 'folder-page-assets.json',
          before: folder.raw,
          after: folders.raw,
        });
      if (
        (p.snapshot.playlists.data.version ?? 1) < 4 &&
        p.snapshot.playlists.raw !== null
      )
        fs.copyFileSync(
          path.join(p.scope.dir, 'playlists.json'),
          path.join(
            p.scope.dir,
            `playlists.json.backup-v${p.snapshot.playlists.data.version ?? 1}-${crypto.randomUUID()}`,
          ),
          fs.constants.COPYFILE_EXCL,
        );
      commitDocuments(p.scope.dir, changes);
      previews.delete(input.previewId);
      notify(p.scope, [keptId, retiredId]);
      return {
        status: 'saved',
        mergeId,
        collectionId: keptId,
        libraryEpoch: p.scope.epoch,
      };
    });
  }
  function decide(input) {
    record(input, ['scanId', 'itemId', 'action']);
    if (!['dismiss', 'review'].includes(input.action)) throw failure();
    return lane.runInLibrary(() => {
      const { value, item } = findItem(input);
      if (item.kind !== 'release-pair') throw failure();
      assertDocuments(value.scope, value.scan.documents);
      const doc = structuredClone(value.scan.documents.playlists.data),
        state = reconciliationState(doc);
      state.decisions = state.decisions.filter(
        (d) => d.evidence !== item.evidence,
      );
      if (input.action === 'dismiss')
        state.decisions.push({ evidence: item.evidence, action: 'dismiss' });
      if (input.action === 'dismiss') {
        const publish = state.pendingReleases.filter((entry) =>
          [item.leftId, item.rightId].includes(entry.id),
        );
        if (doc.playlists.length + publish.length > 500)
          throw failure('RECONCILIATION_LIMIT');
        doc.playlists.push(...publish);
        state.pendingReleases = state.pendingReleases.filter(
          (entry) => !publish.includes(entry),
        );
      }
      if (state.decisions.length > 5000) throw failure('RECONCILIATION_LIMIT');
      doc.reconciliation = state;
      commitDocuments(value.scope.dir, [
        {
          filename: 'playlists.json',
          before: value.scan.documents.playlists.raw,
          after: serialize(doc),
        },
      ]);
      notify(value.scope);
      return { status: 'saved', libraryEpoch: value.scope.epoch };
    });
  }
  function undo(input) {
    record(input, ['mergeId', 'libraryEpoch']);
    identifier(input.mergeId);
    const scope = capture();
    if (input.libraryEpoch !== scope.epoch)
      throw failure('RECONCILIATION_STALE');
    return lane.runInLibrary(() => {
      current(scope);
      assertNoTransaction(scope.dir);
      const documents = readSnapshot(scope.dir),
        doc = structuredClone(documents.playlists.data),
        state = reconciliationState(doc);
      const receipt = state.merges.find(
        (m) => m.id === input.mergeId && !m.undone,
      );
      if (!receipt) throw failure('RECONCILIATION_EXPIRED');
      const index = doc.playlists.findIndex(
        (c) => c.id === receipt.before.kept.id,
      );
      const folder = readDocument(scope.dir, 'folder-page-assets.json');
      if (
        index < 0 ||
        digest(doc.playlists[index]) !== receipt.after ||
        digest(state.redirects) !== receipt.redirectsAfter ||
        digest(folder.raw ?? 'absent') !== receipt.folderAfter ||
        doc.playlists.some((c) => c.id === receipt.before.retired.id)
      )
        throw failure('RECONCILIATION_CONFLICT');
      doc.playlists[index] = receipt.before.kept;
      if (receipt.before.retiredPending)
        state.pendingReleases.push(receipt.before.retired);
      else
        doc.playlists.splice(
          Math.min(receipt.before.retiredIndex, doc.playlists.length),
          0,
          receipt.before.retired,
        );
      state.redirects = receipt.redirectsBefore;
      receipt.undone = true;
      doc.reconciliation = state;
      const changes = [
        {
          filename: 'playlists.json',
          before: documents.playlists.raw,
          after: serialize(doc),
        },
      ];
      if (folder.raw !== receipt.folderBefore)
        changes.push({
          filename: 'folder-page-assets.json',
          before: folder.raw,
          after: receipt.folderBefore,
        });
      commitDocuments(scope.dir, changes);
      notify(scope, [receipt.before.kept.id, receipt.before.retired.id]);
      return { status: 'saved', libraryEpoch: scope.epoch };
    });
  }
  function cancel() {
    active?.controller.abort();
    return { status: 'cancelling' };
  }
  function invalidate() {
    cancel();
    generation++;
    previews.clear();
    result = null;
  }
  function recover() {
    return lane.runInLibrary((scope) => {
      const outcome = recoverTransaction(scope.dir);
      if (outcome.recovered) notify(scope);
      return outcome;
    });
  }
  return {
    scan,
    page,
    preview,
    commit,
    decide,
    undo,
    cancel,
    invalidate,
    recover,
  };
}

module.exports = { createReconciliationService };
