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

it('saves unchanged unconfirmed tags once the user confirms them', async () => {
  const snapshot = {
    ok: true,
    editToken: 'current',
    tags: ['Rock'],
    dismissed: [],
    candidates: [],
    unconfirmed: true,
  };
  const api = {
    getTrackStyleTags: vi.fn().mockResolvedValue(snapshot),
    saveTrackStyleTags: vi
      .fn()
      .mockResolvedValue({ ...snapshot, unconfirmed: false }),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const editor = useTrackStyleEditor();
  await editor.load('song');
  expect(editor.needsConfirmation.value).toBe(true);
  expect(editor.isDirty.value).toBe(false);
  editor.confirm();
  expect(editor.needsConfirmation.value).toBe(false);
  expect(editor.isDirty.value).toBe(true);
  await editor.save();
  expect(api.saveTrackStyleTags).toHaveBeenCalledWith(
    'song',
    'current',
    ['Rock'],
    [],
  );
  expect(editor.isDirty.value).toBe(false);
});

it('lets the user re-confirm unchanged tags after the audio changes', async () => {
  const snapshot = {
    ok: true,
    editToken: 'current',
    tags: ['Rock'],
    dismissed: [],
    candidates: [],
    needsReview: true,
  };
  const api = {
    getTrackStyleTags: vi.fn().mockResolvedValue(snapshot),
    saveTrackStyleTags: vi
      .fn()
      .mockResolvedValue({ ...snapshot, needsReview: false }),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const editor = useTrackStyleEditor();
  await editor.load('song');
  expect(editor.needsConfirmation.value).toBe(true);
  editor.confirm();
  await editor.save();
  expect(api.saveTrackStyleTags).toHaveBeenCalledWith(
    'song',
    'current',
    ['Rock'],
    [],
  );
});
