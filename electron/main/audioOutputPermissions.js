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
    ['speaker-selection', 'local-fonts'].includes(permission) &&
    isTrustedMainFrame(webContents, details, getAllowedSender)
  );
}

function registerAudioOutputPermissions(
  targetSession,
  { getAllowedSender, isMicrophoneAllowed = () => false } = {},
) {
  const allowMicrophone = (webContents, permission, details) =>
    permission === 'media' &&
    isTrustedMainFrame(webContents, details, getAllowedSender) &&
    isMicrophoneAllowed(webContents) === true;
  targetSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(
        isAudioOutputPermissionAllowed(
          webContents,
          permission,
          details,
          getAllowedSender,
        ) ||
          (allowMicrophone(webContents, permission, details) &&
            Array.isArray(details?.mediaTypes) &&
            details.mediaTypes.length === 1 &&
            details.mediaTypes[0] === 'audio'),
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
      ) ||
      (allowMicrophone(webContents, permission, details) &&
        details?.mediaType === 'audio'),
  );
}

module.exports = {
  isAudioOutputPermissionAllowed,
  isTrustedMainFrame,
  registerAudioOutputPermissions,
};
