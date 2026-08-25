import fs from 'node:fs';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.resolve(import.meta.dirname, '..');

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
  it('keeps the built-in token read-only and public publishing behind the release environment', () => {
    const workflow = readWorkflow();
    const packageJob = workflow.jobs.package;

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(packageJob.environment).toBe('release');
    expect(packageJob.env).not.toHaveProperty('GH_TOKEN');

    const credentialStep = packageJob.steps.find(
      (step) => step.name === 'Require release credentials',
    );
    const accessStep = packageJob.steps.find(
      (step) => step.name === 'Verify public release access',
    );
    const publishStep = packageJob.steps.find(
      (step) => step.name === 'Create or update public draft release',
    );

    expect(JSON.stringify(credentialStep)).not.toContain('WINDOWS_CERTIFICATE');
    expect(JSON.stringify(packageJob.steps)).not.toContain('CSC_');
    expect(accessStep.env.GH_TOKEN).toContain('secrets.PUBLIC_RELEASE_TOKEN');
    expect(publishStep.env.GH_TOKEN).toContain('secrets.PUBLIC_RELEASE_TOKEN');
  });

  it('enables packaged updates while explicitly disabling publisher verification', () => {
    const updateValues = readJson('shared/appUpdateValues.json');
    const builder = readYaml('electron-builder.yml');

    expect(updateValues.runtimeEnabled).toBe(true);
    expect(builder.publish).toMatchObject({
      provider: 'github',
      owner: 'yPinn',
      repo: 'Utawakui-Releases',
      releaseType: 'release',
    });
    expect(builder.win.signExecutable).toBe(false);
    expect(builder.win.verifyUpdateCodeSignature).toBe(false);
  });

  it('uses Node 24 actions and project runtime in CI and release jobs', () => {
    for (const filename of [
      'ci.yml',
      'public-test-release.yml',
      'release.yml',
    ]) {
      const workflowText = fs.readFileSync(
        path.join(rootDirectory, '.github/workflows', filename),
        'utf8',
      );

      expect(workflowText).not.toMatch(/actions\/(checkout|setup-node)@v4/);
      expect(workflowText).not.toContain('actions/upload-artifact@v4');
      expect(workflowText).toMatch(/actions\/checkout@v7/);
      expect(workflowText).toMatch(/actions\/setup-node@v7/);
      expect(workflowText).toMatch(/actions\/upload-artifact@v7/);

      const workflow = readWorkflow(filename);
      const setupSteps = Object.values(workflow.jobs).flatMap((job) =>
        job.steps.filter((step) => step.uses === 'actions/setup-node@v7'),
      );
      expect(setupSteps.length).toBeGreaterThan(0);
      expect(setupSteps.every((step) => step.with['node-version'] === 24)).toBe(
        true,
      );
    }
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
    expect(packageVerifier).toContain(
      'scripts/release-contract-cli.mjs artifacts',
    );
    expect(packageVerifier).toContain('SHA256SUMS.txt');
    expect(packageCommands).toContain('gh release create');
    expect(packageCommands).toContain('--draft');
    expect(packageCommands).toContain(
      'Refusing to modify an already published release',
    );
    expect(packageVerifier).toContain('LICENSE.md');
    expect(packageVerifier).toContain('THIRD_PARTY_NOTICES.md');
    expect(packageCommands).not.toContain('--publish always');
  });

  it('keeps public releases manual and routes tags to unsigned review builds', () => {
    const releaseWorkflow = readWorkflow();
    const testWorkflow = readWorkflow('public-test-release.yml');

    expect(releaseWorkflow.on).not.toHaveProperty('push');
    expect(releaseWorkflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
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
  });
});
