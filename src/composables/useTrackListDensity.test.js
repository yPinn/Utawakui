import { describe, expect, it } from 'vitest';
import { useTrackListDensity } from './useTrackListDensity.js';

describe('useTrackListDensity', () => {
  it('keeps one bounded session value behind an explicit setter', () => {
    const first = useTrackListDensity();
    const second = useTrackListDensity();

    first.setDensity('compact');
    expect(first.density.value).toBe('compact');
    expect(second.density.value).toBe('compact');

    second.setDensity('unsupported');
    expect(first.density.value).toBe('compact');

    first.setDensity('list');
    expect(second.density.value).toBe('list');
  });
});
