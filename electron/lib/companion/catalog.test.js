import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createCompanionCatalog } from './catalog.js';
import { createCompanionServer } from './server.js';

describe('companion catalog', () => {
  it('pages a scalar projection grouped by the requested category', () => {
    const search = createCompanionCatalog(() =>
      Array.from({ length: 45 }, (_, index) => ({
        id: String(index),
        title: `Track ${index}`,
        artist: index % 2 ? 'B' : 'A',
        album: 'Album',
        url: 'private',
      })),
    );
    const first = search(new URLSearchParams({ category: 'artist' }));
    expect(first.items).toHaveLength(40);
    expect(first.items[0]).toEqual({
      id: '0',
      title: 'Track 0',
      artist: 'A',
      album: 'Album',
    });
    expect(first.nextOffset).toBe(40);
    expect(
      search(new URLSearchParams({ category: 'artist', offset: '40' })).items,
    ).toHaveLength(5);
    const filtered = search(new URLSearchParams({ q: 'album track 42' }));
    expect(filtered.items.map(({ id }) => id)).toEqual(['42']);
    expect(filtered.nextOffset).toBeNull();
  });

  it('rejects unrecognized categories and oversized queries', () => {
    const search = createCompanionCatalog(() => []);
    expect(search(new URLSearchParams({ category: 'url' }))).toBeNull();
    expect(search(new URLSearchParams({ offset: '-1' }))).toBeNull();
    expect(search(new URLSearchParams({ q: 'x'.repeat(101) }))).toBeNull();
  });

  it('keeps exact groups contiguous and tolerates full-width search terms', () => {
    const search = createCompanionCatalog(() => [
      { id: 'blank', title: 'Track 0', artist: ' ' },
      { id: 'lower', title: 'Track 1', artist: 'a' },
      { id: 'upper-2', title: 'Track 2', artist: 'A' },
      { id: 'upper-3', title: 'Track 3', artist: ' A ' },
    ]);
    const page = search(
      new URLSearchParams({ category: 'artist', q: 'ＴＲＡＣＫ' }),
    );
    expect(page.items.map(({ id }) => id)).toEqual([
      'upper-2',
      'upper-3',
      'lower',
      'blank',
    ]);
  });

  it('serves catalog pages only to the active paired reader', async () => {
    const token = 'a'.repeat(43);
    let enabled = true;
    let active = false;
    let serve;
    const server = createCompanionServer({
      address: '127.0.0.1',
      port: 19000,
      isGateEnabled: () => enabled,
      devices: {
        authenticate: (credential) =>
          credential === token ? { id: 'phone' } : null,
      },
      readers: { isActive: () => active },
      searchCatalog: createCompanionCatalog(() => [
        { id: 'a', title: 'Track' },
      ]),
      createHttpServer(handler) {
        serve = handler;
        return Object.assign(new EventEmitter(), {
          listen: (_port, _address, ready) => ready(),
        });
      },
    });
    await server.start();
    function fetchCatalog(authorization) {
      return new Promise((resolve) => {
        let status;
        serve(
          {
            method: 'GET',
            url: '/m/api/v1/catalog',
            headers: { host: '127.0.0.1:19000', authorization },
          },
          {
            writeHead: (value) => {
              status = value;
            },
            end: (body) => resolve({ status, body: JSON.parse(body) }),
          },
        );
      });
    }
    expect((await fetchCatalog()).status).toBe(401);
    expect((await fetchCatalog(`Bearer ${token}`)).status).toBe(409);
    active = true;
    expect(await fetchCatalog(`Bearer ${token}`)).toMatchObject({
      status: 200,
      body: { items: [{ id: 'a', title: 'Track' }] },
    });
    enabled = false;
    expect((await fetchCatalog(`Bearer ${token}`)).status).toBe(503);
  });
});
