'use strict';

const contractValues = require('../../shared/outputContractValues.json');
const {
  createEmptyOutputSnapshot,
  parseOutputSnapshot,
} = require('../../shared/outputContract');
const {
  assembleOutputSnapshotV2,
  parseOutputStreamEnvelope,
} = require('../../shared/outputStreamContract');

const OUTPUT_PROJECTION_CONTRACT_VERSION =
  contractValues.projectionEnvelopeVersion;
const OUTPUT_PROJECTION_KINDS = new Set(['full', 'update']);
const MAX_ID_LENGTH = 200;

function invalid(path, reason) {
  throw new TypeError(`Invalid output projection ${path}: ${reason}`);
}

function requireRecord(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value;
}

function requireId(value, path) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ID_LENGTH
  ) {
    invalid(path, `expected a non-empty string up to ${MAX_ID_LENGTH} chars`);
  }
  return value;
}

function parseOutputProjectionEnvelope(value, expectedBootId) {
  const envelope = requireRecord(value, 'root');
  if (envelope.contractVersion !== OUTPUT_PROJECTION_CONTRACT_VERSION) {
    invalid(
      'contractVersion',
      `expected ${OUTPUT_PROJECTION_CONTRACT_VERSION}`,
    );
  }
  const bootId = requireId(envelope.bootId, 'bootId');
  if (bootId !== expectedBootId) invalid('bootId', 'stale app lifetime');
  const sourceEpoch = requireId(envelope.sourceEpoch, 'sourceEpoch');
  if (!OUTPUT_PROJECTION_KINDS.has(envelope.kind)) {
    invalid('kind', 'expected full or update');
  }
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) {
    invalid('revision', 'expected a non-negative safe integer');
  }
  const payload = parseOutputSnapshot(envelope.payload);
  if (payload.revision !== envelope.revision) {
    invalid('revision', 'must match payload.revision');
  }
  return {
    contractVersion: OUTPUT_PROJECTION_CONTRACT_VERSION,
    bootId,
    sourceEpoch,
    kind: envelope.kind,
    revision: envelope.revision,
    payload,
  };
}

function createOutputProjectionHub({ bootId, onChange = () => {} }) {
  requireId(bootId, 'bootId');
  const seenEpochs = new Set();
  const contentRevisionsByEpoch = new Map();
  const lyricsDocuments = new Map();
  const queueDocuments = new Map();
  let activeSourceId = null;
  let compatibilityRevision = 0;
  let projection = {
    bootId,
    sourceEpoch: null,
    sourceSynchronization: 'unavailable',
    unavailableReason: 'renderer_not_connected',
    revision: 0,
    snapshot: createEmptyOutputSnapshot({ revision: 0 }),
    streams: null,
  };

  function getProjection() {
    return structuredClone(projection);
  }

  function updateProjection(changes) {
    projection = { ...projection, ...changes };
    onChange(getProjection());
  }

  function getStatus() {
    const status = { ...projection };
    delete status.snapshot;
    delete status.streams;
    return status;
  }

  function connectSource(sourceId) {
    requireId(sourceId, 'sourceId');
    if (
      activeSourceId === sourceId &&
      projection.sourceSynchronization === 'ready'
    ) {
      return getStatus();
    }
    activeSourceId = sourceId;
    updateProjection({
      sourceEpoch: null,
      sourceSynchronization: 'syncing',
      unavailableReason: null,
      revision: 0,
      snapshot: createEmptyOutputSnapshot({ revision: 0 }),
      streams: null,
    });
    return getStatus();
  }

  function markUnavailable(reason = 'renderer_unavailable', sourceId = null) {
    if (sourceId !== null && sourceId !== activeSourceId) return false;
    activeSourceId = null;
    updateProjection({
      sourceEpoch: null,
      sourceSynchronization: 'unavailable',
      unavailableReason: reason,
      revision: 0,
      snapshot: createEmptyOutputSnapshot({ revision: 0 }),
      streams: null,
    });
    return true;
  }

  function publishLegacy(value) {
    const envelope = parseOutputProjectionEnvelope(value, bootId);
    const isCurrentEpoch = envelope.sourceEpoch === projection.sourceEpoch;

    if (envelope.kind === 'full') {
      if (seenEpochs.has(envelope.sourceEpoch)) return false;
      seenEpochs.add(envelope.sourceEpoch);
    } else if (
      projection.sourceSynchronization !== 'ready' ||
      !isCurrentEpoch ||
      envelope.revision <= projection.revision
    ) {
      return false;
    }

    compatibilityRevision = envelope.revision;
    updateProjection({
      sourceEpoch: envelope.sourceEpoch,
      sourceSynchronization: 'ready',
      unavailableReason: null,
      revision: envelope.revision,
      snapshot: envelope.payload,
      streams: null,
    });
    return true;
  }

  function contentRevisionState(sourceEpoch) {
    let state = contentRevisionsByEpoch.get(sourceEpoch);
    if (!state) {
      state = { lyrics: -1, queue: -1 };
      contentRevisionsByEpoch.set(sourceEpoch, state);
    }
    return state;
  }

  function publishContent(envelope) {
    if (
      seenEpochs.has(envelope.sourceEpoch) &&
      envelope.sourceEpoch !== projection.sourceEpoch
    ) {
      return false;
    }
    const kind = envelope.stream === 'lyrics.document' ? 'lyrics' : 'queue';
    const revisions = contentRevisionState(envelope.sourceEpoch);
    if (
      envelope.revision <= revisions[kind] ||
      (envelope.kind === 'update' && revisions[kind] < 0)
    ) {
      return false;
    }
    const document = envelope.payload.document;
    const cache = kind === 'lyrics' ? lyricsDocuments : queueDocuments;
    cache.clear();
    if (document) {
      cache.set(document.documentId, {
        revision: envelope.revision,
        document,
      });
    }
    revisions[kind] = envelope.revision;
    return true;
  }

  function resolveDocument(reference, cache) {
    if (reference.documentId === null) return null;
    const entry = cache.get(reference.documentId);
    return entry?.revision === reference.documentRevision ? entry : null;
  }

  function publishState(envelope) {
    const isCurrentEpoch = envelope.sourceEpoch === projection.sourceEpoch;
    const currentStateRevision = projection.streams?.state?.revision ?? -1;
    if (envelope.kind === 'full') {
      if (seenEpochs.has(envelope.sourceEpoch)) return false;
    } else if (
      projection.sourceSynchronization !== 'ready' ||
      !isCurrentEpoch ||
      envelope.revision <= currentStateRevision
    ) {
      return false;
    }

    const lyrics = resolveDocument(envelope.payload.lyrics, lyricsDocuments);
    const queue = resolveDocument(envelope.payload.queue, queueDocuments);
    if ((envelope.payload.lyrics.documentId !== null && !lyrics) || !queue) {
      return false;
    }

    const contentRevisions = contentRevisionState(envelope.sourceEpoch);
    contentRevisions.lyrics = Math.max(
      contentRevisions.lyrics,
      envelope.payload.lyrics.documentRevision,
    );
    contentRevisions.queue = Math.max(
      contentRevisions.queue,
      envelope.payload.queue.documentRevision,
    );
    if (envelope.kind === 'full') seenEpochs.add(envelope.sourceEpoch);
    compatibilityRevision += 1;
    const snapshot = assembleOutputSnapshotV2({
      revision: compatibilityRevision,
      dynamic: envelope.payload,
      lyricsDocument: lyrics?.document ?? null,
      queueDocument: queue.document,
    });
    updateProjection({
      sourceEpoch: envelope.sourceEpoch,
      sourceSynchronization: 'ready',
      unavailableReason: null,
      revision: compatibilityRevision,
      snapshot,
      streams: {
        lyrics,
        queue,
        state: { revision: envelope.revision, payload: envelope.payload },
      },
    });
    return true;
  }

  function publish(value, sourceId) {
    if (sourceId !== activeSourceId) return false;
    if (value?.stream) {
      const envelope = parseOutputStreamEnvelope(value, bootId);
      return envelope.stream === 'state.snapshot'
        ? publishState(envelope)
        : publishContent(envelope);
    }
    return publishLegacy(value);
  }

  return {
    connectSource,
    getProjection,
    getStatus,
    markUnavailable,
    publish,
  };
}

module.exports = {
  OUTPUT_PROJECTION_CONTRACT_VERSION,
  createOutputProjectionHub,
  parseOutputProjectionEnvelope,
};
