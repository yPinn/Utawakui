import { afterEach, expect, it, vi } from 'vitest';
import { useTrackLanguageEditor } from './useTrackLanguageEditor.js';

afterEach(() => vi.unstubAllGlobals());

function stub(snapshot) {
  const api = {
    getTrackLanguages: vi.fn().mockResolvedValue({ ok: true, ...snapshot }),
    saveTrackLanguages: vi.fn(async (_id, _token, languages, primary) => ({
      ok: true,
      editToken: 'next',
      languages,
      primary: languages.length === 1 ? languages[0] : primary,
      status: languages.length ? 'confirmed' : 'pending',
      needsReview: false,
    })),
  };
  vi.stubGlobal('window', { Utawakui: api });
  return api;
}

const empty = {
  editToken: 'current',
  languages: [],
  primary: null,
  status: 'pending',
};

it('saves a mixed-language selection with an optional primary', async () => {
  const api = stub(empty);
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  expect(editor.isDirty.value).toBe(false);
  editor.toggle('ko', true);
  expect(editor.needsPrimary.value).toBe(false);
  editor.toggle('en', true);
  expect(editor.needsPrimary.value).toBe(true);
  editor.setPrimary('ko');
  await editor.save();
  expect(api.saveTrackLanguages).toHaveBeenCalledWith(
    'song',
    'current',
    ['ko', 'en'],
    'ko',
  );
  expect(editor.isDirty.value).toBe(false);
});

it('keeps no vocals exclusive and clears a removed primary', async () => {
  stub({ ...empty, languages: ['ja', 'en'], primary: 'ja' });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  editor.toggle('ja', false);
  expect(editor.primary.value).toBeNull();
  editor.toggle('zxx', true);
  expect(editor.languages.value).toEqual(['zxx']);
  editor.toggle('cmn', true);
  expect(editor.languages.value).toEqual(['cmn']);
});

it('keeps saved codes outside the offered list selectable', async () => {
  const api = stub({ ...empty, languages: ['es'], primary: 'es' });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  expect(editor.choices.value.at(-1)).toBe('es');
  editor.toggle('en', true);
  await editor.save();
  expect(api.saveTrackLanguages.mock.calls[0][2]).toEqual(['en', 'es']);
});

it('reports a stale save without dropping the draft', async () => {
  const api = stub(empty);
  api.saveTrackLanguages.mockResolvedValueOnce({ ok: false, status: 'stale' });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  editor.toggle('yue', true);
  expect(await editor.save()).toBe(false);
  expect(editor.error.value).not.toBe('');
  expect(editor.languages.value).toEqual(['yue']);
});

it('re-confirms unchanged languages after the audio changes', async () => {
  const api = stub({
    ...empty,
    languages: ['ja'],
    primary: 'ja',
    needsReview: true,
  });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  expect(editor.isDirty.value).toBe(false);
  editor.confirm();
  expect(editor.needsConfirmation.value).toBe(false);
  await editor.save();
  expect(api.saveTrackLanguages).toHaveBeenCalledWith(
    'song',
    'current',
    ['ja'],
    null,
  );
});

it('asks for a main language instead of keeping the single one', async () => {
  const api = stub({ ...empty, languages: ['ja'], primary: 'ja' });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  editor.toggle('en', true);
  expect(editor.primary.value).toBeNull();
  await editor.save();
  expect(api.saveTrackLanguages.mock.calls[0].slice(2)).toEqual([
    ['ja', 'en'],
    null,
  ]);
});

it('stays clean after unticking and re-ticking a saved language', async () => {
  stub({ ...empty, languages: ['ja', 'en'], primary: null });
  const editor = useTrackLanguageEditor();
  await editor.load('song');
  editor.toggle('ja', false);
  editor.toggle('ja', true);
  expect(editor.languages.value).toEqual(['ja', 'en']);
  expect(editor.isDirty.value).toBe(false);
});
