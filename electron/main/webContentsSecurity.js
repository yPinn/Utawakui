'use strict';

function hardenWebContentsNavigation(webContents, options = {}) {
  if (
    !webContents ||
    typeof webContents.setWindowOpenHandler !== 'function' ||
    typeof webContents.on !== 'function'
  ) {
    throw new TypeError('A live webContents boundary is required');
  }

  const { isAllowedNavigation } = options;
  const shouldAllow = (url) => {
    if (typeof isAllowedNavigation !== 'function') return false;
    try {
      return isAllowedNavigation(url) === true;
    } catch {
      return false;
    }
  };
  const guardNavigation = (event, url) => {
    if (!shouldAllow(url)) event.preventDefault();
  };

  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', guardNavigation);
  webContents.on('will-redirect', guardNavigation);
}

module.exports = { hardenWebContentsNavigation };
