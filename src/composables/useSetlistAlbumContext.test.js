import { describe, expect, it } from 'vitest';
import { useSetlistAlbumContext } from './useSetlistAlbumContext.js';

describe('useSetlistAlbumContext', () => {
  it('shares the same read-only projection across page and view consumers', () => {
    const pageContext = useSetlistAlbumContext();
    const viewContext = useSetlistAlbumContext();

    expect(pageContext.albumEntries).toBe(viewContext.albumEntries);
    expect(pageContext.albumSupportingContent).toBe(
      viewContext.albumSupportingContent,
    );
  });
});
