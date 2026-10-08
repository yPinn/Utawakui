import { effectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ARTIST_ID = 'artist-0123456789abcdef';
const CANDIDATE_ID = 'candidate_0123456789abcdef012345';

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createApi() {
  return {
    searchArtistPhotoCandidates: vi.fn().mockResolvedValue({
      status: 'ok',
      candidates: [{ candidateId: CANDIDATE_ID, name: '艾熱AIR' }],
    }),
    cancelArtistPhotoCandidates: vi.fn().mockResolvedValue({ status: 'ok' }),
    loadArtistPhotoCandidatePreview: vi.fn().mockResolvedValue({
      status: 'ok',
      candidateId: CANDIDATE_ID,
      image: {
        mimeType: 'image/png',
        buffer: Uint8Array.from([137, 80, 78, 71]),
      },
    }),
    applyArtistPhotoCandidate: vi
      .fn()
      .mockResolvedValue({ status: 'ok', changed: true }),
  };
}

async function createSubject(options = {}) {
  const { useArtistPhotoCandidates } =
    await import('./useArtistPhotoCandidates.js');
  const scope = effectScope();
  let subject;
  scope.run(() => {
    subject = useArtistPhotoCandidates(options);
  });
  return { scope, subject };
}

beforeEach(() => {
  vi.stubGlobal(
    'Blob',
    class BlobMock {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options?.type ?? '';
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useArtistPhotoCandidates', () => {
  it('searches only after the artist modal is opened and loads validated bytes into blob previews', async () => {
    const api = createApi();
    const createObjectURL = vi.fn().mockReturnValue('blob:artist-preview');
    const { scope, subject } = await createSubject({ api, createObjectURL });

    expect(api.searchArtistPhotoCandidates).not.toHaveBeenCalled();
    await subject.openForArtist({ id: ARTIST_ID, name: '艾熱AIR' });

    expect(api.searchArtistPhotoCandidates).toHaveBeenCalledWith(ARTIST_ID);
    expect(api.loadArtistPhotoCandidatePreview).toHaveBeenCalledWith(
      ARTIST_ID,
      CANDIDATE_ID,
    );
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/png' }),
    );
    expect(subject.state).toMatchObject({
      open: true,
      artistId: ARTIST_ID,
      artistName: '艾熱AIR',
      status: 'ready',
      selectedCandidateId: null,
    });
    expect(subject.state.candidates).toEqual([
      {
        candidateId: CANDIDATE_ID,
        name: '艾熱AIR',
        previewUrl: 'blob:artist-preview',
        previewStatus: 'ready',
      },
    ]);
    expect(JSON.stringify(subject.state)).not.toMatch(
      /https?:|googleusercontent/u,
    );
    scope.stop();
  });

  it('requires explicit selection before applying and refreshes the artist index after success', async () => {
    const api = createApi();
    const refreshArtistIndex = vi.fn().mockResolvedValue(undefined);
    const { scope, subject } = await createSubject({
      api,
      refreshArtistIndex,
      createObjectURL: () => 'blob:artist-preview',
    });
    await subject.openForArtist({ id: ARTIST_ID, name: '艾熱AIR' });

    await expect(subject.applySelected()).resolves.toBe(null);
    expect(api.applyArtistPhotoCandidate).not.toHaveBeenCalled();

    subject.selectCandidate(CANDIDATE_ID);
    await expect(subject.applySelected()).resolves.toEqual({
      status: 'ok',
      changed: true,
    });

    expect(api.applyArtistPhotoCandidate).toHaveBeenCalledWith(
      ARTIST_ID,
      CANDIDATE_ID,
    );
    expect(refreshArtistIndex).toHaveBeenCalledOnce();
    expect(subject.state.open).toBe(false);
    scope.stop();
  });

  it('cancels a running search, ignores its late result, and revokes previews on close', async () => {
    const pendingSearch = deferred();
    const api = createApi();
    api.searchArtistPhotoCandidates.mockReturnValue(pendingSearch.promise);
    const revokeObjectURL = vi.fn();
    const { scope, subject } = await createSubject({ api, revokeObjectURL });

    const opening = subject.openForArtist({ id: ARTIST_ID, name: '艾熱AIR' });
    await vi.waitFor(() => expect(subject.state.status).toBe('searching'));
    subject.close();

    expect(api.cancelArtistPhotoCandidates).toHaveBeenCalledWith(ARTIST_ID);
    expect(subject.state.open).toBe(false);

    pendingSearch.resolve({
      status: 'ok',
      candidates: [{ candidateId: CANDIDATE_ID, name: '艾熱AIR' }],
    });
    await opening;
    expect(subject.state.candidates).toEqual([]);
    expect(api.loadArtistPhotoCandidatePreview).not.toHaveBeenCalled();

    api.searchArtistPhotoCandidates.mockResolvedValue({
      status: 'ok',
      candidates: [{ candidateId: CANDIDATE_ID, name: '艾熱AIR' }],
    });
    const second = await createSubject({
      api,
      createObjectURL: () => 'blob:second-preview',
      revokeObjectURL,
    });
    await second.subject.openForArtist({ id: ARTIST_ID, name: '艾熱AIR' });
    second.subject.close();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second-preview');
    second.scope.stop();
    scope.stop();
  });

  it('revokes a late preview when the artist changes before it finishes', async () => {
    const pendingPreview = deferred();
    const api = createApi();
    api.loadArtistPhotoCandidatePreview.mockReturnValue(pendingPreview.promise);
    const createObjectURL = vi.fn().mockReturnValue('blob:late-preview');
    const revokeObjectURL = vi.fn();
    const { scope, subject } = await createSubject({
      api,
      createObjectURL,
      revokeObjectURL,
    });

    const first = subject.openForArtist({ id: ARTIST_ID, name: '艾熱AIR' });
    await vi.waitFor(() => expect(subject.state.candidates).toHaveLength(1));
    subject.close();
    pendingPreview.resolve({
      status: 'ok',
      candidateId: CANDIDATE_ID,
      image: {
        mimeType: 'image/png',
        buffer: Uint8Array.from([1, 2, 3]),
      },
    });
    await first;

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:late-preview');
    expect(subject.state.candidates).toEqual([]);
    scope.stop();
  });

  it.each([
    [{ status: 'no-match', candidates: [] }, 'empty', ''],
    [{ status: 'disabled' }, 'error', '請先在設定啟用並準備外部來源工具。'],
    [
      { status: 'error', reason: 'rate-limited' },
      'error',
      '外部來源暫時限制了搜尋，請稍後再試。',
    ],
    [
      { status: 'error', reason: 'schema-error' },
      'error',
      '外部來源目前無法使用，請稍後再試。',
    ],
    [
      { status: 'error', reason: 'busy' },
      'error',
      '搜尋要求較多，請稍後再試。',
    ],
  ])('maps %j to a bounded user state', async (result, status, error) => {
    const api = createApi();
    api.searchArtistPhotoCandidates.mockResolvedValue(result);
    const { scope, subject } = await createSubject({ api });

    await subject.openForArtist({ id: ARTIST_ID, name: '艾熱AIR' });

    expect(subject.state.status).toBe(status);
    expect(subject.state.error).toBe(error);
    expect(JSON.stringify(subject.state)).not.toMatch(
      /schema-error|rate-limited|HTTP|Python|ytmusicapi/iu,
    );
    scope.stop();
  });

  it('keeps the dialog open with a retryable bounded error when apply fails', async () => {
    const api = createApi();
    api.applyArtistPhotoCandidate.mockResolvedValue({
      status: 'error',
      reason: 'candidate-stale',
    });
    const { scope, subject } = await createSubject({
      api,
      createObjectURL: () => 'blob:artist-preview',
    });
    await subject.openForArtist({ id: ARTIST_ID, name: '艾熱AIR' });
    subject.selectCandidate(CANDIDATE_ID);

    await expect(subject.applySelected()).resolves.toBe(null);

    expect(subject.state.open).toBe(true);
    expect(subject.state.status).toBe('ready');
    expect(subject.state.error).toBe('候選照片已過期，請重新搜尋。');
    scope.stop();
  });
});
