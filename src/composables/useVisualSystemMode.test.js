import { describe, expect, it } from 'vitest';
import {
  isStudioLibraryComparisonMode,
  useVisualSystemMode,
} from './useVisualSystemMode.js';

describe('useVisualSystemMode', () => {
  it('defaults to the Demo sub-mode and shares state across every consumer', () => {
    const first = useVisualSystemMode();
    const second = useVisualSystemMode();

    expect(first.mode.value).toBe('demo');

    second.setMode('studio-library');
    expect(first.mode.value).toBe('studio-library');

    first.setMode('demo');
    expect(second.mode.value).toBe('demo');
  });

  it('ignores an unrecognized mode', () => {
    const workbench = useVisualSystemMode();

    workbench.setMode('not-a-real-mode');

    expect(workbench.mode.value).toBe('demo');
  });

  it('keeps Candidate and Current inside one Studio Library comparison boundary', () => {
    const workbench = useVisualSystemMode();

    workbench.setMode('setlist-current');

    expect(workbench.mode.value).toBe('setlist-current');
    expect(isStudioLibraryComparisonMode('studio-library')).toBe(true);
    expect(isStudioLibraryComparisonMode('setlist-current')).toBe(true);
    expect(isStudioLibraryComparisonMode('demo')).toBe(false);

    workbench.setMode('demo');
  });
});
