import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let updateTrackMetadataMock;

beforeEach(() => {
  updateTrackMetadataMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      updateTrackMetadata: updateTrackMetadataMock,
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
});
