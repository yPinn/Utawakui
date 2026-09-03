'use strict';

function isTrustedMainFrame(webContents, details, getAllowedSender) {
  if (typeof getAllowedSender !== 'function') return false;
  const allowedSender = getAllowedSender();
  if (
    !allowedSender ||
    webContents !== allowedSender ||
    details?.isMainFrame !== true
  ) {
    return false;
  }
  const currentUrl = allowedSender.getURL?.();
  return Boolean(currentUrl && details.requestingUrl === currentUrl);
}

function isAudioOutputPermissionAllowed(
  webContents,
  permission,
  details,
  getAllowedSender,
) {
  return (
    permission === 'speaker-selection' &&
    isTrustedMainFrame(webContents, details, getAllowedSender)
  );
}

function registerAudioOutputPermissions(
  targetSession,
  { getAllowedSender } = {},
) {
  targetSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(
        isAudioOutputPermissionAllowed(
          webContents,
          permission,
          details,
          getAllowedSender,
        ),
      );
    },
  );
  targetSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) =>
      isAudioOutputPermissionAllowed(
        webContents,
        permission,
        details,
        getAllowedSender,
      ),
  );
}

module.exports = {
  isAudioOutputPermissionAllowed,
  isTrustedMainFrame,
  registerAudioOutputPermissions,
};
