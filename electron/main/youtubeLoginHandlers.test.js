import { describe, expect, it, vi } from 'vitest';
import { LOGIN_FILE_ERRORS } from '../lib/youtubeLoginStore.js';
import {
  YOUTUBE_LOGIN_NOTICE_VERSION,
  registerYoutubeLoginHandlers,
} from './youtubeLoginHandlers.js';

function setup({
  picked = { canceled: false, filePaths: ['C:/x/cookies.txt'] },
  importError = null,
  config = {},
} = {}) {
  const handlers = new Map();
  let state = { youtubeLoginSource: 'none', ...config };
  let imported = false;
  const store = {
    getStatus: () => ({ imported }),
    importFile: vi.fn(() => {
      if (importError) throw importError;
      imported = true;
    }),
    remove: vi.fn(() => {
      imported = false;
    }),
  };
  const dialog = { showOpenDialog: vi.fn().mockResolvedValue(picked) };
  registerYoutubeLoginHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    store,
    dialog,
    getMainWindow: () => null,
    getConfig: () => state,
    updateConfig: (patch) => {
      state = { ...state, ...patch };
    },
    recordDiagnostic: () => ({ ok: true }),
  });
  const call = (channel, ...args) => handlers.get(channel)({}, ...args);
  return { call, store, dialog, getState: () => state };
}

describe('youtube login handlers', () => {
  it('reads and validates the sign-in source', async () => {
    const view = setup();
    expect(await view.call('config:get-youtube-login-source')).toBe('none');
    expect(await view.call('config:set-youtube-login-source', 'file')).toBe(
      'file',
    );
    await expect(
      view.call('config:set-youtube-login-source', 'chrome'),
    ).rejects.toThrow('YOUTUBE_LOGIN_SOURCE_INVALID');
  });

  it('requires the notice once, then imports without asking again', async () => {
    const view = setup();
    await expect(view.call('youtube-login:import')).rejects.toThrow(
      'YOUTUBE_LOGIN_NOTICE_REQUIRED',
    );
    expect(view.dialog.showOpenDialog).not.toHaveBeenCalled();

    expect(
      await view.call('youtube-login:import', { acknowledgeNotice: true }),
    ).toEqual({ imported: true, noticeAcknowledged: true });
    expect(view.getState().youtubeLoginNoticeVersion).toBe(
      YOUTUBE_LOGIN_NOTICE_VERSION,
    );
    await view.call('youtube-login:import');
    expect(view.store.importFile).toHaveBeenCalledTimes(2);
  });

  it('returns the unchanged status when the picker is cancelled', async () => {
    const view = setup({
      picked: { canceled: true, filePaths: [] },
      config: { youtubeLoginNoticeVersion: YOUTUBE_LOGIN_NOTICE_VERSION },
    });
    expect(await view.call('youtube-login:import')).toMatchObject({
      imported: false,
      canceled: true,
    });
    expect(view.store.importFile).not.toHaveBeenCalled();
  });

  it.each([
    [LOGIN_FILE_ERRORS.FORMAT, LOGIN_FILE_ERRORS.FORMAT],
    [LOGIN_FILE_ERRORS.TOO_LARGE, LOGIN_FILE_ERRORS.FORMAT],
    [LOGIN_FILE_ERRORS.NO_YOUTUBE, LOGIN_FILE_ERRORS.NO_YOUTUBE],
  ])('reports %s as a fixable file error', async (thrown, expected) => {
    const view = setup({
      importError: Object.assign(new Error(thrown), { code: thrown }),
      config: { youtubeLoginNoticeVersion: YOUTUBE_LOGIN_NOTICE_VERSION },
    });
    await expect(view.call('youtube-login:import')).rejects.toThrow(expected);
  });

  it('hides unexpected failures behind a retry error', async () => {
    const view = setup({
      importError: new Error('EACCES C:/private/path'),
      config: { youtubeLoginNoticeVersion: YOUTUBE_LOGIN_NOTICE_VERSION },
    });
    const error = await view.call('youtube-login:import').catch((e) => e);
    expect(error.message).toContain('YOUTUBE_LOGIN_IMPORT_FAILED');
    expect(error.message).not.toContain('private');
  });

  it('removes the stored file', async () => {
    const view = setup({
      config: { youtubeLoginNoticeVersion: YOUTUBE_LOGIN_NOTICE_VERSION },
    });
    await view.call('youtube-login:import');
    expect(await view.call('youtube-login:remove')).toEqual({
      imported: false,
      noticeAcknowledged: true,
    });
  });
});
