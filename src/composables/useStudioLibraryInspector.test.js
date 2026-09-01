import { describe, expect, it } from 'vitest';
import { useStudioLibraryInspector } from './useStudioLibraryInspector.js';

describe('Studio Library Inspector session state', () => {
  it('shares the open state across view consumers for the current session', () => {
    const first = useStudioLibraryInspector();
    const second = useStudioLibraryInspector();

    first.setInspectorOpen(false);
    expect(second.isInspectorOpen.value).toBe(false);

    second.toggleInspector();
    expect(first.isInspectorOpen.value).toBe(true);

    first.toggleInspector();
    expect(second.isInspectorOpen.value).toBe(false);

    first.setInspectorOpen(true);
  });
});
