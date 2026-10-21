import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import identity from '../../../shared/appIdentity.json';
import windowIdentity from './windowIdentity.js';

const { getWindowIdentity } = windowIdentity;

describe('window brand identity', () => {
  it('keeps installed identity and native assets compatible', () => {
    expect(identity.productName).toBe('Utawakui');
    expect(identity.appUserModelId).toBe('com.utawakui.app');
    const main = getWindowIdentity('main');
    expect(main.title).toBe(identity.productName);
    expect(path.isAbsolute(main.icon)).toBe(true);
    expect(existsSync(main.icon)).toBe(true);
    expect(readFileSync(main.icon).subarray(0, 4)).toEqual(
      Buffer.from([0, 0, 1, 0]),
    );
    const builder = readFileSync(
      new URL('../../../electron-builder.yml', import.meta.url),
      'utf8',
    );
    expect(builder).toContain(`productName: ${identity.productName}`);
    expect(builder).toContain(`appId: ${identity.appUserModelId}`);
    expect(builder).toContain(identity.nativeIcon);
  });

  it('shares the native icon while keeping role titles separate', () => {
    expect(getWindowIdentity('prompter')).toEqual({
      title: 'Utawakui 提詞器',
      icon: getWindowIdentity('main').icon,
    });
    expect(getWindowIdentity('output').title).toBe('Utawakui 輸出');
    expect(identity.roles.main).toBe('控制台');
  });

  it.each(['../main', 'performer', '__proto__', '', null])(
    'rejects unknown role %s',
    (role) => {
      expect(() => getWindowIdentity(role)).toThrow(RangeError);
    },
  );
});
