const PAGE_SIZE = 40;
const CATEGORIES = new Set(['all', 'artist', 'album']);
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function term(value) {
  return typeof value === 'string' ? value.slice(0, 2000).trim() : '';
}

function searchable(value) {
  return value.normalize('NFKC').toLowerCase();
}

function compareGroups(left, right) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  // Keep exact groups together even when the locale collator folds their names.
  return collator.compare(left, right) || (left < right ? -1 : 1);
}

export function createCompanionCatalog(listTracks, now = Date.now) {
  let cached = [];
  let expires = 0;
  return function search(params) {
    const category = params.get('category') ?? 'all';
    const offset = Number(params.get('offset') ?? 0);
    const query = (params.get('q') ?? '').trim();
    if (
      !CATEGORIES.has(category) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      query.length > 100
    )
      return null;
    if (now() >= expires) {
      cached = listTracks().flatMap((track) =>
        typeof track.id === 'string' &&
        track.id.length > 0 &&
        track.id.length <= 200
          ? [
              {
                id: track.id,
                title: term(track.title) || track.id,
                artist: term(track.artist),
                album: term(track.album),
              },
            ]
          : [],
      );
      expires = now() + 2000;
    }
    const words = searchable(query).split(/\s+/u).filter(Boolean);
    const matches = cached.filter((track) => {
      const label = searchable(
        [track.title, track.artist, track.album].join(' '),
      );
      return words.every((word) => label.includes(word));
    });
    matches.sort(
      (a, b) =>
        (category === 'all' ? 0 : compareGroups(a[category], b[category])) ||
        collator.compare(a.title, b.title) ||
        collator.compare(a.id, b.id),
    );
    const items = matches.slice(offset, offset + PAGE_SIZE);
    return {
      items,
      total: matches.length,
      nextOffset:
        offset + items.length < matches.length ? offset + items.length : null,
    };
  };
}
