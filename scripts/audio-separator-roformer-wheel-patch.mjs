import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import AdmZip from 'adm-zip';

export const PATCH_ID = 'audio-separator-roformer-metadata-v1';
export const PATCH_MARKER = `X-Utawakui-Research-Patch: ${PATCH_ID}`;
export const UPSTREAM_FILENAME = 'audio_separator-0.44.5-py3-none-any.whl';
export const UPSTREAM_SIZE_BYTES = 415_089;
export const UPSTREAM_SHA256 =
  '9db7d8ded987a74aec9d96be949b49c9068def69823abb59cabb6e6f88679ae7';
export const UPSTREAM_URL =
  'https://files.pythonhosted.org/packages/24/44/7ff4a4a0f4b95af529b6d92132661e04199d8c10de049c96ec3691edb14d/audio_separator-0.44.5-py3-none-any.whl';
export const OUTPUT_FILENAME =
  'audio_separator-0.44.5-1utawakui-py3-none-any.whl';

export const REMOVED_REQUIREMENTS = Object.freeze([
  'diffq (>=0.2) ; sys_platform != "win32"',
  'diffq-fixed (>=0.2) ; sys_platform == "win32"',
  'julius (>=0.2)',
  'onnx-weekly',
  'onnx2torch-py313 (>=1.6)',
]);

const DIST_INFO = 'audio_separator-0.44.5.dist-info';
const METADATA_PATH = `${DIST_INFO}/METADATA`;
const RECORD_PATH = `${DIST_INFO}/RECORD`;
const FIXED_ZIP_TIME = new Date(1980, 0, 1, 0, 0, 0);
const SHA256_RE = /^[a-f0-9]{64}$/;
const REQUIREMENT_PREFIX = 'Requires-Dist: ';
const REMOVED_PACKAGE_NAMES = new Set([
  'diffq',
  'diffq-fixed',
  'julius',
  'onnx-weekly',
  'onnx2torch-py313',
]);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function recordDigest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('base64url');
}

function requirementName(requirement) {
  return requirement.match(/^[A-Za-z0-9][A-Za-z0-9._-]*/)?.[0]?.toLowerCase();
}

function assertSingleHeader(lines, header, expected) {
  const values = lines
    .filter((line) => line.startsWith(`${header}: `))
    .map((line) => line.slice(header.length + 2));
  if (values.length !== 1 || values[0] !== expected) {
    throw new Error(`unexpected upstream ${header.toLowerCase()}`);
  }
}

export function patchAudioSeparatorMetadata(metadataText) {
  if (typeof metadataText !== 'string' || metadataText.length === 0) {
    throw new Error('invalid upstream METADATA');
  }
  if (metadataText.includes(PATCH_MARKER)) {
    throw new Error('upstream wheel is already patched');
  }

  const newline = metadataText.includes('\r\n') ? '\r\n' : '\n';
  const lines = metadataText.split(/\r?\n/);
  assertSingleHeader(lines, 'Name', 'audio-separator');
  assertSingleHeader(lines, 'Version', '0.44.5');

  const reviewedLineCounts = new Map(
    REMOVED_REQUIREMENTS.map((requirement) => [requirement, 0]),
  );
  for (const line of lines) {
    if (!line.startsWith(REQUIREMENT_PREFIX)) continue;
    const requirement = line.slice(REQUIREMENT_PREFIX.length);
    if (reviewedLineCounts.has(requirement)) {
      reviewedLineCounts.set(
        requirement,
        reviewedLineCounts.get(requirement) + 1,
      );
      continue;
    }
    if (REMOVED_PACKAGE_NAMES.has(requirementName(requirement))) {
      throw new Error('unexpected reviewed requirement metadata');
    }
  }
  if ([...reviewedLineCounts.values()].some((count) => count !== 1)) {
    throw new Error('missing or duplicate reviewed requirement metadata');
  }

  const removed = new Set(
    REMOVED_REQUIREMENTS.map(
      (requirement) => `${REQUIREMENT_PREFIX}${requirement}`,
    ),
  );
  const patched = [];
  for (const line of lines) {
    if (removed.has(line)) continue;
    patched.push(line);
    if (line === 'Version: 0.44.5') {
      patched.push(PATCH_MARKER, 'X-Utawakui-Activation-Eligible: false');
    }
  }
  return patched.join(newline);
}

function assertSafeEntryName(entryName) {
  if (
    typeof entryName !== 'string' ||
    entryName.length === 0 ||
    entryName.includes('\\') ||
    entryName.startsWith('/') ||
    entryName.includes('\0') ||
    entryName.split('/').some((part) => part === '' || part === '..') ||
    path.posix.normalize(entryName) !== entryName
  ) {
    throw new Error(`unsafe wheel entry: ${entryName}`);
  }
}

function readWheelFiles(wheelBuffer) {
  let zip;
  try {
    zip = new AdmZip(wheelBuffer);
  } catch (error) {
    throw new Error('invalid upstream wheel archive', { cause: error });
  }

  const files = new Map();
  for (const entry of zip.getEntries()) {
    assertSafeEntryName(entry.entryName);
    if (entry.isDirectory) {
      throw new Error(`unexpected wheel directory entry: ${entry.entryName}`);
    }
    if (files.has(entry.entryName)) {
      throw new Error(`duplicate wheel entry: ${entry.entryName}`);
    }
    let data;
    try {
      data = entry.getData();
    } catch (error) {
      throw new Error(`invalid wheel entry: ${entry.entryName}`, {
        cause: error,
      });
    }
    files.set(entry.entryName, data);
  }
  if (!files.has(METADATA_PATH) || !files.has(RECORD_PATH)) {
    throw new Error('missing exact audio-separator dist-info metadata');
  }
  return files;
}

function buildRecord(files) {
  const lines = [];
  for (const [name, data] of [...files.entries()].sort(([left], [right]) =>
    left.localeCompare(right, 'en'),
  )) {
    if (name === RECORD_PATH) continue;
    if (name.includes(',') || /[\r\n]/.test(name)) {
      throw new Error(`unsupported wheel RECORD name: ${name}`);
    }
    lines.push(`${name},sha256=${recordDigest(data)},${data.length}`);
  }
  lines.push(`${RECORD_PATH},,`);
  return Buffer.from(`${lines.join('\n')}\n`);
}

function createDeterministicWheel(files) {
  const zip = new AdmZip({ noSort: false });
  for (const [name, data] of [...files.entries()].sort(([left], [right]) =>
    left.localeCompare(right, 'en'),
  )) {
    const entry = zip.addFile(name, data, '', 0o644);
    entry.header.time = FIXED_ZIP_TIME;
  }
  return zip.toBuffer();
}

function assertHttpsPythonHostUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid upstream wheel URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'files.pythonhosted.org' ||
    url.username ||
    url.password
  ) {
    throw new Error('invalid upstream wheel URL');
  }
}

export function buildPatchedWheel(
  wheelBuffer,
  {
    inputFilename = UPSTREAM_FILENAME,
    expectedUpstreamSizeBytes = UPSTREAM_SIZE_BYTES,
    expectedUpstreamSha256 = UPSTREAM_SHA256,
    upstreamUrl = UPSTREAM_URL,
  } = {},
) {
  if (!Buffer.isBuffer(wheelBuffer)) {
    throw new Error('upstream wheel must be a buffer');
  }
  if (inputFilename !== UPSTREAM_FILENAME) {
    throw new Error('unexpected upstream wheel filename');
  }
  if (
    !Number.isSafeInteger(expectedUpstreamSizeBytes) ||
    expectedUpstreamSizeBytes <= 0 ||
    wheelBuffer.length !== expectedUpstreamSizeBytes
  ) {
    throw new Error('unexpected upstream wheel size');
  }
  if (
    !SHA256_RE.test(expectedUpstreamSha256) ||
    sha256(wheelBuffer) !== expectedUpstreamSha256
  ) {
    throw new Error('unexpected upstream wheel hash');
  }
  assertHttpsPythonHostUrl(upstreamUrl);

  const files = readWheelFiles(wheelBuffer);
  files.set(
    METADATA_PATH,
    Buffer.from(
      patchAudioSeparatorMetadata(files.get(METADATA_PATH).toString('utf8')),
    ),
  );
  files.set(RECORD_PATH, buildRecord(files));
  const wheel = createDeterministicWheel(files);
  verifyWheelRecord(wheel);

  const manifest = {
    schemaVersion: 1,
    manifestKind: 'audio-python-wheel-research-patch',
    status: 'benchmark-only',
    activationEligible: false,
    patchId: PATCH_ID,
    package: {
      name: 'audio-separator',
      version: '0.44.5',
    },
    upstream: {
      filename: inputFilename,
      url: upstreamUrl,
      sizeBytes: wheelBuffer.length,
      sha256: expectedUpstreamSha256,
    },
    output: {
      filename: OUTPUT_FILENAME,
      sizeBytes: wheel.length,
      sha256: sha256(wheel),
    },
    delta: {
      sourceFilesChanged: [],
      metadataFilesChanged: [METADATA_PATH, RECORD_PATH],
      removedRequirements: [...REMOVED_REQUIREMENTS],
    },
    requiredRuntimePolicy: {
      network: 'deny',
      missingArtifact: 'fail',
      legacyFallback: 'reject',
      forbiddenImports: [
        'audio_separator.separator.uvr_lib_v5.demucs',
        'diffq',
        'julius',
        'onnx',
        'onnx2torch',
        'torchvision',
      ],
    },
    activationBlockers: [
      'strict-offline-probe',
      'new-loader-only-probe',
      'checkpoint-product-license',
      'packaged-inference-smoke',
    ],
  };

  return {
    wheel,
    outputFilename: OUTPUT_FILENAME,
    manifest,
  };
}

export function verifyWheelRecord(wheelBuffer) {
  const files = readWheelFiles(wheelBuffer);
  const recordText = files.get(RECORD_PATH).toString('utf8');
  const rows = recordText.trimEnd().split(/\r?\n/);
  if (rows.length !== files.size) {
    throw new Error('wheel RECORD entry count mismatch');
  }

  const seen = new Set();
  for (const row of rows) {
    const parts = row.split(',');
    if (parts.length !== 3) throw new Error('invalid wheel RECORD row');
    const [name, digest, size] = parts;
    if (seen.has(name) || !files.has(name)) {
      throw new Error('invalid wheel RECORD entry');
    }
    seen.add(name);
    if (name === RECORD_PATH) {
      if (digest !== '' || size !== '') {
        throw new Error('wheel RECORD must not hash itself');
      }
      continue;
    }
    const data = files.get(name);
    if (
      digest !== `sha256=${recordDigest(data)}` ||
      size !== String(data.length)
    ) {
      throw new Error(`wheel RECORD mismatch: ${name}`);
    }
  }
  return { entryCount: files.size, recordPath: RECORD_PATH };
}

async function runCli() {
  const [inputPath, outputDirectory] = process.argv.slice(2);
  if (!inputPath || !outputDirectory || process.argv.length !== 4) {
    throw new Error(
      'usage: node scripts/audio-separator-roformer-wheel-patch.mjs <exact-upstream-wheel> <ignored-output-directory>',
    );
  }
  if (path.basename(inputPath) !== UPSTREAM_FILENAME) {
    throw new Error(
      'input must use the exact reviewed upstream wheel filename',
    );
  }

  const input = await fs.readFile(inputPath);
  const result = buildPatchedWheel(input);
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, result.outputFilename);
  const manifestPath = `${outputPath}.patch.json`;
  await fs.writeFile(outputPath, result.wheel, { flag: 'wx' });
  try {
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(result.manifest, null, 2)}\n`,
      { flag: 'wx' },
    );
  } catch (error) {
    await fs.rm(outputPath, { force: true });
    throw error;
  }
  process.stdout.write(`${JSON.stringify(result.manifest)}\n`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
