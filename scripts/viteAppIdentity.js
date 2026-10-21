'use strict';

const identity = require('../shared/appIdentity.json');
const rendererEntries = require('../shared/rendererEntries.json');

const ENTRY_ROLES = Object.freeze({
  '/': 'main',
  ...Object.fromEntries(
    Object.entries(rendererEntries).map(([role, entry]) => [`/${entry}`, role]),
  ),
  '/src/entries/prompter/': 'prompter',
});

function createAppIdentityPlugin() {
  return {
    name: 'utawakui-app-identity',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const role = Object.hasOwn(ENTRY_ROLES, context.path)
          ? ENTRY_ROLES[context.path]
          : null;
        if (!role) return html;
        const title =
          role === 'main'
            ? identity.productName
            : `${identity.productName} ${identity.roles[role]}`;
        return html
          .replaceAll('%UTAWAKUI_TITLE%', title)
          .replaceAll('%UTAWAKUI_FAVICON%', identity.favicon);
      },
    },
  };
}

module.exports = { createAppIdentityPlugin };
