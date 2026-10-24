'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  failure,
  record,
  identifier,
  digest,
  readDocument,
} = require('../reconciliation/documents');
const JOURNAL = 'library-tags-journal.json';
const BACKUPS = '.utawakui-tags';
const FILES = new Set([
  'library.json',
  'playlists.json',
  'works.json',
  'tag-writebacks.json',
]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
async function readTagAudio(file) {
  regular(file);
  const handle = await fs.promises.open(file, 'r');
  try {
    const initial = await handle.stat();
    if (
      !initial.isFile() ||
      initial.nlink !== 1 ||
      initial.size < 1 ||
      initial.size > 256 * 1024 ** 2
    )
      throw failure('TAGS_LIMIT');
    const bytes = Buffer.alloc(initial.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    const after = await handle.stat(),
      current = regular(file);
    if (
      size !== initial.size ||
      [after, current].some((s) =>
        ['size', 'dev', 'ino', 'mtimeMs', 'ctimeMs'].some(
          (k) => s[k] !== initial[k],
        ),
      )
    )
      throw failure('RECONCILIATION_CONFLICT');
    return bytes.subarray(0, size);
  } finally {
    await handle.close();
  }
}
function assertNoTagTransaction(dir) {
  if (fs.existsSync(path.join(dir, JOURNAL)))
    throw failure('RECONCILIATION_RECOVERY_REQUIRED');
}
function regular(file, directory = false) {
  const stat = fs.lstatSync(file);
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
  )
    throw failure('TAGS_UNSUPPORTED');
  return stat;
}
function managedPath(dir, trackId) {
  identifier(trackId);
  const root = path.resolve(dir);
  for (const folder of [
    root,
    path.join(root, 'tracks'),
    path.join(root, 'tracks', trackId),
  ])
    regular(folder, true);
  const file = path.join(root, 'tracks', trackId, 'audio.flac');
  regular(file);
  return file;
}
function backupPath(dir, id, filename) {
  if (!UUID.test(id) || !['original.flac', 'staged.flac'].includes(filename))
    throw failure();
  const root = path.join(dir, BACKUPS);
  regular(root, true);
  const folder = path.join(root, id);
  regular(folder, true);
  return path.join(folder, filename);
}
function fileHash(file) {
  const stat = regular(file);
  if (!stat.size || stat.size > 256 * 1024 ** 2) throw failure('TAGS_LIMIT');
  const hash = crypto.createHash('sha256'),
    buffer = Buffer.alloc(1024 * 1024),
    fd = fs.openSync(file, 'r');
  try {
    let size = 0,
      count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) {
      size += count;
      if (size > stat.size) throw failure('RECONCILIATION_CONFLICT');
      hash.update(buffer.subarray(0, count));
    }
    if (size !== stat.size) throw failure('RECONCILIATION_CONFLICT');
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}
function durableWrite(file, bytes) {
  if (fs.existsSync(file)) regular(file);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`,
    fd = fs.openSync(temporary, 'wx');
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
}
function documentRaw(dir, filename) {
  if (fs.existsSync(path.join(dir, filename)))
    regular(path.join(dir, filename));
  return readDocument(dir, filename).raw;
}
function validateJournal(journal) {
  record(journal, [
    'version',
    'id',
    'trackId',
    'beforeHash',
    'afterHash',
    'phase',
    'changes',
  ]);
  identifier(journal.trackId);
  if (
    journal.version !== 1 ||
    !UUID.test(journal.id) ||
    !HASH.test(journal.beforeHash) ||
    !HASH.test(journal.afterHash) ||
    !['prepared', 'media-installed', 'references-committed'].includes(
      journal.phase,
    ) ||
    !Array.isArray(journal.changes) ||
    !journal.changes.length ||
    journal.changes.length > FILES.size ||
    new Set(journal.changes.map((c) => c.filename)).size !==
      journal.changes.length
  )
    throw failure();
  for (const c of journal.changes) {
    record(c, ['filename', 'before', 'after']);
    if (!FILES.has(c.filename)) throw failure();
    for (const raw of [c.before, c.after])
      if (raw !== null) {
        if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16 * 1024 ** 2)
          throw failure('TAGS_LIMIT');
        record(JSON.parse(raw));
      }
  }
  if (Buffer.byteLength(JSON.stringify(journal)) > 32 * 1024 ** 2)
    throw failure('TAGS_LIMIT');
}
function installDocuments(dir, changes) {
  for (const c of changes) {
    if (documentRaw(dir, c.filename) === c.after) continue;
    if (c.after === null)
      fs.rmSync(path.join(dir, c.filename), { force: true });
    else durableWrite(path.join(dir, c.filename), c.after);
  }
}
function finish(dir, journal, afterPhase = () => {}) {
  const file = managedPath(dir, journal.trackId);
  const backup = backupPath(dir, journal.id, 'original.flac');
  const staged = backupPath(dir, journal.id, 'staged.flac');
  const current = fileHash(file);
  if (
    ![journal.beforeHash, journal.afterHash].includes(current) ||
    fileHash(backup) !== journal.beforeHash
  )
    throw failure('RECONCILIATION_RECOVERY_CONFLICT');
  for (const c of journal.changes) {
    const raw = documentRaw(dir, c.filename);
    if (raw !== c.before && raw !== c.after)
      throw failure('RECONCILIATION_RECOVERY_CONFLICT');
  }
  if (current !== journal.afterHash) {
    if (fileHash(staged) !== journal.afterHash)
      throw failure('RECONCILIATION_RECOVERY_CONFLICT');
    fs.renameSync(staged, file);
  }
  journal.phase = 'media-installed';
  durableWrite(path.join(dir, JOURNAL), JSON.stringify(journal));
  afterPhase(journal.phase);
  installDocuments(dir, journal.changes);
  journal.phase = 'references-committed';
  durableWrite(path.join(dir, JOURNAL), JSON.stringify(journal));
  afterPhase(journal.phase);
  fs.rmSync(path.join(dir, JOURNAL));
}
function recoverTagFile(dir) {
  if (!fs.existsSync(path.join(dir, JOURNAL))) return { recovered: false };
  if (fs.existsSync(path.join(dir, 'library-reconciliation-journal.json')))
    throw failure('RECONCILIATION_RECOVERY_CONFLICT');
  regular(path.join(dir, JOURNAL));
  const journal = readDocument(dir, JOURNAL).data;
  validateJournal(journal);
  finish(dir, journal);
  return { recovered: true };
}
function freeSpace(dir) {
  const stat = fs.statfsSync(dir, { bigint: true });
  return Number(stat.bavail * stat.bsize);
}
function prepareTagFile(dir, input, { freeBytes = freeSpace } = {}) {
  require('../reconciliation/transaction').assertNoTransaction(dir);
  const file = managedPath(dir, input.trackId);
  if (
    !Buffer.isBuffer(input.output) ||
    !input.output.length ||
    input.output.length > 256 * 1024 ** 2
  )
    throw failure('TAGS_LIMIT');
  const id = input.id ?? crypto.randomUUID();
  const journal = {
    version: 1,
    id,
    trackId: input.trackId,
    beforeHash: input.beforeHash,
    afterHash: digest(input.output),
    phase: 'prepared',
    changes: input.changes,
  };
  validateJournal(journal);
  if (fileHash(file) !== input.beforeHash)
    throw failure('RECONCILIATION_CONFLICT');
  for (const c of input.changes)
    if (documentRaw(dir, c.filename) !== c.before)
      throw failure('RECONCILIATION_CONFLICT');
  if (
    freeBytes(dir) <
    fs.statSync(file).size +
      input.output.length +
      Buffer.byteLength(JSON.stringify(journal)) +
      16 * 1024 ** 2
  )
    throw failure('TAGS_SPACE');
  const root = path.join(dir, BACKUPS);
  fs.mkdirSync(root, { recursive: true });
  regular(root, true);
  const folders = fs.readdirSync(root, { withFileTypes: true });
  let used = 0;
  for (const entry of folders) {
    if (!entry.isDirectory() || !UUID.test(entry.name))
      throw failure('TAGS_UNSUPPORTED');
    for (const name of ['original.flac', 'staged.flac']) {
      const candidate = backupPath(dir, entry.name, name);
      if (fs.existsSync(candidate)) used += regular(candidate).size;
    }
  }
  const folderLimit = input.restore ? 200 : 100,
    byteLimit = (input.restore ? 4 : 2) * 1024 ** 3;
  if (
    folders.length >= folderLimit ||
    used + fs.statSync(file).size + input.output.length > byteLimit
  )
    throw failure('TAGS_LIMIT');
  fs.mkdirSync(path.join(root, id));
  const backup = backupPath(dir, id, 'original.flac'),
    staged = backupPath(dir, id, 'staged.flac');
  return { journal, file, backup, staged, output: input.output };
}
function commitStagedTagFile(dir, journal, { afterPhase = () => {} } = {}) {
  require('../reconciliation/transaction').assertNoTransaction(dir);
  validateJournal(journal);
  const file = managedPath(dir, journal.trackId),
    backup = backupPath(dir, journal.id, 'original.flac'),
    staged = backupPath(dir, journal.id, 'staged.flac');
  if (fileHash(staged) !== journal.afterHash)
    throw failure('TAGS_VERIFICATION_FAILED');
  if (
    fileHash(backup) !== journal.beforeHash ||
    fileHash(file) !== journal.beforeHash
  )
    throw failure('RECONCILIATION_CONFLICT');
  for (const c of journal.changes)
    if (documentRaw(dir, c.filename) !== c.before)
      throw failure('RECONCILIATION_CONFLICT');
  durableWrite(path.join(dir, JOURNAL), JSON.stringify(journal));
  afterPhase('prepared');
  finish(dir, journal, afterPhase);
  return {
    id: journal.id,
    backupId: journal.id,
    beforeHash: journal.beforeHash,
    afterHash: journal.afterHash,
  };
}
function commitTagFile(dir, input, options = {}) {
  const prepared = prepareTagFile(dir, input, options);
  const { file, backup, staged } = prepared;
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  const fd = fs.openSync(backup, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  durableWrite(staged, input.output);
  return commitStagedTagFile(dir, prepared.journal, options);
}
async function stageTagFile(dir, input) {
  const prepared = prepareTagFile(dir, input);
  try {
    await fs.promises.copyFile(
      prepared.file,
      prepared.backup,
      fs.constants.COPYFILE_EXCL,
    );
    const backup = await fs.promises.open(prepared.backup, 'r+');
    try {
      await backup.sync();
    } finally {
      await backup.close();
    }
    const staged = await fs.promises.open(prepared.staged, 'wx');
    try {
      await staged.writeFile(input.output);
      await staged.sync();
    } finally {
      await staged.close();
    }
    return prepared.journal;
  } catch (error) {
    discardStagedTagFile(dir, prepared.journal);
    throw error;
  }
}
function discardStagedTagFile(dir, journal) {
  try {
    const active = readDocument(dir, JOURNAL);
    if (active.data?.id === journal.id) return;
    for (const name of ['original.flac', 'staged.flac']) {
      const file = backupPath(dir, journal.id, name);
      if (fs.existsSync(file)) {
        regular(file);
        fs.unlinkSync(file);
      }
    }
    fs.rmdirSync(path.join(dir, BACKUPS, journal.id));
  } catch {
    /* Preserve evidence if cleanup cannot prove ownership. */
  }
}

module.exports = {
  stageTagFile,
  commitStagedTagFile,
  discardStagedTagFile,
  readTagAudio,
  commitTagFile,
  recoverTagFile,
  assertNoTagTransaction,
  managedPath,
  backupPath,
  fileHash,
};
