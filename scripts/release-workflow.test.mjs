import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.resolve(import.meta.dirname, '..');

function readWorkflow() {
  return yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github/workflows/release.yml'),
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
    expect(packageJob.env.CSC_LINK).toContain('secrets.WINDOWS_CERTIFICATE');
    expect(packageJob.env.GH_TOKEN).toContain('secrets.PUBLIC_RELEASE_TOKEN');
    expect(packageJob.env.EXPECTED_SIGNING_SUBJECT).toContain(
      'vars.WINDOWS_SIGNING_SUBJECT',
    );
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
    expect(packageCommands).not.toContain('--publish always');
  });

  it('accepts only a tag source and validates before the Windows package job', () => {
    const workflow = readWorkflow();

    expect(workflow.on.push.tags).toEqual(['v*.*.*']);
    expect(workflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(workflow.jobs.package.needs).toBe('validate');
    expect(workflow.jobs.validate.outputs.version).toContain('release-version');
  });
});
