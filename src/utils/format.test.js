import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatLongDuration,
  formatAddedDate,
} from './format.js';

describe('formatDuration', () => {
  it('formats a normal duration', () => {
    expect(formatDuration(261)).toBe('4:21');
  });

  it('formats an exact minute', () => {
    expect(formatDuration(120)).toBe('2:00');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats a sub-minute duration', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(45.9)).toBe('0:45');
  });

  it('formats ten-plus minutes', () => {
    expect(formatDuration(630)).toBe('10:30');
  });

  it('falls back to --:-- for NaN', () => {
    expect(formatDuration(NaN)).toBe('--:--');
  });

  it('falls back to --:-- for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('--:--');
  });

  it('falls back to --:-- for undefined', () => {
    expect(formatDuration(undefined)).toBe('--:--');
  });

  it('uses a caller-supplied fallback instead of --:--', () => {
    expect(formatDuration(undefined, '')).toBe('');
    expect(formatDuration(NaN, '?')).toBe('?');
  });

  // Not guarded: state.currentTime/state.duration only ever come from the
  // <audio> element, which the browser guarantees is non-negative. This
  // documents the actual (garbled) output rather than adding a guard for
  // an input that can't occur in practice.
  it("garbles negative input, which can't happen in practice", () => {
    expect(formatDuration(-5)).toBe('-1:-5');
  });
});

describe('formatLongDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatLongDuration(3900)).toBe('1 小時 5 分');
  });

  it('formats whole hours with no minutes', () => {
    expect(formatLongDuration(7200)).toBe('2 小時');
  });

  it('formats minutes only', () => {
    expect(formatLongDuration(300)).toBe('5 分');
  });

  it('rounds up to at least 1 minute for a short duration', () => {
    expect(formatLongDuration(10)).toBe('1 分');
  });

  it('returns empty string for zero, negative, or non-finite values', () => {
    expect(formatLongDuration(0)).toBe('');
    expect(formatLongDuration(-5)).toBe('');
    expect(formatLongDuration(NaN)).toBe('');
    expect(formatLongDuration(undefined)).toBe('');
  });
});

describe('formatAddedDate', () => {
  it('formats a date string in zh-Hant style', () => {
    // Midday UTC avoids the date flipping across the local-timezone
    // boundary this function reads through (getFullYear/getMonth/getDate).
    expect(formatAddedDate('2024-03-05T12:00:00.000Z')).toBe('2024年3月5日');
  });

  it('falls back to an em dash for a missing value', () => {
    expect(formatAddedDate(undefined)).toBe('—');
    expect(formatAddedDate(null)).toBe('—');
    expect(formatAddedDate('')).toBe('—');
  });

  it('falls back to an em dash for an unparseable value', () => {
    expect(formatAddedDate('not-a-date')).toBe('—');
  });
});
