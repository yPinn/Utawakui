import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { EXTERNAL_TARGETS } from '../electron/main/externalNavigationHandlers.js';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const itWithBash = process.platform === 'win32' ? it.skip : it;

function readWorkflow(filename = 'release.yml') {
  return yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github/workflows', filename),
      'utf8',
    ),
    { schema: yaml.JSON_SCHEMA },
  );
}

function readYaml(filename) {
  return yaml.load(
    fs.readFileSync(path.join(rootDirectory, filename), 'utf8'),
    {
      schema: yaml.JSON_SCHEMA,
    },
  );
}

function readJson(filename) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDirectory, filename), 'utf8'),
  );
}

function readText(filename) {
  return fs.readFileSync(path.join(rootDirectory, filename), 'utf8');
}

describe('release workflow', () => {
  it('separates package, signing, and publishing credentials by job', () => {
    const workflow = readWorkflow();
    const packageJob = workflow.jobs.package;
    const signJob = workflow.jobs.sign;
    const publishJob = workflow.jobs.publish;

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(packageJob).not.toHaveProperty('environment');
    expect(JSON.stringify(packageJob)).not.toContain('secrets.');

    expect(signJob.environment).toBe('update-signing');
    expect(signJob.needs).toEqual(['validate', 'package']);
    expect(JSON.stringify(signJob)).toContain(
      'secrets.UPDATE_MANIFEST_PRIVATE_KEY_B64',
    );
    expect(JSON.stringify(signJob)).toContain(
      'secrets.UPDATE_MANIFEST_RETIRING_PRIVATE_KEY_B64',
    );
    expect(JSON.stringify(signJob)).not.toContain('PUBLIC_RELEASE_TOKEN');

    expect(publishJob.environment).toBe('release');
    expect(publishJob.needs).toEqual(['validate', 'package', 'sign']);
    const accessStep = publishJob.steps.find(
      (step) => step.name === 'Verify public release access',
    );
    const publishStep = publishJob.steps.find(
      (step) => step.name === 'Create or update public draft release',
    );

    expect(JSON.stringify(workflow.jobs)).not.toContain('WINDOWS_CERTIFICATE');
    expect(JSON.stringify(workflow.jobs)).not.toContain('CSC_');
    expect(accessStep.env.GH_TOKEN).toContain('secrets.PUBLIC_RELEASE_TOKEN');
    expect(publishStep.env.GH_TOKEN).toContain('secrets.PUBLIC_RELEASE_TOKEN');
    expect(JSON.stringify(publishJob)).not.toContain(
      'UPDATE_MANIFEST_PRIVATE_KEY_B64',
    );
  });

  it('enables packaged updates while explicitly disabling publisher verification', () => {
    const updateValues = readJson('shared/appUpdateValues.json');
    const builder = readYaml('electron-builder.yml');

    expect(updateValues.runtimeEnabled).toBe(true);
    expect(updateValues.signedManifestEnabled).toBe(false);
    expect(builder.publish).toMatchObject({
      provider: 'github',
      owner: 'yPinn',
      repo: 'Utawakui-Releases',
      releaseType: 'release',
    });
    expect(builder.win.signExecutable).toBe(false);
    expect(builder.win.verifyUpdateCodeSignature).toBe(false);
  });

  it('keeps the release-notes external link pointed at the same public feed identity', () => {
    const builder = readYaml('electron-builder.yml');

    // externalNavigationHandlers.js hardcodes this URL as a fixed allowlist
    // entry rather than deriving it from electron-builder.yml at runtime;
    // this test is what keeps the two from silently drifting apart if the
    // release repo is ever renamed or moved.
    expect(EXTERNAL_TARGETS['release-notes']).toBe(
      `https://github.com/${builder.publish.owner}/${builder.publish.repo}/releases`,
    );
  });

  it('pins Node 24 actions and Gitleaks to immutable references', () => {
    for (const filename of [
      'ci.yml',
      'public-test-release.yml',
      'release.yml',
    ]) {
      const workflowText = fs.readFileSync(
        path.join(rootDirectory, '.github/workflows', filename),
        'utf8',
      );

      expect(workflowText).toMatch(
        /uses:\s+actions\/checkout@[a-f0-9]{40}\s+# v7/u,
      );
      expect(workflowText).toMatch(
        /uses:\s+actions\/setup-node@[a-f0-9]{40}\s+# v7/u,
      );
      expect(workflowText).toMatch(
        /uses:\s+actions\/upload-artifact@[a-f0-9]{40}\s+# v7/u,
      );
      expect(workflowText).toMatch(
        /uses:\s+docker:\/\/ghcr\.io\/gitleaks\/gitleaks:v\d+\.\d+\.\d+@sha256:[a-f0-9]{64}\s+# v\d+\.\d+\.\d+/u,
      );
      expect(workflowText).not.toContain('gitleaks:latest');

      const workflow = readWorkflow(filename);
      const setupSteps = Object.values(workflow.jobs).flatMap((job) =>
        job.steps.filter((step) =>
          step.uses?.startsWith('actions/setup-node@'),
        ),
      );
      expect(setupSteps.length).toBeGreaterThan(0);
      expect(setupSteps.every((step) => step.with['node-version'] === 24)).toBe(
        true,
      );
    }

    const releaseWorkflowText = fs.readFileSync(
      path.join(rootDirectory, '.github/workflows/release.yml'),
      'utf8',
    );
    expect(releaseWorkflowText).toMatch(
      /uses:\s+actions\/download-artifact@[a-f0-9]{40}\s+# v8/u,
    );
  });

  it('avoids ambiguous PowerShell variable interpolation before colons', () => {
    for (const filename of ['public-test-release.yml', 'release.yml']) {
      const workflowText = fs.readFileSync(
        path.join(rootDirectory, '.github/workflows', filename),
        'utf8',
      );

      expect(workflowText).not.toMatch(
        /\$(?!(?:env|global|script|local|private|using):)[A-Za-z_][A-Za-z0-9_]*:/,
      );
    }
  });

  it('builds without builder publishing and only creates a reviewed public draft', () => {
    const workflow = readWorkflow();
    const packageCommands = JSON.stringify(workflow.jobs.package.steps);
    const publishCommands = JSON.stringify(workflow.jobs.publish.steps);
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'),
    );
    const packageVerifier = readText(
      'scripts/verify-unsigned-windows-package.ps1',
    );

    expect(packageJson.scripts.dist).toContain('--publish never');
    expect(packageCommands).toContain('Build unsigned updater bundle');
    expect(packageCommands).toContain(
      'scripts/verify-unsigned-windows-package.ps1',
    );
    expect(packageCommands).toContain('-WriteChecksum');
    expect(packageVerifier).toContain('NotSigned');
    expect(packageVerifier).toContain('scripts/release-contract-cli.mjs');
    expect(packageVerifier).toContain('artifacts');
    expect(packageVerifier).toContain('--directory $releaseDirectory');
    expect(packageVerifier).toContain('SHA256SUMS.txt');
    expect(packageCommands).not.toContain('gh release');
    expect(publishCommands).toContain('gh release create');
    expect(publishCommands).toContain('--draft');
    expect(publishCommands).toContain(
      'Refusing to modify an already published release',
    );
    expect(packageVerifier).toContain('LICENSE.md');
    expect(packageVerifier).toContain('THIRD_PARTY_NOTICES.md');
    expect(packageCommands).not.toContain('--publish always');
  });

  itWithBash('keeps the public draft step valid Bash', () => {
    const publishStep = readWorkflow().jobs.publish.steps.find(
      (step) => step.name === 'Create or update public draft release',
    );
    const result = spawnSync('bash', ['-n'], {
      input: publishStep.run,
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('moves one package artifact through optional signing and mandatory pre-publish verification', () => {
    const workflow = readWorkflow();
    const packageSteps = workflow.jobs.package.steps;
    const signSteps = workflow.jobs.sign.steps;
    const publishSteps = workflow.jobs.publish.steps;
    const packageUpload = packageSteps.find(
      (step) => step.name === 'Upload verified updater bundle',
    );
    const signDownload = signSteps.find(
      (step) => step.name === 'Download verified updater bundle',
    );
    const manifestUpload = signSteps.find(
      (step) => step.name === 'Upload signed update manifest',
    );
    const publishDownload = publishSteps.find(
      (step) => step.name === 'Download verified updater bundle',
    );
    const verifyStep = publishSteps.find(
      (step) => step.name === 'Verify signed update manifest',
    );
    const bundleVerifyStep = publishSteps.find(
      (step) => step.name === 'Verify downloaded updater bundle',
    );
    const signVerifyStep = signSteps.find(
      (step) => step.name === 'Verify signed update manifest',
    );

    expect(packageUpload.with.name).toContain('needs.validate.outputs.version');
    expect(signDownload.with.name).toBe(packageUpload.with.name);
    expect(publishDownload.with.name).toBe(packageUpload.with.name);
    expect(manifestUpload.with.path).toContain('update-manifest.json');
    expect(JSON.stringify(verifyStep)).toContain(
      'tools/update-signing/verify-manifest.mjs',
    );
    expect(JSON.stringify(verifyStep)).toContain('ACTIVE_KEY_ID');
    expect(JSON.stringify(verifyStep)).toContain('RETIRING_KEY_ID');
    expect(JSON.stringify(signVerifyStep)).toContain('--required-key-id');
    expect(JSON.stringify(signVerifyStep)).toContain('RETIRING_KEY_ID');
    expect(bundleVerifyStep.run).toContain(
      'release-contract-cli.mjs artifacts',
    );
    expect(bundleVerifyStep.run).toContain('sha256sum --check');
    expect(JSON.stringify(publishSteps)).toContain('npm ci --ignore-scripts');
    expect(workflow.jobs.publish.env.ACTIVE_KEY_ID).toContain('active_key_id');
    expect(workflow.jobs.publish.env.RETIRING_KEY_ID).toContain(
      'retiring_key_id',
    );
    expect(workflow.jobs.validate.outputs.retiring_key_id).toContain(
      'retiring_key_id',
    );

    const requireCredential = signSteps.find(
      (step) => step.name === 'Require signing credentials',
    );
    expect(JSON.stringify(requireCredential)).toContain('RETIRING_KEY_ID');
    expect(JSON.stringify(requireCredential)).toContain(
      'UPDATE_MANIFEST_RETIRING_PRIVATE_KEY_B64',
    );
  });

  it('keeps public releases manual and routes tags to unsigned review builds', () => {
    const releaseWorkflow = readWorkflow();
    const testWorkflow = readWorkflow('public-test-release.yml');
    const validateSteps = releaseWorkflow.jobs.validate.steps;
    const guardStep = validateSteps[0];

    expect(releaseWorkflow.on).not.toHaveProperty('push');
    expect(releaseWorkflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(guardStep.name).toBe('Require workflow dispatched from release tag');
    expect(JSON.stringify(guardStep)).toContain('github.ref_type');
    expect(JSON.stringify(guardStep)).toContain('github.ref_name');
    expect(
      validateSteps.findIndex((step) => step.uses?.includes('checkout')),
    ).toBe(1);
    expect(testWorkflow.on.push.tags).toEqual(['v*.*.*']);
    expect(testWorkflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(testWorkflow.jobs.package.needs).toBe('validate');
    expect(testWorkflow.jobs.validate.outputs.version).toContain(
      'release-version',
    );
  });

  it('keeps tag builds private but includes the complete updater bundle for review', () => {
    const workflow = readWorkflow('public-test-release.yml');
    const packageSteps = workflow.jobs.package.steps;
    const packageCommands = JSON.stringify(packageSteps);
    const uploadStep = packageSteps.find(
      (step) => step.name === 'Upload unsigned test bundle',
    );

    expect(workflow.jobs.package.needs).toBe('validate');
    expect(workflow.jobs.package).not.toHaveProperty('environment');
    expect(packageCommands).not.toContain('secrets.');
    expect(packageCommands).not.toContain('gh release');
    expect(packageCommands).toContain(
      'scripts/verify-unsigned-windows-package.ps1',
    );
    expect(packageCommands).toContain('-WriteChecksum');
    expect(uploadStep.with.path).toContain('SHA256SUMS.txt');
    expect(uploadStep.with.path).toContain('latest.yml');
    expect(uploadStep.with.path).toContain('.blockmap');
    expect(uploadStep.with['retention-days']).toBe(7);
  });

  it('bounds release jobs and retains only short-lived failure diagnostics', () => {
    for (const filename of ['public-test-release.yml', 'release.yml']) {
      const workflow = readWorkflow(filename);

      for (const job of Object.values(workflow.jobs)) {
        expect(job['timeout-minutes']).toBeLessThanOrEqual(
          job['runs-on'] === 'windows-latest' ? 20 : 15,
        );
      }

      const coverageStep = workflow.jobs.validate.steps.find((step) =>
        step.uses?.startsWith('actions/upload-artifact@'),
      );
      expect(coverageStep.if).toContain('failure()');
      expect(coverageStep.with['retention-days']).toBe(7);
    }

    const releaseWorkflow = readWorkflow();
    const publishSteps = releaseWorkflow.jobs.publish.steps;
    const publishIndex = publishSteps.findIndex(
      (step) => step.name === 'Create or update public draft release',
    );
    const recoveryIndex = publishSteps.findIndex(
      (step) => step.name === 'Upload failed release recovery bundle',
    );
    const recoveryStep = publishSteps[recoveryIndex];

    expect(recoveryIndex).toBeGreaterThan(publishIndex);
    expect(recoveryStep.if).toContain('failure()');
    expect(recoveryStep.with['retention-days']).toBe(3);
    expect(recoveryStep.with['if-no-files-found']).toBe('ignore');
  });
});
