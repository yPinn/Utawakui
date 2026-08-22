import crypto from 'node:crypto';

import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';

import {
  PATCH_ID,
  PATCH_MARKER,
  REMOVED_REQUIREMENTS,
  buildPatchedWheel,
  patchAudioSeparatorMetadata,
  verifyWheelRecord,
} from './audio-separator-roformer-wheel-patch.mjs';

const DIST_INFO = 'audio_separator-0.44.5.dist-info';
const METADATA_PATH = `${DIST_INFO}/METADATA`;
const RECORD_PATH = `${DIST_INFO}/RECORD`;
const INPUT_FILENAME = 'audio_separator-0.44.5-py3-none-any.whl';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function metadata(overrides = {}) {
  const name = overrides.name ?? 'audio-separator';
  const version = overrides.version ?? '0.44.5';
  const requirements = overrides.requirements ?? [
    'audioop-lts>=0.2.1; python_version >= "3.13" and python_version < "4.0"',
    'beartype<0.19.0,>=0.18.5',
    ...REMOVED_REQUIREMENTS,
    'librosa>=0.10',
    'onnxruntime (>=1.17) ; extra == "cpu"',
    'requests>=2',
    'torch>=2.3',
  ];

  return [
    'Metadata-Version: 2.4',
    `Name: ${name}`,
    `Version: ${version}`,
    ...requirements.map((requirement) => `Requires-Dist: ${requirement}`),
    '',
    'Audio Separator fixture.',
    '',
  ].join('\n');
}

function fixtureWheel(metadataText = metadata()) {
  const zip = new AdmZip({ noSort: false });
  for (const [name, data] of [
    ['audio_separator/__init__.py', '"""fixture"""\n'],
    [METADATA_PATH, metadataText],
    [
      `${DIST_INFO}/WHEEL`,
      'Wheel-Version: 1.0\nGenerator: fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n',
    ],
    [RECORD_PATH, 'fixture-record-is-rebuilt\n'],
  ]) {
    const entry = zip.addFile(name, Buffer.from(data), '', 0o644);
    entry.header.time = new Date(1980, 0, 1, 0, 0, 0);
  }
  return zip.toBuffer();
}

describe('audio-separator RoFormer wheel research patch', () => {
  it('removes only the exact reviewed requirements and marks the wheel benchmark-only', () => {
    const original = metadata();
    const patched = patchAudioSeparatorMetadata(original);

    expect(patched).toContain(`X-Utawakui-Research-Patch: ${PATCH_ID}`);
    expect(patched).toContain('X-Utawakui-Activation-Eligible: false');
    expect(patched).toContain('Requires-Dist: onnxruntime (>=1.17)');
    expect(patched).toContain('Requires-Dist: requests>=2');
    expect(patched).toContain('Requires-Dist: torch>=2.3');
    for (const requirement of REMOVED_REQUIREMENTS) {
      expect(patched).not.toContain(`Requires-Dist: ${requirement}`);
    }
    expect(
      original
        .split('\n')
        .filter((line) => !REMOVED_REQUIREMENTS.includes(line.slice(15)))
        .filter(Boolean),
    ).toEqual(
      patched
        .split('\n')
        .filter((line) => !line.startsWith('X-Utawakui-'))
        .filter(Boolean),
    );
  });

  it('fails closed when upstream package identity or dependency metadata drifts', () => {
    expect(() =>
      patchAudioSeparatorMetadata(metadata({ version: '0.44.6' })),
    ).toThrow(/version/i);
    expect(() =>
      patchAudioSeparatorMetadata(metadata({ name: 'other-package' })),
    ).toThrow(/name/i);

    const missing = metadata({
      requirements: [
        ...REMOVED_REQUIREMENTS.slice(1),
        'onnxruntime (>=1.17) ; extra == "cpu"',
      ],
    });
    expect(() => patchAudioSeparatorMetadata(missing)).toThrow(
      /reviewed requirement/i,
    );

    const duplicate = metadata({
      requirements: [...REMOVED_REQUIREMENTS, REMOVED_REQUIREMENTS[0]],
    });
    expect(() => patchAudioSeparatorMetadata(duplicate)).toThrow(
      /reviewed requirement/i,
    );
  });

  it('rebuilds deterministic wheels with a valid RECORD and a non-activatable sidecar', () => {
    const input = fixtureWheel();
    const options = {
      inputFilename: INPUT_FILENAME,
      expectedUpstreamSizeBytes: input.length,
      expectedUpstreamSha256: sha256(input),
      upstreamUrl: 'https://files.pythonhosted.org/example/audio_separator.whl',
    };

    const first = buildPatchedWheel(input, options);
    const second = buildPatchedWheel(input, options);

    expect(first.wheel).toEqual(second.wheel);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.outputFilename).toBe(
      'audio_separator-0.44.5-1utawakui-py3-none-any.whl',
    );
    expect(first.manifest).toMatchObject({
      schemaVersion: 1,
      manifestKind: 'audio-python-wheel-research-patch',
      status: 'benchmark-only',
      activationEligible: false,
      patchId: PATCH_ID,
      package: { name: 'audio-separator', version: '0.44.5' },
      upstream: {
        filename: INPUT_FILENAME,
        sizeBytes: input.length,
        sha256: sha256(input),
      },
      output: {
        filename: first.outputFilename,
        sizeBytes: first.wheel.length,
        sha256: sha256(first.wheel),
      },
      delta: {
        sourceFilesChanged: [],
        metadataFilesChanged: [METADATA_PATH, RECORD_PATH],
        removedRequirements: REMOVED_REQUIREMENTS,
      },
      requiredRuntimePolicy: {
        network: 'deny',
        missingArtifact: 'fail',
        legacyFallback: 'reject',
      },
    });
    expect(first.manifest.activationBlockers).toEqual(
      expect.arrayContaining([
        'strict-offline-probe',
        'new-loader-only-probe',
        'checkpoint-product-license',
        'packaged-inference-smoke',
      ]),
    );

    const zip = new AdmZip(first.wheel);
    expect(zip.readAsText(METADATA_PATH)).toContain(PATCH_MARKER);
    const originalZip = new AdmZip(input);
    for (const entry of originalZip.getEntries()) {
      if ([METADATA_PATH, RECORD_PATH].includes(entry.entryName)) continue;
      expect(zip.readFile(entry.entryName)).toEqual(entry.getData());
    }
    expect(verifyWheelRecord(first.wheel)).toEqual({
      entryCount: zip.getEntries().filter((entry) => !entry.isDirectory).length,
      recordPath: RECORD_PATH,
    });
  });

  it('rejects the wrong upstream hash, filename, unsafe entries, and prepatched input', () => {
    const input = fixtureWheel();
    const baseOptions = {
      inputFilename: INPUT_FILENAME,
      expectedUpstreamSizeBytes: input.length,
      expectedUpstreamSha256: sha256(input),
      upstreamUrl: 'https://files.pythonhosted.org/example/audio_separator.whl',
    };

    expect(() =>
      buildPatchedWheel(input, {
        ...baseOptions,
        expectedUpstreamSha256: '0'.repeat(64),
      }),
    ).toThrow(/upstream wheel hash/i);
    expect(() =>
      buildPatchedWheel(input, {
        ...baseOptions,
        inputFilename: 'audio_separator-latest.whl',
      }),
    ).toThrow(/filename/i);

    const unsafe = new AdmZip(input);
    unsafe.addFile('safe.py', Buffer.from('bad'));
    const unsafeBuffer = unsafe.toBuffer();
    const safeName = Buffer.from('safe.py');
    const unsafeName = Buffer.from('../x.py');
    let offset = unsafeBuffer.indexOf(safeName);
    while (offset !== -1) {
      unsafeName.copy(unsafeBuffer, offset);
      offset = unsafeBuffer.indexOf(safeName, offset + safeName.length);
    }
    expect(() =>
      buildPatchedWheel(unsafeBuffer, {
        ...baseOptions,
        expectedUpstreamSizeBytes: unsafeBuffer.length,
        expectedUpstreamSha256: sha256(unsafeBuffer),
      }),
    ).toThrow(/unsafe wheel entry/i);

    const prepatched = fixtureWheel(
      metadata().replace('Version: 0.44.5', `Version: 0.44.5\n${PATCH_MARKER}`),
    );
    expect(() =>
      buildPatchedWheel(prepatched, {
        ...baseOptions,
        expectedUpstreamSizeBytes: prepatched.length,
        expectedUpstreamSha256: sha256(prepatched),
      }),
    ).toThrow(/already patched/i);
  });

  it('rejects invalid metadata, archive, size, URL, and dist-info boundaries', () => {
    expect(() => patchAudioSeparatorMetadata('')).toThrow(/metadata/i);
    expect(() =>
      patchAudioSeparatorMetadata(
        metadata().replace(REMOVED_REQUIREMENTS[0], 'diffq>=0.2'),
      ),
    ).toThrow(/reviewed requirement/i);
    expect(
      patchAudioSeparatorMetadata(metadata().replaceAll('\n', '\r\n')),
    ).toContain('\r\nX-Utawakui-Research-Patch:');

    const input = fixtureWheel();
    const valid = {
      inputFilename: INPUT_FILENAME,
      expectedUpstreamSizeBytes: input.length,
      expectedUpstreamSha256: sha256(input),
      upstreamUrl: 'https://files.pythonhosted.org/example/audio_separator.whl',
    };
    expect(() => buildPatchedWheel('not-a-buffer', valid)).toThrow(/buffer/i);
    expect(() =>
      buildPatchedWheel(input, { ...valid, expectedUpstreamSizeBytes: 0 }),
    ).toThrow(/size/i);
    expect(() =>
      buildPatchedWheel(input, {
        ...valid,
        upstreamUrl: 'http://files.pythonhosted.org/example.whl',
      }),
    ).toThrow(/url/i);

    const invalidArchive = Buffer.alloc(input.length);
    expect(() =>
      buildPatchedWheel(invalidArchive, {
        ...valid,
        expectedUpstreamSha256: sha256(invalidArchive),
      }),
    ).toThrow(/archive|dist-info/i);

    const missingMetadata = new AdmZip(input);
    missingMetadata.deleteFile(METADATA_PATH);
    const missingMetadataBuffer = missingMetadata.toBuffer();
    expect(() =>
      buildPatchedWheel(missingMetadataBuffer, {
        ...valid,
        expectedUpstreamSizeBytes: missingMetadataBuffer.length,
        expectedUpstreamSha256: sha256(missingMetadataBuffer),
      }),
    ).toThrow(/dist-info/i);

    const directoryEntry = new AdmZip(input);
    directoryEntry.addFile('unexpected/', Buffer.alloc(0));
    const directoryBuffer = directoryEntry.toBuffer();
    expect(() =>
      buildPatchedWheel(directoryBuffer, {
        ...valid,
        expectedUpstreamSizeBytes: directoryBuffer.length,
        expectedUpstreamSha256: sha256(directoryBuffer),
      }),
    ).toThrow(/unsafe wheel entry/i);

    const commaEntry = new AdmZip(input);
    commaEntry.addFile('bad,name.py', Buffer.from('bad'));
    const commaBuffer = commaEntry.toBuffer();
    expect(() =>
      buildPatchedWheel(commaBuffer, {
        ...valid,
        expectedUpstreamSizeBytes: commaBuffer.length,
        expectedUpstreamSha256: sha256(commaBuffer),
      }),
    ).toThrow(/record name/i);
  });

  it('rejects RECORD count, row, self-hash, and content-digest corruption', () => {
    const input = fixtureWheel();
    const { wheel } = buildPatchedWheel(input, {
      inputFilename: INPUT_FILENAME,
      expectedUpstreamSizeBytes: input.length,
      expectedUpstreamSha256: sha256(input),
      upstreamUrl: 'https://files.pythonhosted.org/example/audio_separator.whl',
    });

    function corruptRecord(transform) {
      const zip = new AdmZip(wheel);
      zip.updateFile(
        RECORD_PATH,
        Buffer.from(transform(zip.readAsText(RECORD_PATH))),
      );
      return zip.toBuffer();
    }

    expect(() =>
      verifyWheelRecord(corruptRecord(() => `${RECORD_PATH},,\n`)),
    ).toThrow(/count/i);
    expect(() =>
      verifyWheelRecord(corruptRecord((record) => record.replace(',', '|'))),
    ).toThrow(/row/i);
    expect(() =>
      verifyWheelRecord(
        corruptRecord((record) =>
          record.replace(`${RECORD_PATH},,`, `${RECORD_PATH},sha256=bad,1`),
        ),
      ),
    ).toThrow(/hash itself/i);
    expect(() =>
      verifyWheelRecord(
        corruptRecord((record) => record.replace('sha256=', 'sha256=bad')),
      ),
    ).toThrow(/mismatch/i);
  });
});
