import { describe, expect, it, vi } from 'vitest';
import { focusAppDestinationTrigger } from './appDestinationFocus.js';

describe('focusAppDestinationTrigger', () => {
  it('focuses the registered destination trigger', () => {
    const focus = vi.fn();
    const querySelector = vi.fn(() => ({ focus }));

    expect(focusAppDestinationTrigger('library', { querySelector })).toBe(true);
    expect(querySelector).toHaveBeenCalledWith(
      '[data-app-workflow-trigger="library"]',
    );
    expect(focus).toHaveBeenCalledOnce();
  });

  it('treats Settings as a registered Folder destination', () => {
    const focus = vi.fn();
    const querySelector = vi.fn(() => ({ focus }));

    expect(focusAppDestinationTrigger('settings', { querySelector })).toBe(
      true,
    );
    expect(querySelector).toHaveBeenCalledWith(
      '[data-app-workflow-trigger="settings"]',
    );
    expect(focus).toHaveBeenCalledOnce();
  });

  it('rejects unknown destinations and missing triggers', () => {
    const querySelector = vi.fn(() => null);

    expect(focusAppDestinationTrigger('legacy-import', { querySelector })).toBe(
      false,
    );
    expect(querySelector).not.toHaveBeenCalled();
    expect(focusAppDestinationTrigger('library', { querySelector })).toBe(
      false,
    );
  });
});
