import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let progressCallback;
let updatedCallback;
let prepareFeatureDependencyMock;

beforeEach(() => {
  vi.resetModules();
  prepareFeatureDependencyMock = vi.fn().mockResolvedValue({
    id: 'ffmpeg-gyan-essentials',
    installed: true,
  });
  vi.stubGlobal('window', {
    Utawakui: {
      listFeatureDependencies: vi.fn().mockResolvedValue([]),
      prepareFeatureDependency: prepareFeatureDependencyMock,
      onFeatureDependenciesUpdated: (callback) => {
        updatedCallback = callback;
        return vi.fn();
      },
      onFeatureDependencyProgress: (callback) => {
        progressCallback = callback;
        return vi.fn();
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadFeatureDependencies() {
  const { useFeatureDependencies } =
    await import('./useFeatureDependencies.js');
  return useFeatureDependencies();
}

describe('useFeatureDependencies', () => {
  it('stores dependency progress from the preload progress event', async () => {
    const dependencies = await loadFeatureDependencies();

    progressCallback({
      dependencyId: 'ffmpeg-gyan-essentials',
      stage: 'downloading',
      percent: 42,
    });

    expect(dependencies.state.progressById['ffmpeg-gyan-essentials']).toEqual({
      dependencyId: 'ffmpeg-gyan-essentials',
      stage: 'downloading',
      percent: 42,
    });
    expect(updatedCallback).toBeTypeOf('function');
  });

  it('clears dependency progress after prepare settles', async () => {
    const dependencies = await loadFeatureDependencies();

    const promise = dependencies.prepareDependency('ffmpeg-gyan-essentials');
    progressCallback({
      dependencyId: 'ffmpeg-gyan-essentials',
      stage: 'downloading',
      percent: 80,
    });
    expect(
      dependencies.state.progressById['ffmpeg-gyan-essentials'],
    ).toMatchObject({ percent: 80 });

    await promise;

    expect(
      dependencies.state.progressById['ffmpeg-gyan-essentials'],
    ).toBeUndefined();
  });
});
