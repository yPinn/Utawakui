import { describe, expect, it } from 'vitest';
import { useLibraryAlbumContext } from './useLibraryAlbumContext.js';

describe('useLibraryAlbumContext', () => {
  it('shares the same read-only projection across page and view consumers', () => {
    const pageContext = useLibraryAlbumContext();
    const viewContext = useLibraryAlbumContext();

    expect(pageContext.albumEntries).toBe(viewContext.albumEntries);
    expect(pageContext.albumSupportingContent).toBe(
      viewContext.albumSupportingContent,
    );
  });
});
