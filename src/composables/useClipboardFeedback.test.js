import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { useClipboardFeedback } from './useClipboardFeedback.js';

describe('useClipboardFeedback', () => {
  it('requires a reliable injected desktop copy action instead of browser clipboard access', async () => {
    const source = fs.readFileSync(
      new URL('./useClipboardFeedback.js', import.meta.url),
      'utf8',
    );
    const feedback = useClipboardFeedback({
      scheduleReset: vi.fn(() => 1),
      cancelReset: vi.fn(),
    });

    await expect(
      feedback.copy('copy-recording-mbid', 'Recording MBID'),
    ).resolves.toBe(false);
    expect(source).not.toMatch(/navigator[\s\S]*clipboard/u);
  });

  it('copies one bounded value and exposes short-lived success feedback', async () => {
    const writeText = vi.fn(async () => {});
    let reset = null;
    const feedback = useClipboardFeedback({
      writeText,
      scheduleReset: (callback) => {
        reset = callback;
        return 1;
      },
      cancelReset: vi.fn(),
    });

    await expect(
      feedback.copy('recording-mbid', 'Recording MBID'),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('recording-mbid');
    expect(feedback.state.value).toEqual({
      tone: 'success',
      message: '已複製 Recording MBID',
    });

    reset();
    expect(feedback.state.value).toEqual({ tone: 'idle', message: '' });
  });

  it('reports failure without exposing the clipboard exception', async () => {
    const feedback = useClipboardFeedback({
      writeText: vi.fn(async () => {
        throw new Error('private clipboard implementation detail');
      }),
      scheduleReset: vi.fn(() => 1),
      cancelReset: vi.fn(),
    });

    await expect(feedback.copy('query text', '查詢文字')).resolves.toBe(false);
    expect(feedback.state.value).toEqual({
      tone: 'error',
      message: '無法複製查詢文字，請手動選取文字',
    });
    expect(feedback.state.value.message).not.toMatch(/private|implementation/i);
  });

  it('supports action-specific success and recovery copy', async () => {
    const feedback = useClipboardFeedback({
      writeText: vi.fn(async () => {}),
      scheduleReset: vi.fn(() => 1),
      cancelReset: vi.fn(),
    });

    await feedback.copy('open-musicbrainz-recording', 'MusicBrainz', {
      successMessage: '已開啟 MusicBrainz',
      errorMessage: '無法開啟 MusicBrainz，請改用 Recording MBID 查詢。',
    });

    expect(feedback.state.value).toEqual({
      tone: 'success',
      message: '已開啟 MusicBrainz',
    });
  });

  it.each(['', 'x'.repeat(1025)])(
    'rejects an unsafe copy value without calling the clipboard: %j',
    async (value) => {
      const writeText = vi.fn(async () => {});
      const feedback = useClipboardFeedback({
        writeText,
        scheduleReset: vi.fn(() => 1),
        cancelReset: vi.fn(),
      });

      await expect(feedback.copy(value, '查詢文字')).resolves.toBe(false);
      expect(writeText).not.toHaveBeenCalled();
      expect(feedback.state.value.tone).toBe('error');
    },
  );

  it('accepts a longer value when maxLength is overridden', async () => {
    const writeText = vi.fn(async () => {});
    const feedback = useClipboardFeedback({
      writeText,
      scheduleReset: vi.fn(() => 1),
      cancelReset: vi.fn(),
      maxLength: 2000,
    });
    const longValue = 'x'.repeat(1500);

    await expect(feedback.copy(longValue, '章節清單')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(longValue);
  });

  it('cancels the pending reset when disposed', async () => {
    const cancelReset = vi.fn();
    const feedback = useClipboardFeedback({
      writeText: vi.fn(async () => {}),
      scheduleReset: vi.fn(() => 77),
      cancelReset,
    });
    await feedback.copy('query text', '查詢文字');

    feedback.dispose();

    expect(cancelReset).toHaveBeenCalledWith(77);
    expect(feedback.state.value).toEqual({ tone: 'idle', message: '' });
  });
});
