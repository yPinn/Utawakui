'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson } = require('../atomicWrite');
const { loadTrackLyricsTiming } = require('./lyricsTiming');
const { isLyricsSubtitleFilename } = require('./paths');
const values = require('../../../shared/lyricsTimingValues.json');

function vocalRolesPath(trackDir, filename) {
  if (!isLyricsSubtitleFilename(filename) || filename.length > 240)
    throw new Error('invalid lyrics source');
  return path.join(trackDir, 'lyrics', 'vocal-roles', `${filename}.json`);
}
function sourceIdentity(trackDir, filename, documentId) {
  vocalRolesPath(trackDir, filename);
  const timing = loadTrackLyricsTiming(trackDir, filename);
  if (
    !timing.sourceFingerprint ||
    typeof documentId !== 'string' ||
    documentId.length > values.maxIdLength
  )
    throw new Error('lyrics source unavailable');
  const saved = timing.status === 'current' ? timing.document : null;
  if (
    saved
      ? saved.documentId !== documentId
      : !new RegExp(`^lyr_${timing.sourceFingerprint}_[a-z0-9]{7}$`, 'u').test(
          documentId,
        )
  )
    throw new Error('lyrics source changed');
  return { sha256: timing.sourceFingerprint, documentId, saved };
}
function assignmentsFor(raw, identity) {
  if (!Array.isArray(raw) || raw.length > values.maxLines)
    throw new Error('invalid vocal assignments');
  const seen = new Set();
  const lines = new Map(
    identity.saved?.lines.map((line) => [line.lineId, line]) ?? [],
  );
  return raw.map((entry) => {
    if (
      !entry ||
      Object.keys(entry).sort().join(',') !== 'lineId,role,scope' ||
      typeof entry.lineId !== 'string' ||
      entry.lineId.length > values.maxIdLength ||
      seen.has(entry.lineId) ||
      !['male', 'female', 'group'].includes(entry.role) ||
      !['line', 'section'].includes(entry.scope)
    )
      throw new Error('invalid vocal assignment');
    const line = lines.get(entry.lineId);
    if (
      identity.saved
        ? !line
        : !(
            entry.lineId.startsWith(`${identity.documentId}_l_`) &&
            /^[0-9a-z]{1,3}$/u.test(
              entry.lineId.slice(identity.documentId.length + 3),
            ) &&
            parseInt(entry.lineId.slice(identity.documentId.length + 3), 36) <
              values.maxLines
          )
    )
      throw new Error('unknown lyrics line');
    if (
      entry.scope === 'section' &&
      line &&
      !/^(?:\([^()\r\n]{1,40}\)|（[^（）\r\n]{1,40}）|\[[^\]\r\n]{1,40}\]|【[^】\r\n]{1,40}】)$/u.test(
        line.text.trim(),
      )
    )
      throw new Error('section requires a standalone marker');
    seen.add(entry.lineId);
    return { lineId: entry.lineId, role: entry.role, scope: entry.scope };
  });
}
function readStored(file, identity) {
  let raw;
  try {
    if (fs.statSync(file).size > values.maxDocumentBytes)
      throw new Error('oversized vocal roles');
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT')
      return { status: 'missing', revision: 0, assignments: [] };
    throw error;
  }
  if (
    raw.version !== 1 ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1
  )
    throw new Error('invalid vocal roles');
  if (raw.sha256 !== identity.sha256 || raw.documentId !== identity.documentId)
    return { status: 'stale', revision: 0, assignments: [] };
  return {
    status: 'current',
    revision: raw.revision,
    assignments: assignmentsFor(raw.assignments, identity),
  };
}
function loadTrackVocalRoles(trackDir, filename, documentId) {
  const identity = sourceIdentity(trackDir, filename, documentId);
  return readStored(vocalRolesPath(trackDir, filename), identity);
}
function saveTrackVocalRoles(
  trackDir,
  filename,
  documentId,
  baseRevision,
  assignments,
) {
  const identity = sourceIdentity(trackDir, filename, documentId),
    file = vocalRolesPath(trackDir, filename);
  const previous = readStored(file, identity);
  if (
    !Number.isSafeInteger(baseRevision) ||
    baseRevision !== previous.revision ||
    baseRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error('vocal roles changed; reload first');
  const rows = assignmentsFor(assignments, identity);
  const result = {
    version: 1,
    sha256: identity.sha256,
    documentId,
    revision: baseRevision + 1,
    assignments: rows,
  };
  if (Buffer.byteLength(JSON.stringify(result)) > values.maxDocumentBytes)
    throw new Error('vocal roles too large');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteJson(file, result);
  return { status: 'current', revision: result.revision, assignments: rows };
}
function deleteTrackVocalRoles(trackDir, filename) {
  const file = vocalRolesPath(trackDir, filename);
  try {
    fs.rmSync(file, { force: true });
    return true;
  } catch {
    return false;
  }
}
module.exports = {
  loadTrackVocalRoles,
  saveTrackVocalRoles,
  deleteTrackVocalRoles,
  vocalRolesPath,
};
