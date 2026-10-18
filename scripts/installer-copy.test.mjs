import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const installer = fs.readFileSync(
  new URL('../build/installer.nsh', import.meta.url),
  'utf8',
);
const maintenance = fs.readFileSync(
  new URL('../build/installer-maintenance.nsh', import.meta.url),
  'utf8',
);

describe('installer copy and retention contract', () => {
  it('provides both languages for every custom message', () => {
    const messages = [
      ...`${installer}\n${maintenance}`.matchAll(
        /LangString (\w+) \$\{LANG_(\w+)\}/g,
      ),
    ];
    const ids = new Set(messages.map((entry) => entry[1]));
    for (const id of ids) {
      expect(
        messages
          .filter((entry) => entry[1] === id)
          .map((entry) => entry[2])
          .sort(),
      ).toEqual(['ENGLISH', 'TRADCHINESE']);
    }
  });

  it('checks the selected local installation before both silent and interactive replacement', () => {
    expect(maintenance).toContain(
      'ReadRegStr $utaInstalledVersion SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"',
    );
    expect(maintenance).toContain(
      '${VersionCompare} "${VERSION}" $utaInstalledVersion $0',
    );
    expect(maintenance).toMatch(
      /!macro customInit[\s\S]*?\$\{Silent\}[\s\S]*?Call utaGuardInstallerVersion/,
    );
    expect(maintenance).toMatch(
      /\$hasPerMachineInstallation == "1"[\s\S]*?setInstallModePerAllUsers[\s\S]*?Call utaGuardInstallerVersion/,
    );
    expect(maintenance).toMatch(
      /Function utaMaintenanceInstFilesPre\s+Call instFilesPre\s+Call utaGuardInstallerVersion/,
    );
    expect(maintenance).toMatch(
      /\$utaInstallAction == "older"[\s\S]*?SetErrorLevel 2\s+Quit/,
    );
    expect(maintenance).not.toMatch(
      /(?:inetc|NSISdl|ExecShell|Download)::|https?:\/\//i,
    );
  });

  it('explains inclusive app-data deletion before any cleanup choice', () => {
    expect(
      installer.indexOf('!define MUI_COMPONENTSPAGE_TEXT_TOP'),
    ).toBeLessThan(installer.indexOf('!macro customHeader'));
    expect(installer).toContain(
      '!define MUI_COMPONENTSPAGE_TEXT_TOP "$(utaCleanupText)"',
    );
    expect(installer).toMatch(
      /utaCleanupText \$\{LANG_TRADCHINESE\} ".*工具、模型與曲庫/,
    );
    expect(installer).toMatch(
      /utaCleanupText \$\{LANG_ENGLISH\} ".*tools, models and library files/,
    );
    expect(installer).not.toMatch(
      /LangString utaUnWelcomeText.*(下一頁|next page)/i,
    );
    expect(installer).toContain('RMDir /r /REBOOTOK "$APPDATA\\Utawakui"');
  });

  it('keeps all three destructive data choices opt-in', () => {
    expect(
      [
        ...installer.matchAll(
          /Section \/o "un\.\$\(utaSec\w+\)" (SEC_UN_\w+)/g,
        ),
      ].map((entry) => entry[1]),
    ).toEqual(['SEC_UN_DEPS', 'SEC_UN_APPDATA', 'SEC_UN_LIBRARY']);
    expect(installer).not.toMatch(/SectionSetFlags.*SF_SELECTED/);
    expect(installer).toContain('Call un.utaValidateLibraryCleanup');
    expect(installer).toContain('SectionSetText ${SEC_UN_LIBRARY} ""');
  });
});
