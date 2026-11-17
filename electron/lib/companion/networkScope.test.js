import { describe, expect, it, vi } from 'vitest';
import {
  describeNetworkScope,
  isPrivateIpv4,
  listPrivateInterfaces,
  readPrivateAliases,
} from './networkScope.js';

const interfaces = () => ({
  'Wi-Fi': [
    { family: 'IPv4', address: '192.168.1.20', internal: false },
    { family: 'IPv6', address: 'fe80::1', internal: false },
  ],
  Ethernet: [{ family: 'IPv4', address: '10.0.0.5', internal: false }],
  Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  'Public Adapter': [{ family: 'IPv4', address: '8.8.4.4', internal: false }],
  LinkLocal: [{ family: 'IPv4', address: '169.254.3.3', internal: false }],
});

describe('companion network scope', () => {
  it('recognizes RFC 1918 ranges only', () => {
    for (const address of [
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.1',
      '192.168.0.9',
    ])
      expect(isPrivateIpv4(address)).toBe(true);
    for (const address of [
      '172.32.0.1',
      '8.8.8.8',
      '169.254.1.1',
      '127.0.0.1',
      'x',
    ])
      expect(isPrivateIpv4(address)).toBe(false);
  });

  it('lists private IPv4 adapters without loopback, link-local or public addresses', () => {
    expect(listPrivateInterfaces(interfaces)).toEqual([
      { name: 'Wi-Fi', address: '192.168.1.20' },
      { name: 'Ethernet', address: '10.0.0.5' },
    ]);
  });

  it('reads private and domain profiles, and treats failures as unknown', async () => {
    const run = vi.fn(async () =>
      JSON.stringify([
        { InterfaceAlias: 'Wi-Fi', NetworkCategory: 1 },
        { InterfaceAlias: 'Ethernet', NetworkCategory: 0 },
        { InterfaceAlias: 'Corp', NetworkCategory: 'DomainAuthenticated' },
      ]),
    );
    expect([...(await readPrivateAliases(run))]).toEqual(['Wi-Fi', 'Corp']);
    expect(
      await readPrivateAliases(async () => {
        throw new Error('blocked');
      }),
    ).toEqual(new Set());
    expect(await readPrivateAliases(async () => 'not json')).toEqual(new Set());
  });

  it('marks each adapter with its profile and accepts a single profile object', async () => {
    const run = async () =>
      JSON.stringify({ InterfaceAlias: 'Wi-Fi', NetworkCategory: 'Private' });
    expect(
      await describeNetworkScope({ networkInterfaces: interfaces, run }),
    ).toEqual([
      { name: 'Wi-Fi', address: '192.168.1.20', privateNetwork: true },
      { name: 'Ethernet', address: '10.0.0.5', privateNetwork: false },
    ]);
  });

  it('skips the profile query when no private adapter exists', async () => {
    const run = vi.fn();
    expect(
      await describeNetworkScope({ networkInterfaces: () => ({}), run }),
    ).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
