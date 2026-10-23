import { describe, expect, it, vi } from 'vitest';
import { createExperimentalLyricsQueue } from './automatic.js';

function setup() {
  const config = { experimentalLyricsAfterSeparation: false };
  const research = {
    status: vi.fn(() => ({ busy: false, status: 'ready' })),
    prepareAnalysis: vi.fn(async (track, _language, source) => ({
      sourceFilename: source ?? 'main.lrc',
      sourceRevision: track + ':v1',
    })),
    analyze: vi.fn(async () => ({ status: 'ready' })),
    cancel: vi.fn(),
  };
  const service = createExperimentalLyricsQueue({
    getConfig: () => config,
    updateConfig: (patch) => Object.assign(config, patch),
    isAllowed: () => true,
    research,
  });
  return { service, config, research };
}
describe('opt-in post-separation lyrics queue', () => {
  it('exposes progress only for the running owner and clears it on cancel', async () => {
    let finish;
    const { service, research } = setup();
    await service.setEnabled(true);
    research.status.mockReturnValue({
      status: 'ready',
      busy: false,
      stage: 'content',
      progress: { stage: 'content', completed: 2, total: 4 },
    });
    research.analyze.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    research.cancel.mockImplementation(async () => finish({ cancelled: true }));
    await service.enqueue('first', 'en');
    await service.enqueue('next', 'en');
    await vi.waitFor(() => expect(research.analyze).toHaveBeenCalled());
    expect(service.status().items[0].progress).toEqual({
      stage: 'content',
      completed: 2,
      total: 4,
    });
    expect(service.status().items[1]).not.toHaveProperty('progress');
    await service.cancel();
    expect(service.status().items.every((i) => !i.progress)).toBe(true);
  });

  it('keeps a bounded selected source on manual requests', async () => {
    const { service, research } = setup();
    await service.setEnabled(true);
    expect(await service.enqueue('track', 'auto', '../bad.lrc')).toBe(false);
    await service.enqueue('track', 'auto', 'active.lrc');
    await vi.waitFor(() =>
      expect(service.status().items[0].status).toBe('ready'),
    );
    expect(research.analyze).toHaveBeenCalledWith(
      'track',
      'auto',
      'active.lrc',
      'track:v1',
    );
    expect(service.status().items[0].sourceFilename).toBe('active.lrc');
  });
  it('forwards manual language and preserves a bounded skip reason without downloads', async () => {
    const { service, research } = setup();
    await service.setEnabled(true);
    research.analyze.mockResolvedValueOnce({
      status: 'skipped',
      reason: 'language-unknown',
    });
    await service.enqueue('track', 'ja');
    await vi.waitFor(() =>
      expect(service.status().items[0].reason).toBe('language-unknown'),
    );
    expect(research.analyze).toHaveBeenCalledWith(
      'track',
      'ja',
      'main.lrc',
      'track:v1',
    );
    expect(service.status().items[0].analysisLanguage).toBe('ja');
    expect(await service.enqueue('other', 'ko')).toBe(false);
  });
  it('rechecks the feature gate and drains queued work without starting it when closed', async () => {
    let allowed = true;
    const config = { experimentalLyricsAfterSeparation: true };
    const research = {
      status: () => ({ status: 'ready', busy: false }),
      prepareAnalysis: vi.fn(async () => ({
        sourceFilename: 'main.lrc',
        sourceRevision: 'v1',
      })),
      analyze: vi.fn(),
      cancel: vi.fn(),
    };
    const service = createExperimentalLyricsQueue({
      getConfig: () => config,
      updateConfig: Object.assign.bind(null, config),
      isAllowed: () => allowed,
      research,
    });
    expect(await service.enqueue('../outside')).toBe(false);
    const admission = service.enqueue('one');
    allowed = false;
    expect(await admission).toBe(false);
    expect(service.status().items).toEqual([]);
    expect(research.analyze).not.toHaveBeenCalled();
    await expect(service.setEnabled('yes')).rejects.toThrow();
    await expect(service.setEnabled(true)).rejects.toThrow();
  });
  it('defaults off and never downloads; enabling does not scan past tracks', async () => {
    const { service, research } = setup();
    expect(await service.enqueue('track')).toBe(false);
    await service.setEnabled(true);
    expect(research.analyze).not.toHaveBeenCalled();
    expect(
      await Promise.all([service.enqueue('track'), service.enqueue('track')]),
    ).toEqual([true, false]);
    await vi.waitFor(() =>
      expect(service.status().items[0]?.status).toBe('ready'),
    );
    expect(research.analyze).toHaveBeenCalledWith(
      'track',
      'auto',
      'main.lrc',
      'track:v1',
    );
  });
  it('isolates failed analysis and keeps an explicit retry', async () => {
    const { service, research } = setup();
    research.analyze.mockRejectedValueOnce(Error('private failure'));
    await service.setEnabled(true);
    await service.enqueue('track');
    await vi.waitFor(() =>
      expect(service.status().items[0]?.status).toBe('failed'),
    );
    expect(JSON.stringify(service.status())).not.toContain('private');
    await service.enqueue('track');
    await vi.waitFor(() =>
      expect(service.status().items[0]?.status).toBe('ready'),
    );
  });
  it('cancels pending and active work on disable without resuming it', async () => {
    const { service, research } = setup();
    let finish;
    research.analyze.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    research.cancel.mockImplementation(async () => finish({ cancelled: true }));
    await service.setEnabled(true);
    await service.enqueue('one');
    await service.enqueue('two');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await service.setEnabled(false);
    await vi.waitFor(() =>
      expect(
        service.status().items.every((i) => i.status === 'cancelled'),
      ).toBe(true),
    );
    expect(research.analyze).toHaveBeenCalledTimes(1);
  });
  it('skips absent environments and defers busy environments', async () => {
    const { service, research } = setup();
    research.status.mockReturnValue({ status: 'missing', busy: false });
    await service.setEnabled(true);
    await service.enqueue('one');
    await vi.waitFor(() =>
      expect(service.status().items[0]?.reason).toBe('environment-missing'),
    );
    expect(research.analyze).not.toHaveBeenCalled();
    research.status.mockReturnValue({ status: 'ready', busy: true });
    await service.enqueue('two');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(research.analyze).not.toHaveBeenCalled();
    await service.cancel('two');
  });
  it('waits for other capability setup without failing the song', async () => {
    const { service, research } = setup();
    research.isAnalysisBusy = () => true;
    await service.setEnabled(true);
    await service.enqueue('one');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(research.analyze).not.toHaveBeenCalled();
    expect(service.status().items[0].status).toBe('pending');
    await service.cancel('one');
  });
});
