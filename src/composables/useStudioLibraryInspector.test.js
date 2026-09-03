import { describe, expect, it } from 'vitest';
import { useStudioLibraryInspector } from './useStudioLibraryInspector.js';

describe('Studio Library Inspector session state', () => {
  it('defaults to collapsed and shares the open state across view consumers', () => {
    const first = useStudioLibraryInspector();
    const second = useStudioLibraryInspector();

    expect(first.isInspectorOpen.value).toBe(false);

    second.toggleInspector();
    expect(first.isInspectorOpen.value).toBe(true);

    first.toggleInspector();
    expect(second.isInspectorOpen.value).toBe(false);

    first.setInspectorOpen(true);
    expect(second.isInspectorOpen.value).toBe(true);

    second.setInspectorOpen(false);
  });
});
