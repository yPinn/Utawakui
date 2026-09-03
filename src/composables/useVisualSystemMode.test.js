import { describe, expect, it } from 'vitest';
import { useVisualSystemMode } from './useVisualSystemMode.js';

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
});
