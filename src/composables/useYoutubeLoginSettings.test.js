import { describe, expect, it, vi } from 'vitest';
import { useYoutubeLoginSettings } from './useYoutubeLoginSettings.js';

function bridge(overrides = {}) {
  return {
    getYoutubeLoginSource: vi.fn(async () => 'none'),
    setYoutubeLoginSource: vi.fn(async (value) => value),
    getYoutubeLoginStatus: vi.fn(async () => ({
      imported: false,
      noticeAcknowledged: false,
    })),
    importYoutubeLoginFile: vi.fn(async () => ({
      imported: true,
      noticeAcknowledged: true,
    })),
    removeYoutubeLoginFile: vi.fn(async () => ({
      imported: false,
      noticeAcknowledged: true,
    })),
    ...overrides,
  };
}

describe('useYoutubeLoginSettings', () => {
  it('lists the three sign-in choices', () => {
    expect(useYoutubeLoginSettings({ bridge: bridge() }).items).toEqual([
      { value: 'none', label: '不使用' },
      { value: 'firefox', label: '用 Firefox 的登入' },
      { value: 'file', label: '用登入檔案' },
    ]);
  });

  it('reads the source and file status together', async () => {
    const api = bridge({ getYoutubeLoginSource: vi.fn(async () => 'file') });
    const login = useYoutubeLoginSettings({ bridge: api });
    await login.refresh();
    expect(login.source.value).toBe('file');
    expect(login.status.value).toEqual({
      imported: false,
      noticeAcknowledged: false,
    });
  });

  it('passes the notice acknowledgement only when asked', async () => {
    const api = bridge();
    const login = useYoutubeLoginSettings({ bridge: api });
    await login.importFile({ acknowledgeNotice: true });
    await login.importFile();
    expect(api.importYoutubeLoginFile.mock.calls).toEqual([
      [{ acknowledgeNotice: true }],
      [{}],
    ]);
    expect(login.status.value.imported).toBe(true);
    await login.removeFile();
    expect(login.status.value.imported).toBe(false);
  });

  it('shows the Main error message for a rejected file', async () => {
    const api = bridge({
      importYoutubeLoginFile: vi.fn(async () => {
        throw new Error(
          'UTAWAKUI_APP_ERROR:{"code":"YOUTUBE_LOGIN_FILE_NO_YOUTUBE","severity":"warning","title":"無法匯入登入檔案","message":"檔案裡沒有 YouTube 的登入資料。"}',
        );
      }),
    });
    const login = useYoutubeLoginSettings({ bridge: api });
    await login.importFile();
    expect(login.fileError.value).toBe('檔案裡沒有 YouTube 的登入資料。');
    expect(login.fileBusy.value).toBe(false);
  });
});
