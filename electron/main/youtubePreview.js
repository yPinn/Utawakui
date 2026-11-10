'use strict';

const { appUserModelId } = require('../../shared/appIdentity.json');

const EMBED = /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/u;

function registerYoutubePreviewHeaders({ webRequest, getMainWindow }) {
  webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/embed/*'] },
    (details, callback) => {
      const window = getMainWindow();
      if (
        !window ||
        window.isDestroyed() ||
        details.webContentsId !== window.webContents.id ||
        details.resourceType !== 'subFrame' ||
        details.method !== 'GET' ||
        !EMBED.test(details.url)
      ) {
        callback({});
        return;
      }
      const requestHeaders = Object.fromEntries(
        Object.entries(details.requestHeaders).filter(
          ([name]) => name.toLowerCase() !== 'referer',
        ),
      );
      requestHeaders.Referer = `https://${appUserModelId}/`;
      callback({ requestHeaders });
    },
  );
}

module.exports = { registerYoutubePreviewHeaders };
