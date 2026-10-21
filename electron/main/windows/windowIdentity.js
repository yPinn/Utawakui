'use strict';

const path = require('node:path');
const identity = require('../../../shared/appIdentity.json');

// Static brand data only: importing this before app.setName must not read
// Electron state, userData or user configuration.
function getWindowIdentity(role) {
  if (!Object.hasOwn(identity.roles, role)) {
    throw new RangeError('Unknown window role');
  }
  return {
    title:
      role === 'main'
        ? identity.productName
        : `${identity.productName} ${identity.roles[role]}`,
    icon: path.join(__dirname, '..', '..', '..', identity.nativeIcon),
  };
}

module.exports = { getWindowIdentity };
