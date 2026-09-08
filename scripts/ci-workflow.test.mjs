import fs from 'node:fs';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const workflowPath = path.join(rootDirectory, '.github', 'workflows', 'ci.yml');
const packageVerifierPath = path.join(
  rootDirectory,
  'scripts',
  'verify-unsigned-windows-package.ps1',
);

function readWorkflow() {
  return yaml.load(fs.readFileSync(workflowPath, 'utf8'), {
    schema: yaml.JSON_SCHEMA,
  });
}

function jobCommands(job) {
  return job.steps.filter((step) => step.run).map((step) => step.run);
}

describe('ordinary CI workflow', () => {
  it('runs for main pushes, pull requests, and manual diagnostics', () => {
    const workflow = readWorkflow();

    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on.pull_request.types).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
      'converted_to_draft',
    ]);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency['cancel-in-progress']).toBe(true);
    expect(workflow.concurrency.group).toContain('github.workflow');
    expect(workflow.concurrency.group).toContain(
      'github.event.pull_request.number',
    );
    expect(workflow.concurrency.group).toContain('github.run_id');
  });

  it('keeps one bounded Ubuntu job and derives a tested execution plan', () => {
    const workflow = readWorkflow();
    const qualityJob = workflow.jobs.build;
    const commands = jobCommands(qualityJob);

    expect(qualityJob['runs-on']).toBe('ubuntu-latest');
    expect(qualityJob['timeout-minutes']).toBeLessThanOrEqual(15);
    expect(qualityJob.outputs['windows-package']).toContain(
      'steps.scope.outputs.windows_package',
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        'npm ci',
        'npm audit --audit-level=critical',
        'npm run license:inventory',
        'npm run lint',
        'npm run format:check',
        'npm run lint:md',
        'npm test',
        'npm run test:coverage',
        'npm run build',
      ]),
    );

    const scopeStep = qualityJob.steps.find(
      (step) => step.name === 'Classify CI scope',
    );
    expect(scopeStep?.id).toBe('scope');
    expect(scopeStep?.run).toContain('scripts/ci-changed-paths.mjs');
    expect(scopeStep?.run).toContain('$GITHUB_OUTPUT');

    const installStep = qualityJob.steps.find((step) => step.run === 'npm ci');
    const auditStep = qualityJob.steps.find(
      (step) => step.run === 'npm audit --audit-level=critical',
    );
    expect(auditStep?.if).toContain('dependency_audit');
    expect(installStep?.if).toContain('quality');
    expect(qualityJob.steps.indexOf(auditStep)).toBeLessThan(
      qualityJob.steps.indexOf(installStep),
    );

    const testStep = qualityJob.steps.find((step) => step.run === 'npm test');
    const coverageStep = qualityJob.steps.find(
      (step) => step.run === 'npm run test:coverage',
    );
    expect(testStep?.if).toContain("coverage == 'false'");
    expect(coverageStep?.if).toContain("coverage == 'true'");

    for (const command of [
      'npm run license:inventory',
      'npm run lint',
      'npm run format:check',
      'npm run lint:md',
      'npm run build',
    ]) {
      expect(
        qualityJob.steps.find((step) => step.run === command)?.if,
      ).toContain('quality');
    }

    const uploadStep = qualityJob.steps.find((step) =>
      step.uses?.startsWith('actions/upload-artifact@'),
    );
    expect(uploadStep?.if).toContain('failure()');
    expect(uploadStep?.with?.path).toBe('coverage/');
    expect(uploadStep?.with?.['retention-days']).toBe(7);
  });

  it('lints the correct commit range for pushes and pull requests', () => {
    const qualityJob = readWorkflow().jobs.build;
    const serializedSteps = JSON.stringify(qualityJob.steps);

    expect(serializedSteps).toContain("github.event_name == 'push'");
    expect(serializedSteps).toContain("github.event_name == 'pull_request'");
    expect(serializedSteps).toContain('github.event.before');
    expect(serializedSteps).toContain('github.event.pull_request.base.sha');
    expect(serializedSteps).toContain('github.event.pull_request.head.sha');
  });

  it('builds and verifies an ephemeral unsigned Windows updater bundle', () => {
    const workflow = readWorkflow();
    const packageJob = workflow.jobs['windows-package'];

    expect(packageJob).toBeDefined();
    expect(packageJob?.needs).toBe('build');
    expect(packageJob?.['runs-on']).toBe('windows-latest');
    expect(packageJob?.['timeout-minutes']).toBeLessThanOrEqual(20);
    expect(packageJob?.if).toContain(
      "needs.build.outputs.windows-package == 'true'",
    );
    expect(packageJob).not.toHaveProperty('environment');

    const serializedJob = JSON.stringify(packageJob);
    expect(serializedJob).toContain('npm run dist');
    expect(serializedJob).not.toContain('npm run dist:release');
    expect(serializedJob).toContain(
      'scripts/verify-unsigned-windows-package.ps1',
    );
    expect(serializedJob).not.toContain('-WriteChecksum');

    const verifier = fs.readFileSync(packageVerifierPath, 'utf8');
    expect(verifier).toContain('Get-AuthenticodeSignature');
    expect(verifier).toContain('NotSigned');
    expect(verifier).toContain('ProductVersion');
    expect(verifier).toContain('LICENSE.md');
    expect(verifier).toContain('THIRD_PARTY_NOTICES.md');
    expect(verifier).toContain('scripts/release-contract-cli.mjs artifacts');
  });

  it('does not sign, publish, retain, or grant secrets to PR packages', () => {
    const packageJob = readWorkflow().jobs['windows-package'];
    const serializedJob = JSON.stringify(packageJob);

    expect(serializedJob).not.toContain('secrets.');
    expect(serializedJob).not.toContain('CSC_');
    expect(serializedJob).not.toContain('WIN_CSC');
    expect(serializedJob).not.toContain('gh release');
    expect(serializedJob).not.toContain('--publish always');
    expect(serializedJob).not.toContain('actions/upload-artifact');
  });
});
