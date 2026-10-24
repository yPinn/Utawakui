import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it, onTestFinished } from 'vitest';
import { expandZipArchive } from './archive.js';

describe.runIf(process.platform === 'win32')('expandZipArchive', () => {
  it('extracts into paths with spaces, quotes and subexpression syntax', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-archive-'));
    onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
    const unusual = path.join(root, "John Doe's $(Write-Output INJECTED)");
    const destination = path.join(unusual, 'out');
    fs.mkdirSync(destination, { recursive: true });
    const archivePath = path.join(unusual, 'runtime.zip');
    const zip = new AdmZip();
    zip.addFile('bin/tool.txt', Buffer.from('ok'));
    zip.writeZip(archivePath);

    await expandZipArchive(archivePath, destination, { id: 'runtime' });

    expect(
      fs.readFileSync(path.join(destination, 'bin', 'tool.txt'), 'utf8'),
    ).toBe('ok');
  });
});
