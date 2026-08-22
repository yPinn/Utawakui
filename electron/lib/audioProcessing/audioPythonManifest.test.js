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
});
