import fs from 'node:fs';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const workflowDirectory = path.resolve(
  import.meta.dirname,
  '..',
  '.github',
  'workflows',
);

function readWorkflow(name) {
  return yaml.load(
    fs.readFileSync(path.join(workflowDirectory, name), 'utf8'),
    { schema: yaml.JSON_SCHEMA },
  );
}

const workflowNames = fs
  .readdirSync(workflowDirectory)
  .filter((name) => name.endsWith('.yml'));

describe('dependency security workflow', () => {
  it('audits on a weekly schedule with read-only permissions', () => {
    const workflow = readWorkflow('dependency-security.yml');
    expect(workflow.on.schedule).toEqual([{ cron: expect.any(String) }]);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('blocks on app and relay advisories but only reports research runtimes', () => {
    const steps = readWorkflow('dependency-security.yml').jobs.audit.steps;
    const step = (name) => steps.find((candidate) => candidate.name === name);

    expect(step('App dependency audit')?.run).toBe('npm run audit:all');
    expect(step('Feedback relay dependency audit')).toMatchObject({
      'working-directory': 'services/feedback-relay',
      run: 'npm audit --audit-level=high',
    });
    expect(step('Feedback relay dependency audit')).not.toHaveProperty(
      'continue-on-error',
    );
    for (const name of [
      'Evaluation runtime dependency audit (report only)',
      'Downloaded runtime component advisories (report only)',
    ]) {
      expect(step(name)?.['continue-on-error']).toBe(true);
    }
    expect(
      step('Downloaded runtime component advisories (report only)')?.run,
    ).toBe('npm run audit:runtime');
  });
});

describe.each(workflowNames)('%s supply-chain hygiene', (name) => {
  const steps = Object.values(readWorkflow(name).jobs).flatMap(
    (job) => job.steps ?? [],
  );

  it('pins every action to a full commit SHA', () => {
    for (const { uses } of steps.filter((candidate) => candidate.uses)) {
      if (uses.startsWith('docker://')) {
        expect(uses).toMatch(/@sha256:[a-f0-9]{64}$/u);
      } else {
        expect(uses).toMatch(/@[a-f0-9]{40}$/u);
      }
    }
  });

  it('does not persist the job token in checked-out repositories', () => {
    const checkouts = steps.filter((candidate) =>
      candidate.uses?.startsWith('actions/checkout@'),
    );
    expect(checkouts.length).toBeGreaterThan(0);
    for (const checkout of checkouts) {
      expect(checkout.with?.['persist-credentials']).toBe(false);
    }
  });
});
