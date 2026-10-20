import { describe, expect, it, vi } from 'vitest';
import { createResearchService } from './service.js';

function setup(overrides = {}) {
  const calls = [];
  const environment = {
    exists: () => false,
    prepare: vi.fn(async () => calls.push('prepare')),
    verify: vi.fn(async () => calls.push('verify')),
    remove: vi.fn(async () => calls.push('remove')),
    ...overrides.environment,
  };
  const service = createResearchService({
    environment,
    loadInput: vi.fn(async () => ({
      identity: 'frozen',
      canonical: { lines: [] },
    })),
    runPreview: vi.fn(async () => ({ researchOnly: true, lines: [] })),
    ...overrides,
  });
  return { service, calls, environment };
}
describe('independent local research lifecycle', () => {
  it('binds a modal request to its selected source before loading and before publishing', async () => {
    const publishEstimate = vi.fn();
    const runPreview = vi.fn(async () => ({ lines: [] }));
    const loadAutomaticInput = vi.fn(async () => ({
      identity: 'same',
      language: 'ja',
      source: { filename: 'other.lrc' },
    }));
    const { service, calls } = setup({
      loadAutomaticInput,
      runPreview,
      publishEstimate,
      isAnalysisAllowed: () => true,
    });
    expect(await service.analyze('one', 'ja', 'active.lrc')).toEqual({
      status: 'skipped',
      reason: 'source-changed',
    });
    expect(calls).toEqual([]);
    expect(runPreview).not.toHaveBeenCalled();
    loadAutomaticInput.mockResolvedValueOnce({
      identity: 'same',
      language: 'ja',
      source: { filename: 'active.lrc' },
    });
    await expect(service.analyze('one', 'ja', 'active.lrc')).rejects.toThrow(
      'source changed',
    );
    expect(publishEstimate).not.toHaveBeenCalled();
    await expect(
      service.analyze('one', 'ja', '../outside.lrc'),
    ).rejects.toThrow();
  });
  it('forwards a one-task language and returns precise skips before loading models', async () => {
    const loadAutomaticInput = vi.fn(async () => ({
      status: 'skipped',
      reason: 'native-t2',
    }));
    const { service, calls } = setup({
      loadAutomaticInput,
      isAnalysisAllowed: () => true,
    });
    expect(await service.analyze('one', 'ja')).toEqual({
      status: 'skipped',
      reason: 'native-t2',
    });
    expect(loadAutomaticInput).toHaveBeenCalledWith('one', 'ja');
    expect(calls).toEqual([]);
    await expect(service.analyze('one', 'ko')).rejects.toThrow();
  });
  it('automatic analysis verifies a cold installed environment, processes the whole song and publishes only current results', async () => {
    const input = { identity: 'current', language: 'ja' };
    const publishEstimate = vi.fn(async (_input, _result, current) => {
      expect(current()).toBe(true);
      return { status: 'ready' };
    });
    const runPreview = vi.fn(async () => ({ lines: [] }));
    const { service, calls } = setup({
      loadAutomaticInput: async () => input,
      isAnalysisAllowed: () => true,
      publishEstimate,
      runPreview,
    });
    expect(await service.analyze('one')).toEqual({ status: 'ready' });
    expect(calls).toEqual(['verify']);
    expect(runPreview.mock.calls[0][1]).toMatchObject({
      wholeSong: true,
      language: 'ja',
    });
    expect(publishEstimate).toHaveBeenCalledTimes(1);
  });
  it('automatic analysis skips unsupported input and never publishes a changed source', async () => {
    const publishEstimate = vi.fn();
    const loadAutomaticInput = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ identity: 'old', language: 'zh' })
      .mockResolvedValueOnce({ identity: 'new' });
    const { service, calls } = setup({
      loadAutomaticInput,
      publishEstimate,
      isAnalysisAllowed: () => true,
    });
    expect(await service.analyze('one')).toEqual({ status: 'skipped' });
    expect(calls).toEqual([]);
    await expect(service.analyze('one')).rejects.toThrow('source changed');
    expect(publishEstimate).not.toHaveBeenCalled();
    expect(service.status().status).toBe('ready');
    await expect(setup().service.analyze('one')).rejects.toThrow('unavailable');
  });
  it('exposes setup contention to the automatic queue without claiming research ownership', () => {
    const { service } = setup({ isSetupBusy: () => true });
    expect(service.isAnalysisBusy()).toBe(true);
    expect(service.status().busy).toBe(false);
  });
  it('does no download or activation on construction/status and requires explicit prepare', async () => {
    const { service, calls } = setup();
    expect(service.status()).toMatchObject({
      status: 'missing',
      researchOnly: true,
      busy: false,
    });
    expect(calls).toEqual([]);
    await service.prepare();
    expect(calls).toEqual(['prepare', 'verify']);
    expect(service.status().status).toBe('ready');
  });
  it('requires a real load verification before preview; discards a failed preview', async () => {
    const runPreview = vi.fn().mockRejectedValue(Error('private path'));
    const { service } = setup({ runPreview });
    await expect(
      service.preview({ trackId: 'one', language: 'ja', lineIndex: 0 }),
    ).rejects.toThrow();
    expect(runPreview).not.toHaveBeenCalled();
    await service.verify();
    await expect(
      service.preview({ trackId: 'one', language: 'ja', lineIndex: 0 }),
    ).rejects.toThrow();
    expect(service.status()).toMatchObject({ busy: false, status: 'damaged' });
    expect(service.status()).not.toHaveProperty('preview');
  });
  it('keeps single ownership until cancellation cleanup finishes and permits retry', async () => {
    let release, signal;
    const prepare = vi.fn(async (options) => {
      signal = options.signal;
      await new Promise((resolve) => {
        release = resolve;
      });
      signal.throwIfAborted();
    });
    const { service } = setup({
      environment: {
        exists: () => false,
        prepare,
        verify: vi.fn(),
        remove: vi.fn(),
      },
    });
    const work = service.prepare();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const cancellation = service.cancel();
    expect(signal.aborted).toBe(true);
    expect(service.status().busy).toBe(true);
    await expect(service.verify()).rejects.toThrow();
    release();
    expect(await work).toMatchObject({ cancelled: true });
    await cancellation;
    expect(service.status().busy).toBe(false);
    await service.verify();
    expect(service.status().status).toBe('ready');
  });
  it('rejects renderer paths, extra keys, unsupported languages and unbounded indices', async () => {
    const { service } = setup();
    for (const intent of [
      { trackId: '../outside', language: 'zh', lineIndex: 0 },
      { trackId: 'x', language: 'ko', lineIndex: 0 },
      { trackId: 'x', language: 'ja', lineIndex: -1 },
      { trackId: 'x', language: 'ja', lineIndex: 0, modelPath: 'C:/secret' },
    ])
      await expect(service.preview(intent)).rejects.toThrow();
  });
  it('rejects source changes after inference and does not return stale chunks', async () => {
    const loadInput = vi
      .fn()
      .mockResolvedValueOnce({ identity: 'old' })
      .mockResolvedValueOnce({ identity: 'new' });
    const { service } = setup({ loadInput });
    await service.verify();
    await expect(
      service.preview({ trackId: 'x', language: 'zh', lineIndex: 0 }),
    ).rejects.toThrow('changed');
  });
  it('removes only through its own environment and resets verification', async () => {
    const { service, calls } = setup();
    await service.verify();
    await service.remove();
    expect(calls).toEqual(['verify', 'remove']);
    expect(service.status().status).toBe('missing');
  });
});
