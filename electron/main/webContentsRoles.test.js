import { describe, expect, it } from 'vitest';
import rolesModule from './webContentsRoles.js';

const { WEB_CONTENTS_ROLES, tagWebContentsRole, webContentsRoleOf } =
  rolesModule;

describe('webContents roles', () => {
  it('tags only fixed roles on live contents', () => {
    const contents = {};
    const other = {};
    tagWebContentsRole(contents, WEB_CONTENTS_ROLES.PERFORMER);
    tagWebContentsRole(other, 'Private Window Title');
    tagWebContentsRole(null, WEB_CONTENTS_ROLES.MAIN);

    expect(webContentsRoleOf(contents)).toBe('performer');
    expect(webContentsRoleOf(other)).toBeUndefined();
    expect(webContentsRoleOf(undefined)).toBeUndefined();
  });
});
