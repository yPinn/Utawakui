import { afterEach, expect, it, vi } from 'vitest';
import { useTrackLanguageEditor } from './useTrackLanguageEditor.js';

afterEach(() => vi.unstubAllGlobals());

function stub(snapshot) {
  const api = {
    getTrackLanguages: vi.fn().mockResolvedValue({ ok: true, ...snapshot }),
    saveTrackLanguages: vi.fn(async (_id, _token, languages) => ({
      ok: true,
      editToken: 'next',
      languages,
      needsReview: false,
    })),
  };
  vi.stubGlobal('window', { Utawakui: api });
  return api;
}

const empty = { editToken: 'current', languages: [] };

it('saves several broad groups in display order', async () => {
  const api = stub(empty);
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  expect(editor.isDirty.value).toBe(false);
  editor.toggle('en', true);
  editor.toggle('ja', true);
  await editor.save();
  expect(api.saveTrackLanguages).toHaveBeenCalledWith('song', 'current', [
    'ja',
    'en',
  ]);
  expect(editor.isDirty.value).toBe(false);
});

it('keeps no vocals exclusive', async () => {
  stub({ ...empty, languages: ['ja', 'en'] });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  editor.toggle('zxx', true);
  expect(editor.languages.value).toEqual(['zxx']);
  editor.toggle('zh', true);
  expect(editor.languages.value).toEqual(['zh']);
});

it('stays clean after unticking and re-ticking a saved language', async () => {
  stub({ ...empty, languages: ['ja', 'en'] });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  editor.toggle('ja', false);
  editor.toggle('ja', true);
  expect(editor.languages.value).toEqual(['ja', 'en']);
  expect(editor.isDirty.value).toBe(false);
});

it('re-confirms unchanged languages after the audio changes', async () => {
  const api = stub({ ...empty, languages: ['ja'], needsReview: true });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  expect(editor.isDirty.value).toBe(false);
  editor.confirm();
  expect(editor.needsConfirmation.value).toBe(false);
  await editor.save();
  expect(api.saveTrackLanguages).toHaveBeenCalledWith('song', 'current', [
    'ja',
  ]);
});

it('reports a stale save without dropping the draft', async () => {
  const api = stub(empty);
  api.saveTrackLanguages.mockResolvedValueOnce({ ok: false, status: 'stale' });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  editor.toggle('ko', true);
  expect(await editor.save()).toBe(false);
  expect(editor.error.value).not.toBe('');
  expect(editor.languages.value).toEqual(['ko']);
});
