import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARTIST_ORGANIZATION_FILENAME,
  applyArtistCatalog,
  loadArtistOrganization,
  mergeArtistOrganizations,
  setArtistDisplayName,
  splitArtistOrganization,
  undoArtistOrganization,
} from './artistOrganization.js';

const STABLE_ID = 'artist-123e4567-e89b-42d3-a456-426614174000';
const LIN_MBID = '11111111-1111-4111-8111-111111111111';
const LIN_CATALOG = {
  mbid: LIN_MBID,
  name: '林俊傑',
  sortName: 'Lin, JJ',
  type: 'Person',
  disambiguation: 'Singaporean singer-songwriter',
  aliases: [
    { name: 'JJ Lin', locale: 'en', primary: true, type: 'Artist name' },
  ],
  fetchedAt: '2026-10-12T02:00:00.000Z',
};

function artist(id, name, credits = [{ id: `credit-${id}`, name }]) {
  return { id, name, credits, trackIds: [] };
}

function index(artists, revision = 0) {
  return { artists, organizationRevision: revision };
}

describe('artist organization store', () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-artist-organization-'),
    );
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('starts empty without creating artists.json on read', () => {
    expect(loadArtistOrganization(directory)).toEqual({
      version: 1,
      revision: 0,
      artists: [],
      redirects: [],
      trackLinks: [],
      dismissed: [],
      history: [],
    });
    expect(
      fs.existsSync(path.join(directory, ARTIST_ORGANIZATION_FILENAME)),
    ).toBe(false);
  });

  it('backs up a malformed document instead of overwriting it', () => {
    const filePath = path.join(directory, ARTIST_ORGANIZATION_FILENAME);
    fs.writeFileSync(filePath, '{broken');

    expect(loadArtistOrganization(directory).artists).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(
      fs
        .readdirSync(directory)
        .filter((name) =>
          name.startsWith(`${ARTIST_ORGANIZATION_FILENAME}.corrupted-`),
        ),
    ).toHaveLength(1);
  });

  it('backs up an oversized document before parsing it', () => {
    const filePath = path.join(directory, ARTIST_ORGANIZATION_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        revision: 0,
        artists: [],
        trackLinks: [],
        dismissed: [],
        history: [],
        padding: 'x'.repeat(1024 * 1024),
      }),
    );

    expect(loadArtistOrganization(directory).artists).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(
      fs
        .readdirSync(directory)
        .filter((name) =>
          name.startsWith(`${ARTIST_ORGANIZATION_FILENAME}.corrupted-`),
        ),
    ).toHaveLength(1);
  });

  it('merges two current artists into one durable entity and round-trips it', () => {
    const current = index([
      artist('artist-jj', 'JJ Lin', [
        { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
      ]),
      artist('artist-lin', '林俊傑', [
        { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
      ]),
    ]);

    const result = mergeArtistOrganizations(
      directory,
      current,
      ['artist-jj', 'artist-lin'],
      {
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
        now: new Date('2026-10-12T01:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      status: 'ok',
      changed: true,
      artistId: STABLE_ID,
      revision: 1,
    });
    expect(loadArtistOrganization(directory)).toMatchObject({
      revision: 1,
      artists: [
        {
          id: STABLE_ID,
          credits: [
            {
              id: 'credit-jj',
              key: 'jj lin',
              raw: 'JJ Lin',
              normalizerVersion: 1,
              source: 'user',
            },
            {
              id: 'credit-lin',
              key: '林俊傑',
              raw: '林俊傑',
              normalizerVersion: 1,
              source: 'user',
            },
          ],
        },
      ],
      history: [{ kind: 'merge' }],
    });
  });

  it('rejects stale revisions and unknown artist ids without writing', () => {
    const current = index([artist('artist-jj', 'JJ Lin')]);

    expect(
      mergeArtistOrganizations(directory, current, ['artist-jj', 'missing'], {
        expectedRevision: 0,
      }),
    ).toEqual({ status: 'error', reason: 'artist-unavailable' });
    expect(
      mergeArtistOrganizations(directory, current, ['artist-jj', 'artist-jj'], {
        expectedRevision: 1,
      }),
    ).toEqual({ status: 'conflict', revision: 0 });
    expect(
      fs.existsSync(path.join(directory, ARTIST_ORGANIZATION_FILENAME)),
    ).toBe(false);
  });

  it('sets a bounded display override and keeps the stable entity id', () => {
    const first = index([
      artist('artist-jj', 'JJ Lin', [
        { id: 'credit-jj', name: 'JJ Lin', trackCount: 2 },
      ]),
    ]);
    const created = setArtistDisplayName(
      directory,
      first,
      'artist-jj',
      ' 林俊傑 ',
      {
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
        now: new Date('2026-10-12T01:00:00.000Z'),
      },
    );
    expect(created).toMatchObject({
      status: 'ok',
      changed: true,
      artistId: STABLE_ID,
      revision: 1,
    });
    expect(loadArtistOrganization(directory).artists[0]).toMatchObject({
      id: STABLE_ID,
      displayNameOverride: '林俊傑',
    });

    const organized = index(
      [
        artist(STABLE_ID, '林俊傑', [
          { id: 'credit-jj', name: 'JJ Lin', trackCount: 2 },
        ]),
      ],
      1,
    );
    const updated = setArtistDisplayName(
      directory,
      organized,
      STABLE_ID,
      'J'.repeat(400),
      {
        expectedRevision: 1,
        now: new Date('2026-10-12T01:01:00.000Z'),
      },
    );
    expect(updated.revision).toBe(2);
    expect(
      loadArtistOrganization(directory).artists[0].displayNameOverride,
    ).toHaveLength(200);
  });

  it('splits one credited form and can undo the split', () => {
    const mergedIndex = index([
      artist(STABLE_ID, '林俊傑', [
        { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
        { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
      ]),
    ]);
    mergeArtistOrganizations(
      directory,
      index([
        artist('artist-jj', 'JJ Lin', [{ id: 'credit-jj', name: 'JJ Lin' }]),
        artist('artist-lin', '林俊傑', [{ id: 'credit-lin', name: '林俊傑' }]),
      ]),
      ['artist-jj', 'artist-lin'],
      {
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
        now: new Date('2026-10-12T01:00:00.000Z'),
      },
    );

    expect(
      splitArtistOrganization(directory, mergedIndex, STABLE_ID, 'credit-jj', {
        expectedRevision: 1,
        now: new Date('2026-10-12T01:02:00.000Z'),
      }),
    ).toEqual({
      status: 'ok',
      changed: true,
      artistId: STABLE_ID,
      revision: 2,
    });
    expect(loadArtistOrganization(directory).artists[0].credits).toEqual([
      expect.objectContaining({ id: 'credit-lin', raw: '林俊傑' }),
    ]);

    expect(
      undoArtistOrganization(directory, {
        expectedRevision: 2,
      }),
    ).toEqual({ status: 'ok', changed: true, revision: 3 });
    expect(
      loadArtistOrganization(directory).artists[0].credits.map(
        (credit) => credit.id,
      ),
    ).toEqual(['credit-jj', 'credit-lin']);
  });

  it('persists bounded catalog facts and auto-merges another credit with the same MBID', () => {
    const first = applyArtistCatalog(
      directory,
      index([artist('artist-jj', 'JJ Lin')]),
      'artist-jj',
      LIN_CATALOG,
      {
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
        now: new Date('2026-10-12T02:00:00.000Z'),
      },
    );
    expect(first).toMatchObject({
      status: 'ok',
      changed: true,
      artistId: STABLE_ID,
      revision: 1,
    });
    expect(loadArtistOrganization(directory).artists[0]).toMatchObject({
      id: STABLE_ID,
      catalog: LIN_CATALOG,
      credits: [{ raw: 'JJ Lin', source: 'musicbrainz' }],
    });

    const second = applyArtistCatalog(
      directory,
      index(
        [
          artist(STABLE_ID, '林俊傑', [
            { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
          ]),
          artist('artist-lin', '林俊傑', [
            { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
          ]),
        ],
        1,
      ),
      'artist-lin',
      LIN_CATALOG,
      {
        expectedRevision: 1,
        now: new Date('2026-10-12T02:01:00.000Z'),
      },
    );
    expect(second).toMatchObject({
      status: 'ok',
      changed: true,
      artistId: STABLE_ID,
      autoMerged: true,
      revision: 2,
    });
    expect(loadArtistOrganization(directory).artists).toEqual([
      expect.objectContaining({
        id: STABLE_ID,
        catalog: expect.objectContaining({ mbid: LIN_CATALOG.mbid }),
        credits: [
          expect.objectContaining({ raw: 'JJ Lin' }),
          expect.objectContaining({ raw: '林俊傑' }),
        ],
      }),
    ]);
  });

  it('persists bounded dismissed evidence and drops malformed entries on reload', () => {
    const filePath = path.join(directory, ARTIST_ORGANIZATION_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        revision: 0,
        artists: [],
        redirects: [],
        trackLinks: [],
        dismissed: [
          { kind: 'credit-mbid', creditKey: 'jj lin', mbid: LIN_MBID },
          {
            kind: 'credit-pair',
            leftKey: '林俊傑',
            rightKey: 'jj lin',
          },
          { kind: 'credit-mbid', creditKey: 'JJ Lin', mbid: LIN_MBID },
          { kind: 'unknown', creditKey: 'jj lin', mbid: LIN_MBID },
        ],
        history: [],
      }),
    );

    expect(loadArtistOrganization(directory).dismissed).toEqual([
      { kind: 'credit-mbid', creditKey: 'jj lin', mbid: LIN_MBID },
      { kind: 'credit-pair', leftKey: 'jj lin', rightKey: '林俊傑' },
    ]);
  });

  it('keeps an automatic split separate across restart and restores it on undo', () => {
    applyArtistCatalog(
      directory,
      index([
        artist('artist-jj', 'JJ Lin', [
          { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
        ]),
      ]),
      'artist-jj',
      LIN_CATALOG,
      {
        automatic: true,
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
      },
    );
    applyArtistCatalog(
      directory,
      index(
        [
          artist(STABLE_ID, '林俊傑', [
            { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
          ]),
          artist('artist-lin', '林俊傑', [
            { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
          ]),
        ],
        1,
      ),
      'artist-lin',
      LIN_CATALOG,
      { automatic: true, expectedRevision: 1 },
    );

    expect(
      splitArtistOrganization(
        directory,
        index(
          [
            artist(STABLE_ID, '林俊傑', [
              { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
              { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
            ]),
          ],
          2,
        ),
        STABLE_ID,
        'credit-jj',
        { expectedRevision: 2 },
      ),
    ).toMatchObject({ status: 'ok', revision: 3 });
    expect(loadArtistOrganization(directory).dismissed).toEqual([
      { kind: 'credit-pair', leftKey: 'jj lin', rightKey: '林俊傑' },
      { kind: 'credit-mbid', creditKey: 'jj lin', mbid: LIN_MBID },
    ]);

    expect(
      applyArtistCatalog(
        directory,
        index(
          [
            artist(STABLE_ID, '林俊傑', [
              { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
            ]),
            artist('artist-jj', 'JJ Lin', [
              { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
            ]),
          ],
          3,
        ),
        'artist-jj',
        LIN_CATALOG,
        { automatic: true, expectedRevision: 3 },
      ),
    ).toEqual({
      status: 'skipped',
      reason: 'user-dismissed',
      revision: 3,
    });
    expect(loadArtistOrganization(directory).revision).toBe(3);

    expect(
      undoArtistOrganization(directory, { expectedRevision: 3 }),
    ).toMatchObject({ status: 'ok', revision: 4 });
    expect(loadArtistOrganization(directory)).toMatchObject({
      dismissed: [],
      artists: [
        expect.objectContaining({
          id: STABLE_ID,
          credits: [
            expect.objectContaining({ id: 'credit-jj' }),
            expect.objectContaining({ id: 'credit-lin' }),
          ],
        }),
      ],
    });
  });

  it('allows an explicit catalog apply to clear a prior split exclusion', () => {
    applyArtistCatalog(
      directory,
      index([
        artist('artist-jj', 'JJ Lin', [
          { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
        ]),
      ]),
      'artist-jj',
      LIN_CATALOG,
      {
        automatic: true,
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
      },
    );
    applyArtistCatalog(
      directory,
      index(
        [
          artist(STABLE_ID, '林俊傑', [
            { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
          ]),
          artist('artist-lin', '林俊傑', [
            { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
          ]),
        ],
        1,
      ),
      'artist-lin',
      LIN_CATALOG,
      { automatic: true, expectedRevision: 1 },
    );
    splitArtistOrganization(
      directory,
      index(
        [
          artist(STABLE_ID, '林俊傑', [
            { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
            { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
          ]),
        ],
        2,
      ),
      STABLE_ID,
      'credit-jj',
      { expectedRevision: 2 },
    );

    expect(
      applyArtistCatalog(
        directory,
        index(
          [
            artist(STABLE_ID, '林俊傑', [
              { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
            ]),
            artist('artist-jj', 'JJ Lin', [
              { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
            ]),
          ],
          3,
        ),
        'artist-jj',
        LIN_CATALOG,
        { automatic: false, expectedRevision: 3 },
      ),
    ).toMatchObject({
      status: 'ok',
      autoMerged: true,
      artistId: STABLE_ID,
      revision: 4,
    });
    expect(loadArtistOrganization(directory).dismissed).toEqual([]);
  });

  it('allows an explicit merge to clear all exclusions between split credits', () => {
    applyArtistCatalog(
      directory,
      index([
        artist('artist-jj', 'JJ Lin', [
          { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
        ]),
      ]),
      'artist-jj',
      LIN_CATALOG,
      {
        automatic: true,
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
      },
    );
    applyArtistCatalog(
      directory,
      index(
        [
          artist(STABLE_ID, '林俊傑', [
            { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
          ]),
          artist('artist-lin', '林俊傑', [
            { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
          ]),
        ],
        1,
      ),
      'artist-lin',
      LIN_CATALOG,
      { automatic: true, expectedRevision: 1 },
    );
    splitArtistOrganization(
      directory,
      index(
        [
          artist(STABLE_ID, '林俊傑', [
            { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
            { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
          ]),
        ],
        2,
      ),
      STABLE_ID,
      'credit-jj',
      { expectedRevision: 2 },
    );

    expect(
      mergeArtistOrganizations(
        directory,
        index(
          [
            artist(STABLE_ID, '林俊傑', [
              { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
            ]),
            artist('artist-jj', 'JJ Lin', [
              { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
            ]),
          ],
          3,
        ),
        [STABLE_ID, 'artist-jj'],
        { expectedRevision: 3 },
      ),
    ).toMatchObject({ status: 'ok', revision: 4 });
    expect(loadArtistOrganization(directory).dismissed).toEqual([]);
  });

  it('redirects a merged stable id and restores both entities on undo', () => {
    const secondStableId = 'artist-22222222-2222-4222-8222-222222222222';
    setArtistDisplayName(
      directory,
      index([artist('artist-jj', 'JJ Lin')]),
      'artist-jj',
      'JJ Lin',
      {
        expectedRevision: 0,
        randomUUID: () => STABLE_ID.slice('artist-'.length),
      },
    );
    setArtistDisplayName(
      directory,
      index([artist('artist-lin', '林俊傑')], 1),
      'artist-lin',
      '林俊傑',
      {
        expectedRevision: 1,
        randomUUID: () => secondStableId.slice('artist-'.length),
      },
    );

    expect(
      mergeArtistOrganizations(
        directory,
        index(
          [
            artist(STABLE_ID, 'JJ Lin', [{ id: 'credit-jj', name: 'JJ Lin' }]),
            artist(secondStableId, '林俊傑', [
              { id: 'credit-lin', name: '林俊傑' },
            ]),
          ],
          2,
        ),
        [STABLE_ID, secondStableId],
        { expectedRevision: 2 },
      ),
    ).toMatchObject({ status: 'ok', artistId: STABLE_ID, revision: 3 });
    expect(loadArtistOrganization(directory).redirects).toEqual([
      { from: secondStableId, to: STABLE_ID },
    ]);

    expect(
      undoArtistOrganization(directory, { expectedRevision: 3 }),
    ).toMatchObject({ status: 'ok', revision: 4 });
    expect(loadArtistOrganization(directory)).toMatchObject({
      redirects: [],
      artists: [
        expect.objectContaining({ id: STABLE_ID }),
        expect.objectContaining({ id: secondStableId }),
      ],
    });
  });
});
