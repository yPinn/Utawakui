'use strict';

module.exports = async function beforePackReleaseRuntime(context) {
  const { buildReleaseRuntime } = await import('./build-release-runtime.mjs');
  await buildReleaseRuntime({ rootDirectory: context.packager.projectDir });
};
