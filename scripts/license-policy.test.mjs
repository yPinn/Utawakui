import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.resolve(import.meta.dirname, '..');

function readText(filename) {
  return fs.readFileSync(path.join(rootDirectory, filename), 'utf8');
}

describe('Utawakui license policy', () => {
  it('keeps the application private and proprietary in package metadata', () => {
    const packageJson = JSON.parse(readText('package.json'));
    const packageLock = JSON.parse(readText('package-lock.json'));

    expect(packageJson.private).toBe(true);
    expect(packageJson.license).toBe('UNLICENSED');
    expect(packageLock.packages[''].license).toBe('UNLICENSED');
  });

  it('grants application use without granting redistribution or media rights', () => {
    const license = readText('LICENSE.md');

    expect(license).toMatch(/營利直播與\s*錄製/);
    expect(license).toContain('重新散布、轉售');
    expect(license).toContain('歌曲、歌詞、封面、錄音');
    expect(license).toContain('monetized live streams and recordings');
    expect(license).toContain('does not grant rights to songs');
  });

  it('packages both the product license and third-party notices', () => {
    const builderConfig = yaml.load(readText('electron-builder.yml'));

    expect(builderConfig.files).toContain('LICENSE.md');
    expect(builderConfig.files).toContain('THIRD_PARTY_NOTICES.md');
  });
});
