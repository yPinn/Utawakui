import fs from 'node:fs';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const workflowPath = path.join(rootDirectory, '.github', 'workflows', 'ci.yml');
const packageJsonPath = path.join(rootDirectory, 'package.json');
const packageVerifierPath = path.join(
  rootDirectory,
  'scripts',
  'verify-unsigned-windows-package.ps1',
);
const installedAcceptancePath = path.join(
  rootDirectory,
  'scripts',
  'windows-installed-acceptance.ps1',
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

  it('builds and verifies an ephemeral installed Windows upgrade', () => {
    const workflow = readWorkflow();
    const packageJob = workflow.jobs['windows-package'];

    expect(packageJob).toBeDefined();
    expect(packageJob?.needs).toBe('build');
    expect(packageJob?.['runs-on']).toBe('windows-latest');
    expect(packageJob?.['timeout-minutes']).toBeLessThanOrEqual(30);
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
    expect(serializedJob).toContain('scripts/windows-installed-acceptance.ps1');
    expect(serializedJob).not.toContain('-WriteChecksum');
    expect(serializedJob).toContain('-FromVersion 0.3.0');
    expect(serializedJob).toContain('-EvidenceDirectory release-evidence');

    const evidenceUpload = packageJob.steps.find((step) =>
      step.uses?.startsWith('actions/upload-artifact@'),
    );
    expect(evidenceUpload?.if).toBe('always()');
    expect(evidenceUpload?.with?.path).toBe('release-evidence/');
    expect(evidenceUpload?.with?.['retention-days']).toBe(7);

    const verifier = fs.readFileSync(packageVerifierPath, 'utf8');
    expect(verifier).toContain('Get-AuthenticodeSignature');
    expect(verifier).toContain('NotSigned');
    expect(verifier).toContain('ProductVersion');
    expect(verifier).toContain('LICENSE.md');
    expect(verifier).toContain('THIRD_PARTY_NOTICES.md');
    expect(verifier).toContain('scripts/release-contract-cli.mjs');
    expect(verifier).toContain('artifacts');
    expect(verifier).toContain('--directory $releaseDirectory');

    const installedAcceptance = fs.readFileSync(
      installedAcceptancePath,
      'utf8',
    );
    expect(installedAcceptance).toContain('AllowLocalMachineMutation');
    expect(installedAcceptance).toContain('PlanOnly');
    expect(installedAcceptance).toContain('GITHUB_ACTIONS');
    expect(installedAcceptance).toContain('Get-CimInstance Win32_Process');
    expect(installedAcceptance).toContain('Get-AuthenticodeSignature');
    expect(installedAcceptance).toContain(
      '"Utawakui $($displayVersion.Value)"',
    );
    expect(installedAcceptance).toContain(
      'does not match package.json version',
    );
    expect(installedAcceptance).toContain('startup-performance.mjs');
    expect(installedAcceptance).toContain('update-acceptance-evidence.mjs');
    expect(installedAcceptance).toContain(
      'https://github.com/yPinn/Utawakui-Releases/releases/download/v0.3.0/Utawakui-Setup-0.3.0.exe',
    );
    expect(installedAcceptance).toContain(
      '42449127cf39401e4272d4dcd39b5c8a004c3fa5a968ab46e12fbb3dadb8386e',
    );
    expect(installedAcceptance).toContain('Invoke-WebRequest');
    expect(installedAcceptance).toContain('Stop-Process -Id');
    expect(installedAcceptance).toContain(
      'Remove-Item -LiteralPath $TemporaryRoot',
    );
    expect(installedAcceptance).not.toContain('taskkill');
    expect(installedAcceptance).not.toMatch(/Stop-Process\s+-Name/iu);

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(packageJson.scripts['release:verify-installed']).toContain(
      'windows-installed-acceptance.ps1',
    );
  });

  it('does not sign, publish, retain installers, or grant secrets to PR packages', () => {
    const packageJob = readWorkflow().jobs['windows-package'];
    const serializedJob = JSON.stringify(packageJob);

    expect(serializedJob).not.toContain('secrets.');
    expect(serializedJob).not.toContain('CSC_');
    expect(serializedJob).not.toContain('WIN_CSC');
    expect(serializedJob).not.toContain('gh release');
    expect(serializedJob).not.toContain('--publish always');
    expect(serializedJob).not.toContain('release/*.exe');
    expect(serializedJob).not.toContain('release/**/*.exe');
  });
});
