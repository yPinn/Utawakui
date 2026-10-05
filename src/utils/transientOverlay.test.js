import { describe, expect, it, vi } from 'vitest';
import { hasOpenTransientOverlay } from './transientOverlay.js';

describe('hasOpenTransientOverlay', () => {
  it('detects open dialogs and menus through one selector', () => {
    const querySelector = vi.fn(() => ({}));
    expect(hasOpenTransientOverlay({ querySelector })).toBe(true);
    const selector = querySelector.mock.calls[0][0];
    expect(selector).toContain('[role="dialog"]');
    expect(selector).toContain('[role="menu"]');
  });

  it('is false when nothing is open or there is no document', () => {
    expect(hasOpenTransientOverlay({ querySelector: () => null })).toBe(false);
    expect(hasOpenTransientOverlay(undefined)).toBe(false);
  });
});
