import { afterEach, expect, it, vi } from 'vitest';
import { useTrackStyleEditor } from './useTrackStyleEditor.js';

afterEach(() => vi.unstubAllGlobals());

it('saves accepts, edits, additions and removals as manual changes', async () => {
  const snapshot = {
    ok: true,
    editToken: 'current',
    tags: ['Rock'],
    dismissed: [],
    candidates: [
      { label: 'Trap' },
      { label: 'Cloud Rap' },
      { label: 'Ballad' },
    ],
  };
  const api = {
    getTrackStyleTags: vi.fn().mockResolvedValue(snapshot),
    saveTrackStyleTags: vi.fn().mockResolvedValue({
      ...snapshot,
      tags: ['Cloud Rap', 'Alt Hip Hop', 'Night drive'],
      dismissed: ['Rock', 'Ballad', 'Trap'],
    }),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const editor = useTrackStyleEditor();
  await editor.load('song');
  editor.remove(editor.rows.value[0]);
  editor.add('Cloud Rap');
  editor.add('Trap');
  editor.change(editor.rows.value[1].id, 'Alt Hip Hop');
  editor.add('Ballad');
  editor.remove(editor.rows.value[2]);
  editor.add();
  editor.change(editor.rows.value[2].id, 'Night drive');
  expect(editor.isDirty.value).toBe(true);
  await editor.save();
  expect(api.saveTrackStyleTags).toHaveBeenCalledWith(
    'song',
    'current',
    ['Cloud Rap', 'Alt Hip Hop', 'Night drive'],
    ['Rock', 'Ballad', 'Trap'],
  );
  expect(editor.visibleCandidates.value).toEqual([]);
  expect(editor.isDirty.value).toBe(false);
});
