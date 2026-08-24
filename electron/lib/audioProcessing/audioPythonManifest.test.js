import fs from 'fs';
import { describe, expect, it } from 'vitest';
import {
  assertAudioPythonEnvironmentActivatable,
  assertAudioPythonModelActivatable,
  computeAudioPythonManifestHash,
  validateAudioPythonEnvironmentLock,
  validateAudioPythonModelManifest,
  validateAudioPythonRuntimeManifest,
} from './audioPythonManifest.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function artifact(filename, sha256 = HASH_A) {
  return {
    filename,
    url: `https://downloads.example.test/${filename}`,
    sizeBytes: 1234,
    sha256,
  };
}

function license(spdx = 'MIT', productUse = 'accepted') {
  return {
    spdx,
    evidenceUrl: 'https://example.test/license',
    productUse,
    reason:
      productUse === 'accepted'
        ? null
        : 'The dependency is restricted to non-commercial use.',
  };
}

function runtimeManifest() {
  return {
    schemaVersion: 1,
    manifestKind: 'runtime-artifact',
    familyId: 'cpython-3.13.x',
    version: '3.13.10',
    platform: 'win32',
    arch: 'x64',
    entryPoint: 'python.exe',
    artifact: artifact('python-3.13.10-embed-amd64.zip'),
    license: license('Python-2.0'),
  };
}

function packageEntry({
  name,
  version,
  filename = `${name}-${version}-cp313-cp313-win_amd64.whl`,
  sha256 = HASH_A,
  resolvedDependencies = [],
}) {
  return {
    name,
    version,
    artifact: artifact(filename, sha256),
    resolvedDependencies,
    license: license(),
  };
}

function environmentLock() {
  return {
    schemaVersion: 1,
    manifestKind: 'environment-lock',
    environmentId: 'separation-cpu',
    runtime: {
      familyId: 'cpython-3.13.x',
      pythonVersion: '3.13.10',
    },
    platform: 'win32',
    arch: 'x64',
    resolver: {
      name: 'pip',
      version: '26.0.1',
    },
    requirements: [
      { name: 'audio-separator', version: '0.44.5' },
      { name: 'torch', version: '2.12.0+cpu' },
    ],
    packages: [
      packageEntry({
        name: 'audio-separator',
        version: '0.44.5',
        filename: 'audio_separator-0.44.5-py3-none-any.whl',
        resolvedDependencies: ['numpy', 'torch'],
      }),
      packageEntry({
        name: 'numpy',
        version: '2.3.2',
        sha256: HASH_B,
      }),
      packageEntry({
        name: 'torch',
        version: '2.12.0+cpu',
        sha256: HASH_C,
        resolvedDependencies: ['typing-extensions'],
      }),
      packageEntry({
        name: 'typing-extensions',
        version: '4.14.1',
        filename: 'typing_extensions-4.14.1-py3-none-any.whl',
      }),
    ],
    probeImports: ['audio_separator', 'numpy', 'torch'],
  };
}

function analysisEnvironmentLock() {
  const lock = environmentLock();
  lock.environmentId = 'analysis-structure';
  lock.requirements = [
    { name: 'all-in-one-infer', version: '3.1.0' },
    { name: 'torch', version: '2.12.0+cpu' },
  ];
  lock.packages[0] = packageEntry({
    name: 'all-in-one-infer',
    version: '3.1.0',
    filename: 'all_in_one_infer-3.1.0-py3-none-any.whl',
    resolvedDependencies: ['numpy', 'torch'],
  });
  lock.probeImports = ['allin1_infer', 'numpy', 'torch'];
  return lock;
}

function modelManifest() {
  return {
    schemaVersion: 1,
    manifestKind: 'model',
    kind: 'separation',
    id: 'bs-roformer-viperx-1297',
    version: 'upstream-317',
    architecture: 'bs-roformer',
    wrapper: {
      package: 'audio-separator',
      version: '0.44.5',
      modelFilename: 'model_bs_roformer_ep_317_sdr_12.9755.ckpt',
    },
    stems: ['instrumental', 'vocals'],
    files: [
      {
        role: 'weights',
        ...artifact('model_bs_roformer_ep_317_sdr_12.9755.ckpt'),
        license: {
          spdx: null,
          evidenceUrl: null,
          productUse: 'blocked',
          reason: 'The checkpoint weight license is not established.',
        },
      },
      {
        role: 'config',
        ...artifact('model_bs_roformer_ep_317_sdr_12.9755.yaml', HASH_B),
        license: license('MIT'),
      },
    ],
    distribution: {
      status: 'benchmark-only',
      reason: 'The checkpoint weight license is not established.',
    },
  };
}

function analysisModelManifest() {
  return {
    schemaVersion: 1,
    manifestKind: 'model',
    kind: 'analysis',
    id: 'all-in-one-harmonix-fold0',
    version: 'harmonix-fold0-v1',
    architecture: 'all-in-one-with-htdemucs',
    wrapper: {
      package: 'all-in-one-infer',
      version: '3.1.0',
      model: 'harmonix-fold0',
    },
    signals: ['tempo', 'beats', 'downbeats', 'sections'],
    files: [
      {
        role: 'structure-checkpoint',
        ...artifact('harmonix-fold0-0vra4ys2.pth'),
        license: license('CC-BY-NC-SA-4.0', 'blocked'),
      },
      {
        role: 'separation-checkpoint',
        ...artifact('htdemucs-fake.th', HASH_B),
        license: license('MIT'),
      },
      {
        role: 'separation-config',
        ...artifact('htdemucs.yaml', 'c'.repeat(64)),
        license: license('MIT'),
      },
    ],
    distribution: {
      status: 'benchmark-only',
      reason: 'The Harmonix checkpoint is restricted to non-commercial use.',
    },
  };
}

function beatThisModelManifest(model = 'small0') {
  return {
    schemaVersion: 1,
    manifestKind: 'model',
    kind: 'analysis',
    id: `beat-this-${model}`,
    version: `1.1.0-${model}`,
    architecture: 'beat-this',
    wrapper: {
      package: 'beat-this',
      version: '1.1.0',
      model,
    },
    signals: ['tempo', 'beats', 'downbeats'],
    files: [
      {
        role: 'weights',
        ...artifact(`${model}.ckpt`),
        license: license('MIT'),
      },
    ],
    distribution: {
      status: 'product-downloadable',
      reason: null,
    },
  };
}

describe('audio Python manifests', () => {
  it('accepts an exact Windows runtime artifact and hashes canonical content', () => {
    const manifest = runtimeManifest();
    expect(validateAudioPythonRuntimeManifest(manifest)).toEqual(manifest);

    const reordered = {
      ...manifest,
      artifact: {
        sha256: manifest.artifact.sha256,
        sizeBytes: manifest.artifact.sizeBytes,
        url: manifest.artifact.url,
        filename: manifest.artifact.filename,
      },
    };
    expect(computeAudioPythonManifestHash(reordered)).toBe(
      computeAudioPythonManifestHash(manifest),
    );
  });

  it('rejects mutable, ambiguous, or unsafe runtime artifacts', () => {
    for (const mutate of [
      (value) => (value.version = '3.13.*'),
      (value) => (value.platform = 'linux'),
      (value) => (value.entryPoint = '../python.exe'),
      (value) => (value.artifact.url = 'http://example.test/python.zip'),
      (value) => (value.artifact.sizeBytes = 0),
      (value) => (value.artifact.sha256 = 'latest'),
      (value) => (value.extra = true),
    ]) {
      const value = runtimeManifest();
      mutate(value);
      expect(() => validateAudioPythonRuntimeManifest(value)).toThrow();
    }
  });

  it('accepts a complete exact wheel lock with a closed dependency graph', () => {
    const lock = environmentLock();
    expect(validateAudioPythonEnvironmentLock(lock)).toEqual(lock);
    expect(assertAudioPythonEnvironmentActivatable(lock)).toEqual(lock);
  });

  it('accepts independent analysis-structure and combined-ml locks', () => {
    const analysis = analysisEnvironmentLock();
    expect(validateAudioPythonEnvironmentLock(analysis)).toEqual(analysis);

    const combined = analysisEnvironmentLock();
    combined.environmentId = 'combined-ml';
    expect(validateAudioPythonEnvironmentLock(combined)).toEqual(combined);
  });

  it('keeps a license-blocked lock valid for research but ineligible for activation', () => {
    const lock = environmentLock();
    lock.packages[0].license = license('CC-BY-NC-4.0', 'blocked');

    expect(validateAudioPythonEnvironmentLock(lock)).toEqual(lock);
    expect(() => assertAudioPythonEnvironmentActivatable(lock)).toThrow(
      /license blocked.*audio-separator/i,
    );
  });

  it('rejects incomplete, duplicate, floating, or source-distribution locks', () => {
    const missingDependency = environmentLock();
    missingDependency.packages.pop();
    expect(() => validateAudioPythonEnvironmentLock(missingDependency)).toThrow(
      /dependency/i,
    );

    const duplicate = environmentLock();
    duplicate.packages.push({ ...duplicate.packages[1] });
    expect(() => validateAudioPythonEnvironmentLock(duplicate)).toThrow(
      /duplicate/i,
    );

    const floating = environmentLock();
    floating.requirements[0].version = '>=0.44';
    expect(() => validateAudioPythonEnvironmentLock(floating)).toThrow(
      /version/i,
    );

    const sdist = environmentLock();
    sdist.packages[0].artifact.filename = 'audio-separator-0.44.5.tar.gz';
    expect(() => validateAudioPythonEnvironmentLock(sdist)).toThrow(/wheel/i);

    const unknownRequirement = environmentLock();
    unknownRequirement.requirements.push({ name: 'scipy', version: '1.16.1' });
    expect(() =>
      validateAudioPythonEnvironmentLock(unknownRequirement),
    ).toThrow(/requirement/i);
  });

  it('keeps an unlicensed weight benchmark-only and rejects product eligibility', () => {
    const candidate = modelManifest();
    expect(validateAudioPythonModelManifest(candidate)).toEqual(candidate);
    expect(() => assertAudioPythonModelActivatable(candidate)).toThrow(
      /benchmark-only/i,
    );

    const productManifest = modelManifest();
    productManifest.distribution = {
      status: 'product-downloadable',
      reason: null,
    };
    expect(() => validateAudioPythonModelManifest(productManifest)).toThrow(
      /weight license/i,
    );

    productManifest.files[0].license = license('CC-BY-4.0');
    expect(validateAudioPythonModelManifest(productManifest)).toEqual(
      productManifest,
    );
    expect(assertAudioPythonModelActivatable(productManifest)).toEqual(
      productManifest,
    );
  });

  it('requires exact model files, wrapper compatibility, and stem semantics', () => {
    for (const mutate of [
      (value) => value.files.pop(),
      (value) => (value.files[1].sha256 = 'unknown'),
      (value) => (value.wrapper.version = '>=0.44'),
      (value) => (value.stems = ['vocals']),
      (value) => (value.files[1].filename = '../config.yaml'),
    ]) {
      const value = modelManifest();
      mutate(value);
      expect(() => validateAudioPythonModelManifest(value)).toThrow();
    }
  });

  it('validates an analysis bundle separately and keeps restricted weights benchmark-only', () => {
    const candidate = analysisModelManifest();
    expect(validateAudioPythonModelManifest(candidate)).toEqual(candidate);
    expect(() => assertAudioPythonModelActivatable(candidate)).toThrow(
      /benchmark-only/i,
    );

    for (const mutate of [
      (value) => (value.signals = ['tempo', 'lyrics']),
      (value) => (value.wrapper.model = '../harmonix-fold0'),
      (value) => value.files.shift(),
      (value) => (value.files[2].role = 'unknown'),
      (value) => value.files.push({ ...value.files[0] }),
      (value) => (value.stems = ['instrumental', 'vocals']),
    ]) {
      const value = analysisModelManifest();
      mutate(value);
      expect(() => validateAudioPythonModelManifest(value)).toThrow();
    }
  });

  it('accepts product-downloadable Beat This! M1 checkpoints without section claims', () => {
    for (const model of ['small0', 'final0']) {
      const manifest = beatThisModelManifest(model);
      expect(validateAudioPythonModelManifest(manifest)).toEqual(manifest);
      expect(assertAudioPythonModelActivatable(manifest)).toEqual(manifest);
    }

    for (const mutate of [
      (value) => (value.signals = ['tempo', 'beats', 'lyrics']),
      (value) => value.files.push({ ...value.files[0] }),
      (value) => (value.files[0].role = 'structure-checkpoint'),
      (value) => (value.files[0].license = license('MIT', 'blocked')),
    ]) {
      const value = beatThisModelManifest();
      mutate(value);
      expect(() => assertAudioPythonModelActivatable(value)).toThrow();
    }
  });

  it('keeps the checked-in analysis model catalog valid and non-activatable', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        'resources/audio-processing/analysis-structure-model.json',
        'utf8',
      ),
    );

    expect(validateAudioPythonModelManifest(manifest)).toEqual(manifest);
    expect(() => assertAudioPythonModelActivatable(manifest)).toThrow(
      /benchmark-only/i,
    );
  });

  it('keeps both checked-in Beat This! model manifests valid and activatable', () => {
    for (const filename of [
      'analysis-beat-this-small0-model.json',
      'analysis-beat-this-final0-model.json',
    ]) {
      const manifest = JSON.parse(
        fs.readFileSync(`resources/audio-processing/${filename}`, 'utf8'),
      );

      expect(validateAudioPythonModelManifest(manifest)).toEqual(manifest);
      expect(assertAudioPythonModelActivatable(manifest)).toEqual(manifest);
    }
  });

  it('keeps the checked-in Beat This! runtime and wheel-only lock activatable', () => {
    const runtime = JSON.parse(
      fs.readFileSync(
        'resources/audio-processing/audio-python-runtime-3.14.7.json',
        'utf8',
      ),
    );
    const environment = JSON.parse(
      fs.readFileSync(
        'resources/audio-processing/analysis-beat-this-py314-lock.json',
        'utf8',
      ),
    );

    expect(validateAudioPythonRuntimeManifest(runtime)).toEqual(runtime);
    expect(validateAudioPythonEnvironmentLock(environment)).toEqual(
      environment,
    );
    expect(assertAudioPythonEnvironmentActivatable(environment)).toEqual(
      environment,
    );
    expect(environment.packages).toHaveLength(16);
  });
});
