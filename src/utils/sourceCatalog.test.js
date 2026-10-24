import { expect, it } from 'vitest';
import { projectSourceCatalogRows } from './sourceCatalog.js';
it('keeps source positions and admits only current canonical local tracks', () => {
  expect(projectSourceCatalogRows(null, new Map())).toEqual([]);
  expect(
    projectSourceCatalogRows(
      {
        rows: [
          { state: 'available', localTrackId: 'absent' },
          { state: 'other' },
        ],
      },
      new Map(),
    ).map((row) => [row.track, row.stateLabel]),
  ).toEqual([
    [null, '本地可用'],
    [null, '待確認'],
  ]);
  const local = {
    id: 'local',
    title: 'Local title',
    thumbnailUrl: 'local-art',
  };
  const rows = projectSourceCatalogRows(
    {
      rows: [
        {
          key: 'slot-1',
          position: 1,
          title: 'Not imported',
          state: 'not-imported',
        },
        {
          key: 'slot-5',
          position: 5,
          title: 'Source',
          state: 'available',
          localTrackId: 'local',
        },
        {
          key: 'slot-6',
          position: 6,
          state: 'missing',
          linkedTrackId: 'local',
        },
      ],
    },
    new Map([['local', local]]),
  );
  expect(rows.map((row) => row.position)).toEqual([1, 5, 6]);
  expect(rows[0].track).toBeNull();
  expect(rows[1].track).toBe(local);
  expect(rows[1].track.thumbnailUrl).toBe('local-art');
  expect(rows[2].track).toBeNull();
});
