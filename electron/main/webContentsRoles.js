'use strict';

// Window owners tag their webContents so lifecycle diagnostics can say which
// surface failed. Roles are fixed identifiers, never titles or URLs.
const WEB_CONTENTS_ROLES = Object.freeze({
  MAIN: 'main',
  OUTPUT: 'output',
  PERFORMER: 'performer',
  STARTUP_PROBE: 'startup-probe',
});

const roles = new WeakMap();
const knownRoles = new Set(Object.values(WEB_CONTENTS_ROLES));

function tagWebContentsRole(webContents, role) {
  if (webContents && typeof webContents === 'object' && knownRoles.has(role)) {
    roles.set(webContents, role);
  }
}

function webContentsRoleOf(webContents) {
  return webContents && typeof webContents === 'object'
    ? roles.get(webContents)
    : undefined;
}

module.exports = { WEB_CONTENTS_ROLES, tagWebContentsRole, webContentsRoleOf };
