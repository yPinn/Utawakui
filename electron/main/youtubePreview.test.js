import { expect, it, vi } from 'vitest';
import { registerYoutubePreviewHeaders } from './youtubePreview.js';

it('identifies only official embed frame requests from the main window', () => {
  const webRequest = { onBeforeSendHeaders: vi.fn() };
  registerYoutubePreviewHeaders({
    webRequest,
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { id: 7 } }),
  });
  const [, listener] = webRequest.onBeforeSendHeaders.mock.calls[0];
  const request = {
    method: 'GET',
    resourceType: 'subFrame',
    webContentsId: 7,
    url: 'https://www.youtube.com/embed/oZpYEEcvu5I',
    requestHeaders: { referer: 'old', Accept: 'text/html' },
  };
  const accept = vi.fn();
  listener(request, accept);
  expect(accept).toHaveBeenLastCalledWith({
    requestHeaders: {
      Referer: 'https://com.utawakui.app/',
      Accept: 'text/html',
    },
  });
  for (const fields of [
    { webContentsId: 8 },
    { resourceType: 'mainFrame' },
    { url: 'https://www.youtube.com/watch?v=oZpYEEcvu5I' },
    { url: 'https://www.youtube.com/embed/oZpYEEcvu5I/other' },
    { url: 'https://www.youtube.com/embed/oZpYEEcvu5I?redirect=1' },
  ]) {
    listener({ ...request, ...fields }, accept);
    expect(accept).toHaveBeenLastCalledWith({});
  }
});
