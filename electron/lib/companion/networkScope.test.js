import { describe, expect, it, vi } from 'vitest';
import {
  describeNetworkScope,
  isPrivateIpv4,
  listPrivateInterfaces,
  readNetworkProfiles,
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

  it('reads profiles by address with their names, and treats failures as unknown', async () => {
    const run = vi.fn(async () =>
      JSON.stringify([
        { IPAddress: '192.168.1.20', NetworkCategory: 1, Name: 'Home' },
        { IPAddress: '10.0.0.5', NetworkCategory: 0, Name: 'Cafe' },
        { IPAddress: '172.16.0.2', NetworkCategory: 2, Name: 'Corp' },
      ]),
    );
    expect(Object.fromEntries(await readNetworkProfiles(run))).toEqual({
      '192.168.1.20': { privateNetwork: true, network: 'Home' },
      '10.0.0.5': { privateNetwork: false, network: 'Cafe' },
      '172.16.0.2': { privateNetwork: true, network: 'Corp' },
    });
    const script = run.mock.calls[0][0];
    expect(script).toContain('InterfaceIndex');
    expect(script).not.toContain('InterfaceAlias');
    expect(script).toContain('[Console]::OutputEncoding');
    expect(
      await readNetworkProfiles(async () => {
        throw new Error('blocked');
      }),
    ).toEqual(new Map());
    expect(await readNetworkProfiles(async () => 'not json')).toEqual(
      new Map(),
    );
  });

  it('matches localized adapters by address and keeps localized names', async () => {
    // Windows reported 乙太網路 as private while the alias came back garbled.
    const run = async () =>
      JSON.stringify({
        IPAddress: '192.168.1.106',
        NetworkCategory: 1,
        Name: '網路 3',
      });
    expect(
      await describeNetworkScope({
        networkInterfaces: () => ({
          乙太網路: [
            { family: 'IPv4', address: '192.168.1.106', internal: false },
          ],
        }),
        run,
      }),
    ).toEqual([
      {
        name: '乙太網路',
        address: '192.168.1.106',
        network: '網路 3',
        privateNetwork: true,
      },
    ]);
  });

  it('marks each adapter with its profile and accepts a single object', async () => {
    const run = async () =>
      JSON.stringify({
        IPAddress: '192.168.1.20',
        NetworkCategory: 1,
        Name: 'Home',
      });
    expect(
      await describeNetworkScope({ networkInterfaces: interfaces, run }),
    ).toEqual([
      {
        name: 'Wi-Fi',
        address: '192.168.1.20',
        network: 'Home',
        privateNetwork: true,
      },
      {
        name: 'Ethernet',
        address: '10.0.0.5',
        network: '',
        privateNetwork: false,
      },
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
