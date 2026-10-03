import { describe, expect, it } from 'vitest';
import {
  isStudioLibraryMode,
  useVisualSystemMode,
} from './useVisualSystemMode.js';

describe('useVisualSystemMode', () => {
  it('defaults to the final decision board and shares state across every consumer', () => {
    const first = useVisualSystemMode();
    const second = useVisualSystemMode();

    expect(first.mode.value).toBe('final-board');

    second.setMode('studio-library');
    expect(first.mode.value).toBe('studio-library');

    first.setMode('final-board');
    expect(second.mode.value).toBe('final-board');
  });

  it('ignores an unrecognized mode', () => {
    const workbench = useVisualSystemMode();

    workbench.setMode('not-a-real-mode');

    expect(workbench.mode.value).toBe('final-board');
  });

  it('keeps Studio Library as the only full-page Candidate mode', () => {
    const workbench = useVisualSystemMode();

    workbench.setMode('studio-library');
    expect(workbench.mode.value).toBe('studio-library');
    expect(isStudioLibraryMode('studio-library')).toBe(true);
    expect(isStudioLibraryMode('setlist-current')).toBe(false);
    expect(isStudioLibraryMode('demo')).toBe(false);
    expect(isStudioLibraryMode('final-board')).toBe(false);

    workbench.setMode('setlist-current');
    expect(workbench.mode.value).toBe('studio-library');

    workbench.setMode('final-board');
  });
});
