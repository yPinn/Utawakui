import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisReferenceAnnotation } from './useMusicAnalysisReferenceAnnotation.js';

function dataset() {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    benchmarkId: 'pilot-01',
    annotationState: 'draft',
    allowedRoles: ['intro', 'verse', 'chorus'],
    cases: [
      {
        id: 'case-01',
        trackId: 'track-01',
        tags: ['j-pop'],
        durationMs: 120000,
        referenceBpm: null,
        referenceSections: [{ startMs: 0, endMs: 120000, role: null }],
        complete: false,
      },
    ],
  };
}

describe('useMusicAnalysisReferenceAnnotation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('opens a blind worklist and selects the first case', async () => {
    const value = dataset();
    const bridge = {
      openMusicAnalysisReferenceAnnotation: vi.fn(async () => value),
      saveMusicAnalysisReferenceAnnotation: vi.fn(),
    };
    const annotation = useMusicAnalysisReferenceAnnotation(bridge);

    await annotation.open();

    expect(annotation.dataset.value).toEqual(value);
    expect(annotation.selectedCase.value?.id).toBe('case-01');
    expect(annotation.dirty.value).toBe(false);
  });

  it('authors BPM, boundaries, and roles then saves only bounded cases', async () => {
    const value = dataset();
    const bridge = {
      openMusicAnalysisReferenceAnnotation: vi.fn(async () => value),
      saveMusicAnalysisReferenceAnnotation: vi.fn(async (payload) => ({
        ...value,
        annotationState: 'complete',
        cases: payload.cases.map((item) => ({
          ...value.cases[0],
          ...item,
          complete: true,
        })),
      })),
    };
    const annotation = useMusicAnalysisReferenceAnnotation(bridge);
    await annotation.open();

    annotation.updateBpm('case-01', 128);
    annotation.addBoundary('case-01', 30000);
    annotation.updateRole('case-01', 0, 'intro');
    annotation.updateRole('case-01', 1, 'chorus');

    expect(annotation.dirty.value).toBe(true);
    expect(annotation.selectedCase.value?.complete).toBe(true);
    await annotation.save();
    expect(bridge.saveMusicAnalysisReferenceAnnotation).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cases: [
        {
          id: 'case-01',
          referenceBpm: 128,
          referenceSections: [
            { startMs: 0, endMs: 30000, role: 'intro' },
            { startMs: 30000, endMs: 120000, role: 'chorus' },
          ],
        },
      ],
    });
    expect(annotation.dirty.value).toBe(false);
  });

  it('preserves the current draft when opening is cancelled', async () => {
    const value = dataset();
    const bridge = {
      openMusicAnalysisReferenceAnnotation: vi
        .fn()
        .mockResolvedValueOnce(value)
        .mockResolvedValueOnce(null),
      saveMusicAnalysisReferenceAnnotation: vi.fn(),
    };
    const annotation = useMusicAnalysisReferenceAnnotation(bridge);

    await annotation.open();
    annotation.updateBpm('case-01', 120);
    await annotation.open();

    expect(annotation.selectedCase.value?.referenceBpm).toBe(120);
    expect(annotation.dirty.value).toBe(true);
  });

  it('selects the next incomplete case and wraps once', async () => {
    const value = dataset();
    value.cases.push(
      { ...value.cases[0], id: 'case-02', trackId: 'track-02', complete: true },
      { ...value.cases[0], id: 'case-03', trackId: 'track-03' },
    );
    const annotation = useMusicAnalysisReferenceAnnotation({
      openMusicAnalysisReferenceAnnotation: vi.fn(async () => value),
    });
    await annotation.open();

    expect(annotation.selectNextIncomplete()).toBe('case-03');
    expect(annotation.selectedCaseId.value).toBe('case-03');
    expect(annotation.selectNextIncomplete()).toBe('case-01');
  });

  it('debounces draft saving and preserves edits made during an in-flight save', async () => {
    vi.useFakeTimers();
    let resolveSave;
    const pendingSave = new Promise((resolve) => {
      resolveSave = resolve;
    });
    const value = dataset();
    const bridge = {
      openMusicAnalysisReferenceAnnotation: vi.fn(async () => value),
      saveMusicAnalysisReferenceAnnotation: vi.fn(() => pendingSave),
    };
    const annotation = useMusicAnalysisReferenceAnnotation(bridge, {
      autosaveDelayMs: 500,
    });
    await annotation.open();

    annotation.updateBpm('case-01', 120);
    await vi.advanceTimersByTimeAsync(500);
    expect(bridge.saveMusicAnalysisReferenceAnnotation).toHaveBeenCalledOnce();

    annotation.updateBpm('case-01', 128);
    resolveSave({
      ...value,
      cases: [{ ...value.cases[0], referenceBpm: 120 }],
    });
    await pendingSave;

    expect(annotation.selectedCase.value.referenceBpm).toBe(128);
    expect(annotation.dirty.value).toBe(true);
  });
});
