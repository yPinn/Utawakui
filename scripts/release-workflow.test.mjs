import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';
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

describe('release workflow', () => {
  it('keeps the built-in token read-only and signing behind the release environment', () => {
    const workflow = readWorkflow();
    const packageJob = workflow.jobs.package;

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(packageJob.environment).toBe('release');
    expect(packageJob.env.EXPECTED_SIGNING_SUBJECT).toContain(
      'vars.WINDOWS_SIGNING_SUBJECT',
    );
    expect(packageJob.env).not.toHaveProperty('CSC_LINK');
    expect(packageJob.env).not.toHaveProperty('CSC_KEY_PASSWORD');
    expect(packageJob.env).not.toHaveProperty('GH_TOKEN');

    const credentialStep = packageJob.steps.find(
      (step) => step.name === 'Require release credentials',
    );
    const signingStep = packageJob.steps.find(
      (step) => step.name === 'Build signed installer',
    );
    const accessStep = packageJob.steps.find(
      (step) => step.name === 'Verify public release access',
    );
    const publishStep = packageJob.steps.find(
      (step) => step.name === 'Create or update public draft release',
    );

    expect(credentialStep.env.CSC_LINK).toContain(
      'secrets.WINDOWS_CERTIFICATE',
    );
    expect(signingStep.env.CSC_KEY_PASSWORD).toContain(
      'secrets.WINDOWS_CERTIFICATE_PASSWORD',
    );
    expect(accessStep.env.GH_TOKEN).toContain('secrets.PUBLIC_RELEASE_TOKEN');
    expect(publishStep.env.GH_TOKEN).toContain('secrets.PUBLIC_RELEASE_TOKEN');
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

  it('builds without builder publishing and only creates a public draft', () => {
    const workflow = readWorkflow();
    const packageCommands = JSON.stringify(workflow.jobs.package.steps);
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'),
    );

    expect(packageJson.scripts['dist:release']).toContain('--publish never');
    expect(packageJson.scripts['dist:release']).toContain(
      '--config.win.signExecutable=true',
    );
    expect(packageCommands).toContain('gh release create');
    expect(packageCommands).toContain('--draft');
    expect(packageCommands).toContain(
      'Refusing to modify an already published release',
    );
    expect(packageCommands).toContain('LICENSE.md');
    expect(packageCommands).toContain('THIRD_PARTY_NOTICES.md');
    expect(packageCommands).not.toContain('--publish always');
  });

  it('keeps signed releases manual and routes tags to unsigned test builds', () => {
    const signedWorkflow = readWorkflow();
    const testWorkflow = readWorkflow('public-test-release.yml');

    expect(signedWorkflow.on).not.toHaveProperty('push');
    expect(signedWorkflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(testWorkflow.on.push.tags).toEqual(['v*.*.*']);
    expect(testWorkflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(testWorkflow.jobs.package.needs).toBe('validate');
    expect(testWorkflow.jobs.validate.outputs.version).toContain(
      'release-version',
    );
  });

  it('keeps unsigned test artifacts private and excludes updater metadata', () => {
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
    expect(uploadStep.with.path).toContain('SHA256SUMS.txt');
    expect(uploadStep.with.path).not.toContain('latest.yml');
    expect(uploadStep.with.path).not.toContain('.blockmap');
  });
});
