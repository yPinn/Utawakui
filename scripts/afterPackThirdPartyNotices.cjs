'use strict';

module.exports = async function afterPackThirdPartyNotices(context) {
  const { verifyPackagedThirdPartyNotices } =
    await import('./third-party-notices.mjs');
  verifyPackagedThirdPartyNotices(
    context.packager.projectDir,
    context.appOutDir,
  );
  const { verifyReleaseRuntimePackage } =
    await import('./verify-runtime-package.mjs');
  verifyReleaseRuntimePackage(context.appOutDir);
};
