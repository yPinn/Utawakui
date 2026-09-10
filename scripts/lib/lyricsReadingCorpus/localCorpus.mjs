import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const {
  katakanaToHiragana,
} = require('../../../electron/lib/lyricsReading.js');

const MAX_READING_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_READING_DOCUMENTS = 10_000;
const MAX_LINES_PER_DOCUMENT = 10_000;
const MAX_TOTAL_LINES = 250_000;
const MAX_TOTAL_READING_BYTES = 64 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 100_000;
const MAX_PRIVATE_LINE_LENGTH = 160;
const MAX_PRIVATE_CORPUS_BYTES = 2 * 1024 * 1024;
const MAX_MATCHING_EDGE_VISITS = 5_000_000;
const DEFAULT_PER_RECORDING_LIMIT = 4;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._+-]{0,127}$/iu;
const JAPANESE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN_RE = /\p{Script=Han}/u;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LATIN_OR_NUMBER_RE = /[\p{Script=Latin}\p{Number}]/u;
const SHAPE_ORDER = Object.freeze([
  'kanji-kana',
  'mixed-latin',
  'kana-only',
  'kanji-only',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hasControlCharacters(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return true;
  }
  return false;
}

function recordingIdentity(record, identitySalt) {
  return `local:${sha256(
    JSON.stringify([
      'utawakui-local-reading-corpus-v1',
      identitySalt,
      record.trackId,
    ]),
  )}`;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeAnalyzer(value) {
  if (
    !isPlainObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.version !== 'string' ||
    !COMPONENT_RE.test(value.id) ||
    !COMPONENT_RE.test(value.version)
  ) {
    return null;
  }
  return { id: value.id, version: value.version };
}

function normalizeSegments(segments, text) {
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.length > MAX_PRIVATE_LINE_LENGTH
  ) {
    return null;
  }

  const normalized = [];
  for (const segment of segments) {
    if (
      !isPlainObject(segment) ||
      typeof segment.t !== 'string' ||
      segment.t.length > MAX_PRIVATE_LINE_LENGTH ||
      (Object.hasOwn(segment, 'r') &&
        (typeof segment.r !== 'string' ||
          segment.r.length > MAX_PRIVATE_LINE_LENGTH))
    ) {
      return null;
    }
    normalized.push(
      Object.hasOwn(segment, 'r')
        ? { t: segment.t, r: segment.r }
        : { t: segment.t },
    );
  }

  if (normalized.map((segment) => segment.t).join('') !== text) return null;
  const reading = katakanaToHiragana(
    normalized.map((segment) => segment.r ?? segment.t).join(''),
  );
  if (!reading || reading.length > MAX_PRIVATE_LINE_LENGTH * 4) return null;
  return { segments: normalized, reading };
}

function classifyShape(text) {
  if (LATIN_OR_NUMBER_RE.test(text)) return 'mixed-latin';
  const hasHan = HAN_RE.test(text);
  const hasKana = KANA_RE.test(text);
  if (hasHan && hasKana) return 'kanji-kana';
  return hasHan ? 'kanji-only' : 'kana-only';
}

function baseCandidate(
  record,
  line,
  lineIndex,
  analyzer,
  normalized,
  identitySalt,
) {
  const identity = recordingIdentity(record, identitySalt);
  const caseDigest = sha256(
    JSON.stringify([identity, lineIndex, line.text, normalized.reading]),
  );
  return {
    id: `local-${caseDigest}`,
    recordingIdentity: identity,
    text: line.text,
    shape: classifyShape(line.text),
    analyzer,
    _stableOrder: sha256(
      JSON.stringify([
        'utawakui-local-reading-sample-v1',
        line.text,
        normalized.reading,
      ]),
    ),
  };
}

function groupCandidateAlternatives(candidates) {
  const sorted = candidates.toSorted((left, right) =>
    left._stableOrder.localeCompare(right._stableOrder),
  );
  const seenRecordings = new Set();
  const alternatives = sorted.filter((candidate) => {
    if (seenRecordings.has(candidate.recordingIdentity)) return false;
    seenRecordings.add(candidate.recordingIdentity);
    return true;
  });
  return {
    shape: alternatives[0].shape,
    _stableOrder: alternatives[0]._stableOrder,
    alternatives,
  };
}

function orderCandidateGroups(candidateGroups) {
  const buckets = new Map(SHAPE_ORDER.map((shape) => [shape, []]));
  for (const group of candidateGroups) buckets.get(group.shape).push(group);
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) =>
      left._stableOrder.localeCompare(right._stableOrder),
    );
  }
  const shapePriority = SHAPE_ORDER.toSorted((left, right) => {
    const sizeDelta = buckets.get(left).length - buckets.get(right).length;
    return sizeDelta || SHAPE_ORDER.indexOf(left) - SHAPE_ORDER.indexOf(right);
  });
  const bucketCursors = new Map(shapePriority.map((shape) => [shape, 0]));

  const orderedGroups = [];
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const shape of shapePriority) {
      const bucket = buckets.get(shape);
      const cursor = bucketCursors.get(shape);
      if (cursor >= bucket.length) continue;
      orderedGroups.push(bucket[cursor]);
      bucketCursors.set(shape, cursor + 1);
      madeProgress = true;
    }
  }
  return orderedGroups;
}

function matchReviewCandidates(
  orderedGroups,
  limit,
  perRecordingLimit,
  matchingEdgeVisitLimit,
) {
  const slotsByRecording = new Map();
  const groupAssignments = new Map();
  let matchingEdgeVisits = 0;
  const slotsFor = (recordingIdentity) => {
    if (!slotsByRecording.has(recordingIdentity)) {
      slotsByRecording.set(
        recordingIdentity,
        Array.from({ length: perRecordingLimit }, () => ({
          assignment: null,
        })),
      );
    }
    return slotsByRecording.get(recordingIdentity);
  };
  const tryAssign = (group, visitedSlots) => {
    const visitedRecordings = new Set();
    for (const candidate of group.alternatives) {
      if (visitedRecordings.has(candidate.recordingIdentity)) continue;
      visitedRecordings.add(candidate.recordingIdentity);
      for (const slot of slotsFor(candidate.recordingIdentity)) {
        matchingEdgeVisits += 1;
        if (matchingEdgeVisits > matchingEdgeVisitLimit) {
          throw new RangeError('local reading matching work budget exceeded');
        }
        if (visitedSlots.has(slot)) continue;
        visitedSlots.add(slot);
        if (
          !slot.assignment ||
          tryAssign(slot.assignment.group, visitedSlots)
        ) {
          slot.assignment = { group, candidate };
          groupAssignments.set(group, candidate);
          return true;
        }
      }
    }
    return false;
  };

  for (const group of orderedGroups) {
    if (groupAssignments.size >= limit) break;
    tryAssign(group, new Set());
  }
  return groupAssignments;
}

function publicCandidate(candidate) {
  const { _stableOrder, ...value } = candidate;
  void _stableOrder;
  return value;
}

export function buildLocalLyricsReadingCorpus(records, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const identitySalt = options.identitySalt || randomUUID();
  const limit = Number.isSafeInteger(options.limit) ? options.limit : 200;
  const perRecordingLimit = Number.isSafeInteger(options.perRecordingLimit)
    ? options.perRecordingLimit
    : DEFAULT_PER_RECORDING_LIMIT;
  const matchingEdgeVisitLimit = Number.isSafeInteger(
    options.matchingEdgeVisitLimit,
  )
    ? options.matchingEdgeVisitLimit
    : MAX_MATCHING_EDGE_VISITS;
  if (
    typeof identitySalt !== 'string' ||
    identitySalt.length === 0 ||
    identitySalt.length > 200 ||
    limit < 1 ||
    limit > 300 ||
    perRecordingLimit < 1 ||
    perRecordingLimit > 20 ||
    matchingEdgeVisitLimit < 1 ||
    matchingEdgeVisitLimit > MAX_MATCHING_EDGE_VISITS
  ) {
    throw new TypeError('local lyrics reading corpus limits are invalid');
  }

  const summary = {
    schemaVersion: 1,
    generatedAt,
    documentsScanned: records.length,
    japaneseDocuments: 0,
    nonJapaneseDocuments: 0,
    invalidDocuments: options.invalidDocuments || 0,
    linesScanned: 0,
    eligibleAutomaticLines: 0,
    availableEditedGoldSeedLines: 0,
    editedGoldSeedLines: 0,
    conflictingEditedGoldLines: 0,
    excludedNonJapaneseLines: 0,
    excludedLongLines: 0,
    excludedControlCharacterLines: 0,
    excludedMalformedLines: 0,
    excludedDuplicateTextLines: 0,
    reviewQueueLines: 0,
    reviewLimit: limit,
    reviewQueueTruncated: false,
    goldSeedTruncated: false,
  };
  const automatic = [];
  const gold = [];

  for (const record of records) {
    const document = record?.document;
    if (!isPlainObject(document) || !Array.isArray(document.lines)) {
      summary.invalidDocuments += 1;
      continue;
    }
    if (document.script !== 'ja') {
      summary.nonJapaneseDocuments += 1;
      continue;
    }
    const analyzer = normalizeAnalyzer(document.analyzer);
    if (!analyzer || document.lines.length > MAX_LINES_PER_DOCUMENT) {
      summary.invalidDocuments += 1;
      continue;
    }
    summary.japaneseDocuments += 1;

    document.lines.forEach((line, lineIndex) => {
      summary.linesScanned += 1;
      if (!isPlainObject(line) || typeof line.text !== 'string' || !line.text) {
        summary.excludedMalformedLines += 1;
        return;
      }
      if (!JAPANESE_RE.test(line.text)) {
        summary.excludedNonJapaneseLines += 1;
        return;
      }
      if (line.text.length > MAX_PRIVATE_LINE_LENGTH) {
        summary.excludedLongLines += 1;
        return;
      }
      if (hasControlCharacters(line.text)) {
        summary.excludedControlCharacterLines += 1;
        return;
      }
      const normalized = normalizeSegments(line.segments, line.text);
      if (!normalized) {
        summary.excludedMalformedLines += 1;
        return;
      }
      if (hasControlCharacters(normalized.reading)) {
        summary.excludedControlCharacterLines += 1;
        return;
      }

      const candidate = baseCandidate(
        record,
        line,
        lineIndex,
        analyzer,
        normalized,
        identitySalt,
      );
      if (line.edited === true) {
        gold.push({
          ...candidate,
          expectedKana: normalized.reading,
          expectedSegments: normalized.segments,
          review: {
            status: 'needs-classification',
            cohort: null,
            analyzerAddressable: null,
            notes: null,
          },
        });
      } else {
        automatic.push({
          ...candidate,
          currentKana: normalized.reading,
          currentSegments: normalized.segments,
          review: {
            status: 'pending',
            cohort: null,
            analyzerAddressable: null,
            expectedKana: null,
            expectedSegments: null,
            notes: null,
          },
        });
      }
    });
  }

  const goldGroups = [];
  const goldTexts = new Set();
  const goldByText = Map.groupBy(gold, (candidate) => candidate.text);
  for (const [text, candidates] of goldByText) {
    goldTexts.add(text);
    const signatures = new Set(
      candidates.map((candidate) =>
        JSON.stringify([candidate.expectedKana, candidate.expectedSegments]),
      ),
    );
    if (signatures.size !== 1) {
      summary.conflictingEditedGoldLines += candidates.length;
      continue;
    }
    goldGroups.push(groupCandidateAlternatives(candidates));
    summary.excludedDuplicateTextLines += candidates.length - 1;
  }
  goldGroups.sort((left, right) =>
    left._stableOrder.localeCompare(right._stableOrder),
  );

  const automaticGroups = [];
  const automaticByText = Map.groupBy(automatic, (candidate) => candidate.text);
  for (const [text, candidates] of automaticByText) {
    if (goldTexts.has(text)) {
      summary.excludedDuplicateTextLines += candidates.length;
      continue;
    }
    automaticGroups.push(groupCandidateAlternatives(candidates));
    summary.excludedDuplicateTextLines += candidates.length - 1;
  }
  automaticGroups.sort((left, right) =>
    left._stableOrder.localeCompare(right._stableOrder),
  );
  summary.eligibleAutomaticLines = automaticGroups.length;
  summary.availableEditedGoldSeedLines = goldGroups.length;

  const orderedGoldGroups = orderCandidateGroups(goldGroups);
  const orderedAutomaticGroups = orderCandidateGroups(automaticGroups);
  const assignments = matchReviewCandidates(
    [...orderedGoldGroups, ...orderedAutomaticGroups],
    limit,
    perRecordingLimit,
    matchingEdgeVisitLimit,
  );
  const selectedGold = orderedGoldGroups
    .filter((group) => assignments.has(group))
    .map((group) => assignments.get(group));
  summary.editedGoldSeedLines = selectedGold.length;
  summary.goldSeedTruncated = selectedGold.length < goldGroups.length;

  const selected = orderedAutomaticGroups
    .filter((group) => assignments.has(group))
    .map((group) => assignments.get(group));
  summary.reviewQueueLines = selected.length;
  summary.reviewQueueTruncated = selected.length < automaticGroups.length;

  return {
    reviewQueue: {
      schemaVersion: 1,
      corpusId: 'utawakui-local-reading-review-v1',
      generatedAt,
      cases: selected.map(publicCandidate),
    },
    goldSeed: {
      schemaVersion: 1,
      corpusId: 'utawakui-local-reading-gold-seed-v1',
      generatedAt,
      cases: selectedGold.map(publicCandidate),
    },
    summary,
  };
}

export function isPathWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  );
}

export function isSamePath(left, right) {
  return path.relative(path.resolve(left), path.resolve(right)) === '';
}

function readBoundedDirectoryEntries(directory, remainingEntries) {
  const entries = [];
  let handle;
  try {
    handle = fs.opendirSync(directory);
    let entry;
    while ((entry = handle.readSync())) {
      if (entries.length >= remainingEntries) {
        throw new RangeError('local reading directory entry limit exceeded');
      }
      entries.push(entry);
    }
  } finally {
    if (handle) handle.closeSync();
  }
  return entries;
}

function readBoundedJson(filePath, allowedDirectory, consumeBytes) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, 'r');
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || stats.size > MAX_READING_DOCUMENT_BYTES) {
      throw new TypeError('local reading document exceeds the size limit');
    }
    consumeBytes(stats.size);
    const canonicalFile = fs.realpathSync(filePath);
    if (!isPathWithin(allowedDirectory, canonicalFile)) {
      throw new TypeError('local reading document escapes its directory');
    }
    const currentStats = fs.statSync(filePath);
    if (
      currentStats.dev !== stats.dev ||
      currentStats.ino !== stats.ino ||
      currentStats.size !== stats.size ||
      currentStats.mtimeMs !== stats.mtimeMs
    ) {
      throw new TypeError('local reading document changed while being read');
    }
    const buffer = Buffer.allocUnsafe(stats.size);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(
        descriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        null,
      );
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead !== buffer.length) {
      throw new TypeError('local reading document changed while being read');
    }
    return JSON.parse(buffer.toString('utf8'));
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function projectReadingDocument(document) {
  return {
    sourceFilename: document.sourceFilename,
    script: document.script,
    analyzer: isPlainObject(document.analyzer)
      ? { id: document.analyzer.id, version: document.analyzer.version }
      : null,
    lines: document.lines.map((line) => {
      if (!isPlainObject(line)) return null;
      return {
        text: line.text,
        edited: line.edited === true,
        segments: Array.isArray(line.segments)
          ? line.segments.map((segment) =>
              isPlainObject(segment)
                ? {
                    t: segment.t,
                    ...(Object.hasOwn(segment, 'r') ? { r: segment.r } : {}),
                  }
                : null,
            )
          : null,
      };
    }),
  };
}

function safeDirectory(directory) {
  try {
    const stats = fs.lstatSync(directory);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export function scanLocalLyricsReadingDocuments(
  libraryDirectory,
  options = {},
) {
  const maxTotalBytes = options.maxTotalBytes ?? MAX_TOTAL_READING_BYTES;
  const maxDirectoryEntries =
    options.maxDirectoryEntries ?? MAX_DIRECTORY_ENTRIES;
  if (
    !Number.isSafeInteger(maxTotalBytes) ||
    maxTotalBytes < 1 ||
    maxTotalBytes > MAX_TOTAL_READING_BYTES ||
    !Number.isSafeInteger(maxDirectoryEntries) ||
    maxDirectoryEntries < 1 ||
    maxDirectoryEntries > MAX_DIRECTORY_ENTRIES
  ) {
    throw new TypeError('local reading scan budgets are invalid');
  }
  const canonicalLibrary = fs.realpathSync(path.resolve(libraryDirectory));
  const tracksDirectory = path.join(canonicalLibrary, 'tracks');
  if (!safeDirectory(tracksDirectory)) {
    throw new TypeError('local Utawakui library is unavailable');
  }
  const canonicalTracks = fs.realpathSync(tracksDirectory);

  const records = [];
  let invalidDocuments = 0;
  let documentsSeen = 0;
  let totalLines = 0;
  let totalBytes = 0;
  let directoryEntriesSeen = 0;
  const consumeBytes = (bytes) => {
    totalBytes += bytes;
    if (totalBytes > maxTotalBytes) {
      throw new RangeError('local reading byte budget exceeded');
    }
  };
  const trackEntries = readBoundedDirectoryEntries(
    tracksDirectory,
    maxDirectoryEntries,
  );
  directoryEntriesSeen += trackEntries.length;
  const trackDirectories = trackEntries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const trackEntry of trackDirectories) {
    const trackDirectory = path.join(tracksDirectory, trackEntry.name);
    const lyricsDirectory = path.join(trackDirectory, 'lyrics');
    const readingsDirectory = path.join(lyricsDirectory, 'readings');
    if (!safeDirectory(lyricsDirectory) || !safeDirectory(readingsDirectory)) {
      continue;
    }
    const canonicalReadings = fs.realpathSync(readingsDirectory);
    if (!isPathWithin(canonicalTracks, canonicalReadings)) continue;
    const readingEntries = readBoundedDirectoryEntries(
      readingsDirectory,
      maxDirectoryEntries - directoryEntriesSeen,
    );
    directoryEntriesSeen += readingEntries.length;
    const readingFiles = readingEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const readingEntry of readingFiles) {
      documentsSeen += 1;
      if (documentsSeen > MAX_READING_DOCUMENTS) {
        throw new TypeError('local reading document count exceeds the limit');
      }
      try {
        const document = readBoundedJson(
          path.join(readingsDirectory, readingEntry.name),
          canonicalReadings,
          consumeBytes,
        );
        if (
          !isPlainObject(document) ||
          typeof document.sourceFilename !== 'string' ||
          `${document.sourceFilename}.json` !== readingEntry.name ||
          !Array.isArray(document.lines) ||
          document.lines.length > MAX_LINES_PER_DOCUMENT
        ) {
          invalidDocuments += 1;
          continue;
        }
        totalLines += document.lines.length;
        if (totalLines > MAX_TOTAL_LINES) {
          throw new RangeError('local reading line count exceeds the limit');
        }
        records.push({
          trackId: trackEntry.name,
          sourceKey: readingEntry.name,
          document: projectReadingDocument(document),
        });
      } catch (error) {
        if (error instanceof RangeError) throw error;
        invalidDocuments += 1;
      }
    }
  }
  return {
    records,
    invalidDocuments,
    documentsSeen,
    directoryEntriesSeen,
    totalBytes,
  };
}

export function defaultPrivateCorpusRoot() {
  if (process.platform === 'win32') {
    if (!process.env.LOCALAPPDATA) {
      throw new TypeError('local private data root is unavailable');
    }
    return path.join(
      process.env.LOCALAPPDATA,
      'Utawakui',
      'private-benchmarks',
      'lyrics-reading',
    );
  }
  const dataRoot =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(
    dataRoot,
    'Utawakui',
    'private-benchmarks',
    'lyrics-reading',
  );
}

function canonicalizePotentialPath(value) {
  let cursor = path.resolve(value);
  const missingParts = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new TypeError('local corpus output parent is unavailable');
    }
    missingParts.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(fs.realpathSync(cursor), ...missingParts);
}

export function windowsPowerShellExecutable() {
  const trustedWindowsRoot = path.win32.normalize('C:\\Windows');
  const canonicalRoot = fs.realpathSync(trustedWindowsRoot);
  if (canonicalRoot.toLowerCase() !== trustedWindowsRoot.toLowerCase()) {
    throw new TypeError('Windows security tools are unavailable');
  }
  const executable = fs.realpathSync(
    path.join(
      canonicalRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
  );
  if (!isPathWithin(canonicalRoot, executable)) {
    throw new TypeError('Windows security tool path is invalid');
  }
  return executable;
}

const RESTRICT_WINDOWS_DIRECTORY_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$target = [string]$env:UTAWAKUI_PRIVATE_ACL_TARGET
if ([string]::IsNullOrWhiteSpace($target)) { throw 'invalid private output path' }
$resolvedTarget = [System.IO.Path]::GetFullPath($target)
$directory = [System.IO.DirectoryInfo]::new($resolvedTarget)
if (-not $directory.Exists) { throw 'private output directory is unavailable' }

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$currentSid = $currentUser.Value
$systemSid = 'S-1-5-18'
$administratorsSid = 'S-1-5-32-544'
$broadSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
if ($broadSids -contains $currentSid) { throw 'private output identity is too broad' }

$allowedSids = @($currentSid, $systemSid, $administratorsSid)
$security = [System.Security.AccessControl.DirectorySecurity]::new()
$security.SetAccessRuleProtection($true, $false)
$inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
$propagation = [System.Security.AccessControl.PropagationFlags]::None
$accessType = [System.Security.AccessControl.AccessControlType]::Allow
$rights = [System.Security.AccessControl.FileSystemRights]::FullControl
foreach ($sidValue in $allowedSids) {
  $sid = [System.Security.Principal.SecurityIdentifier]::new($sidValue)
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, $rights, $inheritance, $propagation, $accessType)
  [void]$security.AddAccessRule($rule)
}
$directory.SetAccessControl($security)

$verified = $directory.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
if (-not $verified.AreAccessRulesProtected) { throw 'private output ACL still inherits' }
$rules = @($verified.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if ($rules.Count -ne $allowedSids.Count) { throw 'private output ACL contains unexpected rules' }
foreach ($rule in $rules) {
  if ($rule.AccessControlType -ne $accessType) { throw 'private output ACL contains a deny rule' }
  if ($allowedSids -notcontains $rule.IdentityReference.Value) { throw 'private output ACL contains an unexpected identity' }
  if (($rule.FileSystemRights -band $rights) -ne $rights) { throw 'private output ACL grants insufficient rights' }
  if (($rule.InheritanceFlags -band $inheritance) -ne $inheritance) { throw 'private output ACL is not inheritable' }
}
'UTAWAKUI_ACL_OK'
`;

export function restrictWindowsDirectoryAcl(directory) {
  if (process.platform !== 'win32') return;
  const result = spawnSync(
    windowsPowerShellExecutable(),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      RESTRICT_WINDOWS_DIRECTORY_ACL_SCRIPT,
    ],
    {
      encoding: 'utf8',
      env: {
        SystemRoot: 'C:\\Windows',
        windir: 'C:\\Windows',
        UTAWAKUI_PRIVATE_ACL_TARGET: directory,
      },
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (result.status !== 0 || result.stdout?.trim() !== 'UTAWAKUI_ACL_OK') {
    throw new TypeError('Windows private output ACL could not be applied');
  }
}

function atomicWritePrivateJson(outputPath, value) {
  const serialized = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (serialized.length > MAX_PRIVATE_CORPUS_BYTES) {
    throw new TypeError('local lyrics reading corpus exceeds the size limit');
  }
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor;
  let temporaryCreated = false;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    fs.writeFileSync(descriptor, serialized);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, outputPath);
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Cleanup continues with the private temporary file.
      }
    }
    if (temporaryCreated) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // The parent directory already has a restricted ACL.
      }
    }
  }
}

export function prepareLocalLyricsReadingCorpus({
  libraryDirectory,
  outputPath,
  privateOutputRoot = defaultPrivateCorpusRoot(),
  limit = 200,
  generatedAt,
}) {
  const resolvedLibrary = path.resolve(libraryDirectory);
  const resolvedOutput = path.resolve(outputPath);
  const resolvedPrivateRoot = path.resolve(privateOutputRoot);
  if (
    !isPathWithin(resolvedPrivateRoot, resolvedOutput) ||
    isSamePath(resolvedPrivateRoot, resolvedOutput)
  ) {
    throw new TypeError(
      'local corpus output must be inside the private output root',
    );
  }
  if (isPathWithin(resolvedLibrary, resolvedOutput)) {
    throw new TypeError('local corpus output must be outside the library');
  }
  if (fs.existsSync(resolvedOutput)) {
    throw new TypeError('local corpus output already exists');
  }

  fs.mkdirSync(resolvedPrivateRoot, { recursive: true, mode: 0o700 });
  const canonicalPrivateRoot = fs.realpathSync(resolvedPrivateRoot);
  const canonicalLibrary = fs.realpathSync(resolvedLibrary);
  const canonicalPotentialOutput = canonicalizePotentialPath(resolvedOutput);
  if (!isPathWithin(canonicalPrivateRoot, canonicalPotentialOutput)) {
    throw new TypeError('local corpus output escapes the private output root');
  }
  if (isPathWithin(canonicalLibrary, canonicalPotentialOutput)) {
    throw new TypeError('local corpus output must be outside the library');
  }
  const outputParent = path.dirname(resolvedOutput);
  fs.mkdirSync(outputParent, { recursive: true, mode: 0o700 });
  const canonicalOutputParent = fs.realpathSync(outputParent);
  const canonicalOutput = path.join(
    canonicalOutputParent,
    path.basename(resolvedOutput),
  );
  if (!isPathWithin(canonicalPrivateRoot, canonicalOutput)) {
    throw new TypeError('local corpus output escapes the private output root');
  }
  if (isPathWithin(canonicalLibrary, canonicalOutput)) {
    throw new TypeError('local corpus output must be outside the library');
  }
  restrictWindowsDirectoryAcl(canonicalOutputParent);

  const scan = scanLocalLyricsReadingDocuments(resolvedLibrary);
  const corpus = buildLocalLyricsReadingCorpus(scan.records, {
    generatedAt,
    invalidDocuments: scan.invalidDocuments,
    limit,
  });
  corpus.summary.documentsSeen = scan.documentsSeen;
  corpus.summary.directoryEntriesSeen = scan.directoryEntriesSeen;
  corpus.summary.sourceBytesRead = scan.totalBytes;

  try {
    atomicWritePrivateJson(canonicalOutput, corpus);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new TypeError('local corpus output already exists', {
        cause: error,
      });
    }
    throw new TypeError('local lyrics reading corpus could not be written', {
      cause: error,
    });
  }
  return corpus.summary;
}
