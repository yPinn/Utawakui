'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { atomicWriteJson } = require('../atomicWrite');

const ID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const DIRECTORY = new RegExp(`^\\.separation-(${ID})$`);
const PHASES = new Set([
  'worker',
  'spawning-encode',
  'encoding',
  'spawning-verify',
  'verifying',
  'ready',
  'publishing',
  'published',
]);
const JOURNAL = 'transaction.json';
const validPid = (pid) => Number.isSafeInteger(pid) && pid > 0;

function createSeparationOutputTransaction(outputDir, recipeId) {
  if (typeof recipeId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(recipeId))
    throw new Error('invalid separation recipe');
  const id = randomUUID(),
    staging = path.join(path.resolve(outputDir), `.separation-${id}`);
  fs.mkdirSync(staging);
  const state = {
    version: 1,
    id,
    recipeId,
    ownerPid: process.pid,
    childPids: [],
    phase: 'worker',
  };
  const update = (phase, pid) => {
    if (!PHASES.has(phase))
      throw new Error('invalid separation transaction phase');
    if (pid !== undefined && !validPid(pid))
      throw new Error('invalid separation child identity');
    if (pid !== undefined && !state.childPids.includes(pid))
      state.childPids.push(pid);
    state.phase = phase;
    try {
      atomicWriteJson(path.join(staging, JOURNAL), state);
    } catch (cause) {
      throw Object.assign(
        new Error('separation transaction could not be saved', { cause }),
        { code: 'SEPARATION_JOURNAL_FAILED' },
      );
    }
  };
  update('worker');
  return {
    id,
    staging,
    update,
    filename: (format) =>
      `${recipeId}-${id}.${format === 'flac5' ? 'flac' : 'wav'}`,
  };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'ESRCH' ? false : null;
  }
}

function regularFile(filePath) {
  const info = fs.lstatSync(filePath);
  return info.isFile() && !info.isSymbolicLink();
}

function references(outputDir) {
  const filename = path.join(outputDir, 'manifest.json');
  try {
    if (!regularFile(filename)) return null;
    const raw = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (
      raw?.version !== 2 ||
      !raw.results ||
      typeof raw.results !== 'object' ||
      Array.isArray(raw.results)
    )
      return null;
    const entries = Object.values(raw.results);
    if (
      entries.some(
        (entry) =>
          !entry ||
          typeof entry.artifactFilename !== 'string' ||
          !/^[a-z0-9-]+\.(wav|flac)$/i.test(entry.artifactFilename),
      )
    )
      return null;
    // Windows paths are case-insensitive. Conservative folding also preserves
    // references on case-sensitive platforms rather than deleting extra files.
    return new Set(
      entries.map((entry) => entry.artifactFilename.toLowerCase()),
    );
  } catch (error) {
    return error.code === 'ENOENT' ? new Set() : null;
  }
}

// Lazy, per-track recovery at the controlled boundary, never a whole-library scan.
// Liveness uncertainty, PID reuse and spawn/journal gaps deliberately preserve data.
function recoverSeparationOutputArtifacts(
  outputDir,
  { isProcessAlive = processIsAlive } = {},
) {
  const root = path.resolve(outputDir),
    result = { removed: [], deferred: [] };
  if (!fs.existsSync(root)) return result;
  for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
    const match = DIRECTORY.exec(directory.name);
    if (!match) continue;
    const id = match[1],
      staging = path.join(root, directory.name);
    const defer = (reason) => result.deferred.push({ id, reason });
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      defer('unsafe-directory');
      continue;
    }
    try {
      const journalPath = path.join(staging, JOURNAL);
      if (!regularFile(journalPath) || fs.statSync(journalPath).size > 4096) {
        defer('invalid-journal');
        continue;
      }
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      if (
        journal?.version !== 1 ||
        journal.id !== id ||
        typeof journal.recipeId !== 'string' ||
        !/^[a-z0-9-]{1,64}$/i.test(journal.recipeId) ||
        !validPid(journal.ownerPid) ||
        !Array.isArray(journal.childPids) ||
        !journal.childPids.every(validPid) ||
        !PHASES.has(journal.phase)
      ) {
        defer('invalid-journal');
        continue;
      }
      if (
        [journal.ownerPid, ...journal.childPids].some(
          (pid) => isProcessAlive(pid) !== false,
        )
      ) {
        defer('process-may-be-alive');
        continue;
      }
      if (journal.phase.startsWith('spawning-')) {
        defer('unrecorded-child-possible');
        continue;
      }
      const allowed = new Set([
        JOURNAL,
        `${JOURNAL}.tmp`,
        `${journal.recipeId}.wav`,
        `${journal.recipeId}.wav.tmp`,
        'manifest.json',
        'manifest.json.tmp',
        'candidate.flac',
      ]);
      const contents = fs.readdirSync(staging);
      if (
        contents.some(
          (name) =>
            !allowed.has(name) || !regularFile(path.join(staging, name)),
        )
      ) {
        defer('unknown-staging-content');
        continue;
      }
      const candidates = ['wav', 'flac'].map(
        (ext) => `${journal.recipeId}-${id}.${ext}`,
      );
      if (
        candidates.some(
          (name) =>
            fs.existsSync(path.join(root, name)) &&
            !regularFile(path.join(root, name)),
        )
      ) {
        defer('unsafe-candidate');
        continue;
      }
      const refs = references(root);
      if (!refs) {
        defer('unreadable-manifest');
        continue;
      }
      // Candidate names are derived from the strict directory identity, never
      // supplied as paths by a journal. Preserve all registered/published audio.
      for (const name of candidates) {
        if (
          journal.phase !== 'published' &&
          !refs.has(name.toLowerCase()) &&
          fs.existsSync(path.join(root, name))
        )
          fs.unlinkSync(path.join(root, name));
      }
      // No recursive removal: unexpected files appearing during cleanup survive.
      for (const name of contents.filter((name) => name !== JOURNAL))
        fs.unlinkSync(path.join(staging, name));
      fs.unlinkSync(journalPath);
      fs.rmdirSync(staging);
      result.removed.push(id);
    } catch {
      defer('unavailable-or-busy');
    }
  }
  return result;
}

module.exports = {
  createSeparationOutputTransaction,
  recoverSeparationOutputArtifacts,
};
