import { reactive } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useImportExecution } from './useImportExecution.js';

const playlists = vi.hoisted(() => ({
  create: vi.fn(),
  setTracks: vi.fn(),
  upsertAlbum: vi.fn(),
}));
vi.mock('../usePlaylists.js', () => ({ usePlaylists: () => playlists }));

beforeEach(() => {
  vi.resetAllMocks();
  playlists.create.mockResolvedValue({ id: 'saved-playlist' });
  playlists.setTracks.mockResolvedValue(true);
  vi.stubGlobal('window', {
    Utawakui: {
      downloadAudio: vi.fn().mockResolvedValue({ title: 'Saved' }),
      cancelAudioDownload: vi.fn().mockResolvedValue(true),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function fixture(count = 1) {
  const state = reactive({
    input: 'collection',
    sourceKind: 'playlist',
    playlistTitle: 'Songs',
    collectionKind: 'playlist',
    collectionSource: null,
    playlistTracks: Array.from({ length: count }, (_, index) => ({
      id: `song-${index}`,
      title: `Song ${index}`,
      selected: true,
      status: 'pending',
    })),
  });
  const reportImportError = vi.fn();
  const execution = useImportExecution({
    state,
    getDraftRevision: () => 0,
    canConfirmImport: { value: true },
    canRetryFailed: { value: true },
    ensureProviderFlow: vi.fn().mockResolvedValue(true),
    handleProviderSetupError: vi.fn(),
    reportImportError,
    setStatus: vi.fn(),
  });
  return { state, execution, reportImportError };
}

it('retains the accepted release type in activity while the next preview changes', async () => {
  const { state, execution } = fixture();
  Object.assign(state, {
    collectionKind: 'album',
    collectionSource: { platform: 'yt-music', id: 'OLAK5uy_test' },
    collectionReleaseType: 'ep',
    collectionReleaseDate: { value: '2026', precision: 'year' },
  });
  playlists.upsertAlbum.mockResolvedValue({ id: 'saved-album' });
  await execution.submitImport();
  state.collectionReleaseType = 'album';
  expect(execution.activity.batches[0].releaseType).toBe('ep');
  state.collectionReleaseDate.value = '2024';
  expect(execution.activity.batches[0].releaseDate).toEqual({
    value: '2026',
    precision: 'year',
  });
  await vi.waitFor(() =>
    expect(execution.activity.batches[0].phase).toBe('completed'),
  );
  expect(playlists.upsertAlbum.mock.calls[0][0]).not.toHaveProperty(
    'releaseObservations',
  );
});

it('recovers an unexpectedly rejected collection store without downloading successes again', async () => {
  const failure = new Error('private store failure');
  playlists.create.mockRejectedValueOnce(failure);
  const { execution, reportImportError } = fixture();
  expect(execution.activity.isImporting).toBe(false);
  const id = await execution.submitImport();
  await vi.waitFor(() =>
    expect(execution.activity.batches[0].phase).toBe('failed'),
  );
  expect(execution.activity.isImporting).toBe(false);
  expect(execution.activity.batches[0].tracks[0].status).toBe('done');
  expect(reportImportError).toHaveBeenCalledWith(
    failure,
    'save-import-collection',
    expect.any(String),
  );
  await expect(execution.retryBatch(id)).resolves.toBe(true);
  expect(execution.activity.batches[0].phase).toBe('completed');
  expect(playlists.create).toHaveBeenCalledTimes(2);
  expect(window.Utawakui.downloadAudio).toHaveBeenCalledOnce();
});

it('contains a synchronous download bridge failure and leaves the accepted work retryable', async () => {
  const failure = new Error('synchronous bridge failure');
  window.Utawakui.downloadAudio.mockImplementationOnce(() => {
    throw failure;
  });
  const { execution, reportImportError } = fixture();
  const id = await execution.submitImport();
  await vi.waitFor(() =>
    expect(execution.activity.batches[0].phase).toBe('failed'),
  );
  expect(execution.activity.batches[0].tracks[0].status).toBe('error');
  expect(reportImportError).toHaveBeenCalledWith(
    failure,
    'download-track',
    expect.any(String),
  );
  await expect(execution.retryBatch(id)).resolves.toBe(true);
  expect(execution.activity.batches[0].phase).toBe('completed');
});

it('cancels waiting work before it reaches Main while cancelling the two active downloads', async () => {
  const finishes = [];
  window.Utawakui.downloadAudio.mockImplementation(
    () => new Promise((resolve) => finishes.push(resolve)),
  );
  const { execution } = fixture(3);
  const id = await execution.submitImport();
  expect(execution.activity.isImporting).toBe(true);
  expect(window.Utawakui.downloadAudio).toHaveBeenCalledTimes(2);
  await expect(execution.cancelBatch(id)).resolves.toBe(true);
  expect(execution.activity.isImporting).toBe(false);
  expect(
    execution.activity.batches[0].tracks.map((track) => track.status),
  ).toEqual(['cancelled', 'cancelled', 'cancelled']);
  expect(window.Utawakui.cancelAudioDownload).toHaveBeenCalledTimes(2);
  for (const finish of finishes) finish({ title: 'Late completion' });
  await Promise.resolve();
  expect(window.Utawakui.downloadAudio).toHaveBeenCalledTimes(2);
});
