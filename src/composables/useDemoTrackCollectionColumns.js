import { useTrackCollectionColumns } from './useTrackCollectionColumns.js';

export function useDemoTrackCollectionColumns(options) {
  return useTrackCollectionColumns({
    ...options,
    gridVariable: '--demo-track-collection-grid',
  });
}
