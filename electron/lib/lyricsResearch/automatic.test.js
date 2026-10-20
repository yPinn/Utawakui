import { describe, expect, it, vi } from 'vitest';
import { createExperimentalLyricsQueue } from './automatic.js';

function setup() {
  const config = { experimentalLyricsAfterSeparation: false };
  const research = {
    status: vi.fn(() => ({ busy: false, status: 'ready' })),
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
  it('keeps a bounded selected source on manual requests', async () => {
    const { service, research } = setup();
    await service.setEnabled(true);
    expect(service.enqueue('track', 'auto', '../bad.lrc')).toBe(false);
    service.enqueue('track', 'auto', 'active.lrc');
    await vi.waitFor(() =>
      expect(service.status().items[0].status).toBe('ready'),
    );
    expect(research.analyze).toHaveBeenCalledWith(
      'track',
      'auto',
      'active.lrc',
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
    service.enqueue('track', 'ja');
    await vi.waitFor(() =>
      expect(service.status().items[0].reason).toBe('language-unknown'),
    );
    expect(research.analyze).toHaveBeenCalledWith('track', 'ja');
    expect(service.status().items[0].analysisLanguage).toBe('ja');
    expect(service.enqueue('other', 'ko')).toBe(false);
  });
  it('rechecks the feature gate and drains queued work without starting it when closed', async () => {
    let allowed = true;
    const config = { experimentalLyricsAfterSeparation: true };
    const research = {
      status: () => ({ status: 'ready', busy: false }),
      analyze: vi.fn(),
      cancel: vi.fn(),
    };
    const service = createExperimentalLyricsQueue({
      getConfig: () => config,
      updateConfig: Object.assign.bind(null, config),
      isAllowed: () => allowed,
      research,
    });
    expect(service.enqueue('../outside')).toBe(false);
    service.enqueue('one');
    allowed = false;
    await vi.waitFor(() =>
      expect(service.status().items[0].status).toBe('cancelled'),
    );
    expect(research.analyze).not.toHaveBeenCalled();
    await expect(service.setEnabled('yes')).rejects.toThrow();
    await expect(service.setEnabled(true)).rejects.toThrow();
  });
  it('defaults off and never downloads; enabling does not scan past tracks', async () => {
    const { service, research } = setup();
    expect(service.enqueue('track')).toBe(false);
    await service.setEnabled(true);
    expect(research.analyze).not.toHaveBeenCalled();
    expect(service.enqueue('track')).toBe(true);
    expect(service.enqueue('track')).toBe(false);
    await vi.waitFor(() =>
      expect(service.status().items[0]?.status).toBe('ready'),
    );
    expect(research.analyze).toHaveBeenCalledWith('track');
  });
  it('isolates failed analysis and keeps an explicit retry', async () => {
    const { service, research } = setup();
    research.analyze.mockRejectedValueOnce(Error('private failure'));
    await service.setEnabled(true);
    service.enqueue('track');
    await vi.waitFor(() =>
      expect(service.status().items[0]?.status).toBe('failed'),
    );
    expect(JSON.stringify(service.status())).not.toContain('private');
    service.enqueue('track');
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
    service.enqueue('one');
    service.enqueue('two');
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
    service.enqueue('one');
    await vi.waitFor(() =>
      expect(service.status().items[0]?.reason).toBe('environment-missing'),
    );
    expect(research.analyze).not.toHaveBeenCalled();
    research.status.mockReturnValue({ status: 'ready', busy: true });
    service.enqueue('two');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(research.analyze).not.toHaveBeenCalled();
    await service.cancel('two');
  });
  it('waits for other capability setup without failing the song', async () => {
    const { service, research } = setup();
    research.isAnalysisBusy = () => true;
    await service.setEnabled(true);
    service.enqueue('one');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(research.analyze).not.toHaveBeenCalled();
    expect(service.status().items[0].status).toBe('pending');
    await service.cancel('one');
  });
});
