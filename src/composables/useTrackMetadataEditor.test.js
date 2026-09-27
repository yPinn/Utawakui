import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_GATES, FEATURE_IDS } from '../constants/featureGates.js';

let updateTrackMetadataMock;
let searchTrackArtworkMock;
let loadTrackArtworkPreviewMock;
let applyTrackArtworkMock;

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
      openTrackArtworkSource: vi.fn(),
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

  it('keeps artwork query edits separate from metadata drafts and never auto-applies a result', async () => {
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

    editor.openArtworkSearch();
    editor.setArtworkQueryField('title', 'Search Only Title');
    await editor.searchArtwork();

    expect(searchTrackArtworkMock).toHaveBeenCalledWith('track-1', {
      title: 'Search Only Title',
      artist: 'Library Artist',
      album: 'Library Album',
    });
    expect(editor.state.titleDraft).toBe('Library Title');
    expect(editor.state.artworkCandidates[0]).toMatchObject({
      id: 'candidate-1',
      previewUrl: expect.stringMatching(/^blob:/u),
    });
    expect(editor.state.selectedArtworkCandidateId).toBe('candidate-1');
    expect(updateTrackMetadataMock).not.toHaveBeenCalled();
    expect(applyTrackArtworkMock).not.toHaveBeenCalled();
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
