import fs from 'node:fs';
import path from 'node:path';

import * as yaml from 'js-yaml';
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

  it('preserves statutory and independent third-party rights in both languages', () => {
    const [chinese, english] = readText('LICENSE.md').split(/\r?\n---\r?\n/u);

    expect(chinese).toContain('適用法律允許且無須另行取得權利人同意');
    expect(chinese).toContain('故意或重大過失責任及消費者保護責任');
    expect(chinese).toContain('這些條款授予的權利不受本授權限制');
    expect(english).toContain(
      'applicable law permits without further permission',
    );
    expect(english).toContain('intentional misconduct or gross negligence');
    expect(english).toContain(
      'does not restrict rights granted under those licenses',
    );
  });

  it('packages both the product license and third-party notices', () => {
    const builderConfig = yaml.load(readText('electron-builder.yml'));

    expect(builderConfig.files).toContain('LICENSE.md');
    expect(builderConfig.files).toContain('THIRD_PARTY_NOTICES.md');
    expect(builderConfig.afterPack).toBe(
      'scripts/afterPackThirdPartyNotices.cjs',
    );
    expect(builderConfig.extraResources).toContainEqual({
      from: 'third-party',
      to: 'third-party',
      filter: ['NOTICES.txt', 'manifest.json'],
    });
  });
});
