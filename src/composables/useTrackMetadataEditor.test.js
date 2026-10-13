import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_GATES, FEATURE_IDS } from '../constants/featureGates.js';

let saveTrackEditsMock;
let chooseTrackArtworkDraftMock;
let discardTrackArtworkDraftMock;
let searchTrackArtworkMock;
let loadTrackArtworkPreviewMock;
let cancelTrackArtworkSearchMock;

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  saveTrackEditsMock = vi.fn();
  chooseTrackArtworkDraftMock = vi.fn();
  discardTrackArtworkDraftMock = vi.fn().mockResolvedValue(true);
  searchTrackArtworkMock = vi.fn();
  loadTrackArtworkPreviewMock = vi.fn();
  cancelTrackArtworkSearchMock = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('window', {
    Utawakui: {
      saveTrackEdits: saveTrackEditsMock,
      chooseTrackArtworkDraft: chooseTrackArtworkDraftMock,
      discardTrackArtworkDraft: discardTrackArtworkDraftMock,
      searchTrackArtwork: searchTrackArtworkMock,
      loadTrackArtworkPreview: loadTrackArtworkPreviewMock,
      cancelTrackArtworkSearch: cancelTrackArtworkSearchMock,
      getFeatureConfirmations: vi.fn().mockResolvedValue({
        [FEATURE_IDS.PROVIDER_FLOW]: {
          enabled: true,
          featureId: FEATURE_IDS.PROVIDER_FLOW,
          noticeVersion: FEATURE_GATES[FEATURE_IDS.PROVIDER_FLOW].noticeVersion,
          confirmedAt: '2026-09-27T00:00:00.000Z',
        },
      }),
      confirmFeatureGate: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTrackMetadataEditor', () => {
  it('opens the online artwork workspace for a track without artwork without starting a request', async () => {
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({
      id: 'local-1',
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      thumbnailUrl: '',
    });

    expect(editor.state.artworkSearchOpen).toBe(true);
    expect(editor.state.artworkQuery.album).toBe('Album');
    expect(searchTrackArtworkMock).not.toHaveBeenCalled();
  });

  it('keeps online artwork search collapsed when the track already has artwork', async () => {
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({
      id: 'local-1',
      title: 'Title',
      thumbnailUrl: 'utawakui-media://track/local-1/thumbnail.jpg',
    });

    expect(editor.state.artworkSearchOpen).toBe(false);
    expect(searchTrackArtworkMock).not.toHaveBeenCalled();
  });

  it('seeds drafts from the target track and saves trimmed title and artist', async () => {
    const refresh = vi.fn();
    saveTrackEditsMock.mockResolvedValue({
      status: 'ok',
      track: {
        id: 'local-1',
        title: 'Edited Title',
        artist: 'Edited Artist',
      },
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor({ refresh });

    editor.open({
      id: 'local-1',
      title: 'Original Title',
      artist: 'Original Artist',
    });
    editor.setTitleDraft('  Edited Title  ');
    editor.setArtistDraft('  Edited Artist  ');

    const saved = await editor.save();

    expect(saved).toEqual({
      id: 'local-1',
      title: 'Edited Title',
      artist: 'Edited Artist',
    });
    expect(saveTrackEditsMock).toHaveBeenCalledWith('local-1', {
      title: 'Edited Title',
      artist: 'Edited Artist',
      artwork: { action: 'keep' },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(editor.state.track).toBe(null);
    expect(editor.state.error).toBe(null);
  });

  it('allows clearing artist while keeping title required', async () => {
    saveTrackEditsMock.mockResolvedValue({
      status: 'ok',
      track: {
        id: 'local-1',
        title: 'Title',
      },
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'local-1', title: 'Title', artist: 'Artist' });
    editor.setArtistDraft('   ');

    await editor.save();

    expect(saveTrackEditsMock).toHaveBeenCalledWith('local-1', {
      title: 'Title',
      artist: '',
      artwork: { action: 'keep' },
    });
  });

  it('keeps the modal open and does not call the bridge for a blank title', async () => {
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'local-1', title: 'Title' });
    editor.setTitleDraft('   ');

    await expect(editor.save()).resolves.toBe(null);

    expect(saveTrackEditsMock).not.toHaveBeenCalled();
    expect(editor.state.track.id).toBe('local-1');
    expect(editor.state.error).toBe('歌名必填');
  });

  it('does not call the bridge when Save is requested without any changes', async () => {
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'local-1', title: 'Title', artist: 'Artist' });

    await expect(editor.save()).resolves.toBe(null);

    expect(saveTrackEditsMock).not.toHaveBeenCalled();
    expect(editor.state.track?.id).toBe('local-1');
    expect(editor.state.error).toBe(null);
  });

  it('reports missing bridge support without closing the modal', async () => {
    vi.stubGlobal('window', { Utawakui: {} });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'local-1', title: 'Title' });
    editor.setTitleDraft('Edited Title');
    await expect(editor.save()).resolves.toBe(null);

    expect(editor.state.track.id).toBe('local-1');
    expect(editor.state.error).toBe('需要重新啟動應用程式');
  });

  it('uses the current metadata drafts as the artwork query and never auto-applies a result', async () => {
    searchTrackArtworkMock.mockResolvedValue({
      status: 'ok',
      candidates: [
        {
          id: 'candidate-1',
          releaseTitle: 'Catalog Title',
          artistCredit: 'Catalog Artist',
          confidence: 'high',
          reasons: ['title-exact'],
          recommended: true,
          automatic: false,
        },
      ],
    });
    loadTrackArtworkPreviewMock.mockResolvedValue({
      status: 'ok',
      mimeType: 'image/png',
      bytes: Uint8Array.from([137, 80, 78, 71]),
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({
      id: 'track-1',
      title: 'Library Title',
      artist: 'Library Artist',
      album: 'Library Album',
    });

    editor.setTitleDraft('Search and Save Title');
    editor.setArtistDraft('Search and Save Artist');
    editor.openArtworkSearch();
    editor.setArtworkQueryField('album', 'Search Album');
    await editor.searchArtwork();

    expect(searchTrackArtworkMock).toHaveBeenCalledWith('track-1', {
      title: 'Search and Save Title',
      artist: 'Search and Save Artist',
      album: 'Search Album',
    });
    expect(editor.state.titleDraft).toBe('Search and Save Title');
    expect(editor.state.selectedArtworkCandidateId).toBe(null);
    expect(saveTrackEditsMock).not.toHaveBeenCalled();
  });

  it('lets the editor close while a search is running and ignores its late result', async () => {
    const pending = deferred();
    searchTrackArtworkMock.mockReturnValue(pending.promise);
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({ id: 'track-1', title: 'Title', thumbnailUrl: 'x://cover' });
    editor.openArtworkSearch();

    const search = editor.searchArtwork();
    await vi.waitFor(() => expect(editor.state.isArtworkSearching).toBe(true));

    editor.close();

    expect(cancelTrackArtworkSearchMock).toHaveBeenCalledWith('track-1');
    expect(editor.state.track).toBe(null);
    expect(editor.state.isArtworkSearching).toBe(false);

    pending.resolve({
      status: 'ok',
      candidates: [{ id: 'late', recommended: true }],
    });
    await expect(search).resolves.toBe(null);
    expect(editor.state.artworkCandidates).toEqual([]);
    expect(editor.state.error).toBe(null);
  });

  it('cancels a running search when the artwork workspace is dismissed', async () => {
    searchTrackArtworkMock.mockReturnValue(new Promise(() => {}));
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({ id: 'track-1', title: 'Title', thumbnailUrl: 'x://cover' });
    editor.openArtworkSearch();
    void editor.searchArtwork();
    await vi.waitFor(() => expect(editor.state.isArtworkSearching).toBe(true));

    editor.closeArtworkSearch();

    expect(cancelTrackArtworkSearchMock).toHaveBeenCalledWith('track-1');
    expect(editor.state.artworkSearchOpen).toBe(false);
    expect(editor.state.isArtworkSearching).toBe(false);
  });

  it('keeps provider failures actionable without exposing technical service details', async () => {
    searchTrackArtworkMock.mockResolvedValue({
      status: 'error',
      reason: 'provider-unavailable',
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({ id: 'track-1', title: 'Library Title' });

    await editor.searchArtwork();

    expect(editor.state.error).toBe('目前無法搜尋封面，請稍後再試。');
    expect(editor.state.error).not.toMatch(
      /MusicBrainz|Cover Art Archive|timeout|HTTP|503/iu,
    );
  });

  it('shows candidate data before previews finish and loads the recommended preview first', async () => {
    const recommendedPreview = deferred();
    searchTrackArtworkMock.mockResolvedValue({
      status: 'ok',
      candidates: [
        {
          id: 'candidate-1',
          releaseTitle: 'First',
          confidence: 'medium',
          reasons: [],
          recommended: false,
          automatic: false,
        },
        {
          id: 'candidate-2',
          releaseTitle: 'Recommended',
          confidence: 'high',
          reasons: ['title-exact', 'artist-exact'],
          recommended: true,
          automatic: false,
        },
      ],
    });
    loadTrackArtworkPreviewMock.mockImplementation((_trackId, candidateId) =>
      candidateId === 'candidate-2'
        ? recommendedPreview.promise
        : Promise.resolve({ status: 'error', reason: 'not-found' }),
    );
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({ id: 'track-1', title: 'Library Title' });
    editor.openArtworkSearch();

    await editor.searchArtwork();

    expect(editor.state.isArtworkSearching).toBe(false);
    expect(editor.state.artworkCandidates).toHaveLength(2);
    expect(editor.state.artworkCandidates[1]).toMatchObject({
      id: 'candidate-2',
      previewLoading: true,
      previewUrl: '',
    });
    expect(loadTrackArtworkPreviewMock.mock.calls[0][1]).toBe('candidate-2');

    recommendedPreview.resolve({
      status: 'ok',
      mimeType: 'image/png',
      bytes: Uint8Array.from([137, 80, 78, 71]),
    });
    await vi.waitFor(() => {
      expect(editor.state.artworkCandidates[1].previewLoading).toBe(false);
      expect(editor.state.artworkCandidates[1].previewUrl).toMatch(/^blob:/u);
    });
  });

  it('promotes a newly selected pending preview ahead of the remaining queue', async () => {
    const recommendedPreview = deferred();
    const secondPreview = deferred();
    searchTrackArtworkMock.mockResolvedValue({
      status: 'ok',
      candidates: [
        { id: 'candidate-1', recommended: true, reasons: [] },
        { id: 'candidate-2', recommended: false, reasons: [] },
        { id: 'candidate-3', recommended: false, reasons: [] },
        { id: 'candidate-4', recommended: false, reasons: [] },
      ],
    });
    loadTrackArtworkPreviewMock.mockImplementation((_trackId, candidateId) => {
      if (candidateId === 'candidate-1') return recommendedPreview.promise;
      if (candidateId === 'candidate-2') return secondPreview.promise;
      return Promise.resolve({ status: 'error', reason: 'not-found' });
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({ id: 'track-1', title: 'Library Title' });
    editor.openArtworkSearch();
    await editor.searchArtwork();

    expect(
      loadTrackArtworkPreviewMock.mock.calls.map((call) => call[1]),
    ).toEqual(['candidate-1', 'candidate-2']);

    editor.selectArtworkCandidate('candidate-4');
    secondPreview.resolve({ status: 'error', reason: 'not-found' });

    await vi.waitFor(() => {
      expect(loadTrackArtworkPreviewMock.mock.calls[2][1]).toBe('candidate-4');
    });
    recommendedPreview.resolve({ status: 'error', reason: 'not-found' });
  });

  it('invalidates stale artwork results when a shared title or artist draft changes', async () => {
    searchTrackArtworkMock.mockResolvedValue({
      status: 'ok',
      candidates: [
        {
          id: 'candidate-1',
          releaseTitle: 'One',
          confidence: 'high',
          reasons: [],
          recommended: true,
          automatic: false,
        },
      ],
    });
    loadTrackArtworkPreviewMock.mockResolvedValue({
      status: 'error',
      reason: 'not-found',
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({ id: 'track-1', title: 'Library Title' });
    editor.openArtworkSearch();
    await editor.searchArtwork();
    expect(editor.state.artworkCandidates).toHaveLength(1);

    editor.setTitleDraft('Different Title');

    expect(editor.state.artworkCandidates).toEqual([]);
    expect(editor.state.selectedArtworkCandidateId).toBe(null);
    expect(editor.state.artworkSearchCompleted).toBe(false);
  });

  it('stages a selected online candidate and commits it only with the form', async () => {
    const refresh = vi.fn();
    searchTrackArtworkMock.mockResolvedValue({
      status: 'ok',
      candidates: [
        {
          id: 'candidate-1',
          releaseTitle: 'One',
          confidence: 'medium',
          reasons: [],
          recommended: false,
          automatic: false,
        },
      ],
    });
    loadTrackArtworkPreviewMock.mockResolvedValue({
      status: 'error',
      reason: 'not-found',
    });
    saveTrackEditsMock.mockResolvedValue({
      status: 'ok',
      track: {
        id: 'track-1',
        title: 'Library Title',
        thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
      },
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor({ refresh });
    editor.open({ id: 'track-1', title: 'Library Title' });
    editor.openArtworkSearch();
    await editor.searchArtwork();
    expect(editor.state.selectedArtworkCandidateId).toBe(null);

    editor.selectArtworkCandidate('candidate-1');
    expect(editor.state.artworkDraft).toEqual({
      action: 'candidate',
      candidateId: 'candidate-1',
    });
    expect(saveTrackEditsMock).not.toHaveBeenCalled();

    await expect(editor.save()).resolves.toMatchObject({
      id: 'track-1',
      thumbnailUrl: expect.any(String),
    });
    expect(saveTrackEditsMock).toHaveBeenCalledWith('track-1', {
      title: 'Library Title',
      artist: '',
      artwork: { action: 'candidate', candidateId: 'candidate-1' },
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('previews a main-owned local artwork draft without refreshing the library', async () => {
    const refresh = vi.fn();
    chooseTrackArtworkDraftMock.mockResolvedValue({
      status: 'ok',
      mimeType: 'image/png',
      bytes: Uint8Array.from([137, 80, 78, 71]),
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor({ refresh });
    editor.open({
      id: 'track-1',
      title: 'Title',
      thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
    });

    await editor.chooseThumbnail();

    expect(chooseTrackArtworkDraftMock).toHaveBeenCalledWith('track-1');
    expect(editor.state.artworkDraft).toEqual({ action: 'local-draft' });
    expect(editor.state.artworkPreviewUrl).toMatch(/^blob:/u);
    expect(refresh).not.toHaveBeenCalled();
    expect(saveTrackEditsMock).not.toHaveBeenCalled();
  });

  it('previews artwork removal and persists it only when Save is pressed', async () => {
    saveTrackEditsMock.mockResolvedValue({
      status: 'ok',
      track: { id: 'track-1', title: 'Title', thumbnailUrl: '' },
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({
      id: 'track-1',
      title: 'Title',
      thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
    });

    editor.clearThumbnail();

    expect(editor.state.artworkPreviewUrl).toBe('');
    expect(editor.state.artworkDraft).toEqual({ action: 'clear' });
    expect(saveTrackEditsMock).not.toHaveBeenCalled();

    await editor.save();
    expect(saveTrackEditsMock).toHaveBeenCalledWith('track-1', {
      title: 'Title',
      artist: '',
      artwork: { action: 'clear' },
    });
  });

  it('discards the main-owned local draft and performs no write on Cancel', async () => {
    chooseTrackArtworkDraftMock.mockResolvedValue({
      status: 'ok',
      mimeType: 'image/webp',
      bytes: Uint8Array.from([82, 73, 70, 70]),
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();
    editor.open({ id: 'track-1', title: 'Title' });
    await editor.chooseThumbnail();

    editor.close();

    expect(discardTrackArtworkDraftMock).toHaveBeenCalledWith('track-1');
    expect(saveTrackEditsMock).not.toHaveBeenCalled();
    expect(editor.state.track).toBe(null);
  });

  it('discards a previous main-owned draft before reopening the same track', async () => {
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'track-1', title: 'Title' });
    editor.open({ id: 'track-1', title: 'Title' });

    expect(discardTrackArtworkDraftMock).toHaveBeenCalledWith('track-1');
  });
});
