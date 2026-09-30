import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_GATES, FEATURE_IDS } from '../constants/featureGates.js';

let updateTrackMetadataMock;
let searchTrackArtworkMock;
let loadTrackArtworkPreviewMock;
let applyTrackArtworkMock;

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  updateTrackMetadataMock = vi.fn();
  searchTrackArtworkMock = vi.fn();
  loadTrackArtworkPreviewMock = vi.fn();
  applyTrackArtworkMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      updateTrackMetadata: updateTrackMetadataMock,
      searchTrackArtwork: searchTrackArtworkMock,
      loadTrackArtworkPreview: loadTrackArtworkPreviewMock,
      applyTrackArtwork: applyTrackArtworkMock,
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
    updateTrackMetadataMock.mockResolvedValue({
      id: 'local-1',
      title: 'Edited Title',
      artist: 'Edited Artist',
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
    expect(updateTrackMetadataMock).toHaveBeenCalledWith('local-1', {
      title: 'Edited Title',
      artist: 'Edited Artist',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(editor.state.track).toBe(null);
    expect(editor.state.error).toBe(null);
  });

  it('allows clearing artist while keeping title required', async () => {
    updateTrackMetadataMock.mockResolvedValue({
      id: 'local-1',
      title: 'Title',
    });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'local-1', title: 'Title', artist: 'Artist' });
    editor.setArtistDraft('   ');

    await editor.save();

    expect(updateTrackMetadataMock).toHaveBeenCalledWith('local-1', {
      title: 'Title',
      artist: '',
    });
  });

  it('keeps the modal open and does not call the bridge for a blank title', async () => {
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'local-1', title: 'Title' });
    editor.setTitleDraft('   ');

    await expect(editor.save()).resolves.toBe(null);

    expect(updateTrackMetadataMock).not.toHaveBeenCalled();
    expect(editor.state.track.id).toBe('local-1');
    expect(editor.state.error).toBe('歌名必填');
  });

  it('reports missing bridge support without closing the modal', async () => {
    vi.stubGlobal('window', { Utawakui: {} });
    const { useTrackMetadataEditor } =
      await import('./useTrackMetadataEditor.js');
    const editor = useTrackMetadataEditor();

    editor.open({ id: 'local-1', title: 'Title' });
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
    expect(editor.state.selectedArtworkCandidateId).toBe('candidate-1');
    expect(updateTrackMetadataMock).not.toHaveBeenCalled();
    expect(applyTrackArtworkMock).not.toHaveBeenCalled();
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

  it('applies artwork only after explicit candidate selection', async () => {
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
    applyTrackArtworkMock.mockResolvedValue({
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
    await expect(editor.applySelectedArtwork()).resolves.toMatchObject({
      id: 'track-1',
      thumbnailUrl: expect.any(String),
    });
    expect(applyTrackArtworkMock).toHaveBeenCalledWith(
      'track-1',
      'candidate-1',
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});
