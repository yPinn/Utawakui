import { describe, it, expect } from 'vitest';
import {
  compareAudioDevices,
  deviceRoleBadgeLabel,
  groupDevicesByIdentity,
  isVirtualCableDevice,
  shortenDeviceLabel,
  stripDeviceRolePrefix,
} from './audioDeviceLabel.js';

describe('isVirtualCableDevice', () => {
  it('detects VB-CABLE by its fixed product name', () => {
    expect(isVirtualCableDevice('CABLE Input (VB-Audio Virtual Cable)')).toBe(
      true,
    );
    expect(isVirtualCableDevice('CABLE Output (VB-Audio Virtual Cable)')).toBe(
      true,
    );
  });

  it('detects VoiceMeeter devices', () => {
    expect(
      isVirtualCableDevice('VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)'),
    ).toBe(true);
    expect(isVirtualCableDevice('VoiceMeeter Aux Input')).toBe(true);
  });

  it('detects the older Virtual Audio Cable product', () => {
    expect(isVirtualCableDevice('Line 1 (Virtual Audio Cable)')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isVirtualCableDevice('cable input (vb-audio virtual cable)')).toBe(
      true,
    );
  });

  it('does not flag ordinary hardware output devices', () => {
    expect(
      isVirtualCableDevice('喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)'),
    ).toBe(false);
    expect(isVirtualCableDevice('Default - 喇叭 (Realtek(R) Audio)')).toBe(
      false,
    );
    expect(isVirtualCableDevice('VG259QM (NVIDIA High Definition Audio)')).toBe(
      false,
    );
  });

  it('returns false for empty/missing labels', () => {
    expect(isVirtualCableDevice('')).toBe(false);
    expect(isVirtualCableDevice(undefined)).toBe(false);
    expect(isVirtualCableDevice(null)).toBe(false);
  });
});

describe('shortenDeviceLabel', () => {
  it('strips the Windows device-role prefix', () => {
    expect(shortenDeviceLabel('Default - 喇叭 (Realtek(R) Audio)')).toBe(
      '喇叭 (Realtek(R) Audio)',
    );
    expect(
      shortenDeviceLabel('Communications - 喇叭 (Turtle Beach Stealth 700 G2)'),
    ).toBe('喇叭 (Turtle Beach Stealth 700 G2)');
  });

  it('strips the trailing USB VID:PID suffix', () => {
    expect(
      shortenDeviceLabel('喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)'),
    ).toBe('喇叭 (Turtle Beach Stealth 700 G2)');
  });

  it('strips both when a label has the role prefix and the id suffix', () => {
    expect(
      shortenDeviceLabel(
        'Default - 喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)',
      ),
    ).toBe('喇叭 (Turtle Beach Stealth 700 G2)');
  });

  it('leaves a label with neither pattern unchanged', () => {
    expect(shortenDeviceLabel('CABLE Input (VB-Audio Virtual Cable)')).toBe(
      'CABLE Input (VB-Audio Virtual Cable)',
    );
  });

  it('returns an empty string for empty/missing labels', () => {
    expect(shortenDeviceLabel('')).toBe('');
    expect(shortenDeviceLabel(undefined)).toBe('');
    expect(shortenDeviceLabel(null)).toBe('');
  });
});

describe('stripDeviceRolePrefix', () => {
  it('strips the Windows device-role prefix', () => {
    expect(stripDeviceRolePrefix('Default - 喇叭 (Realtek(R) Audio)')).toBe(
      '喇叭 (Realtek(R) Audio)',
    );
    expect(
      stripDeviceRolePrefix(
        'Communications - 喇叭 (Turtle Beach Stealth 700 G2)',
      ),
    ).toBe('喇叭 (Turtle Beach Stealth 700 G2)');
  });

  it('keeps the trailing USB VID:PID suffix, unlike shortenDeviceLabel', () => {
    expect(
      stripDeviceRolePrefix(
        'Default - 喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)',
      ),
    ).toBe('喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)');
  });

  it('leaves a label with no role prefix unchanged', () => {
    expect(
      stripDeviceRolePrefix('喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)'),
    ).toBe('喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)');
  });

  it('returns an empty string for empty/missing labels', () => {
    expect(stripDeviceRolePrefix('')).toBe('');
    expect(stripDeviceRolePrefix(undefined)).toBe('');
    expect(stripDeviceRolePrefix(null)).toBe('');
  });
});

describe('deviceRoleBadgeLabel', () => {
  it('labels the default and communications role device ids', () => {
    expect(deviceRoleBadgeLabel('default')).toBe('預設');
    expect(deviceRoleBadgeLabel('communications')).toBe('通訊');
  });

  it('returns null for an ordinary device id', () => {
    expect(deviceRoleBadgeLabel('abc123')).toBeNull();
  });
});

describe('compareAudioDevices', () => {
  it('sorts labels within the same script alphabetically', () => {
    const devices = [
      { deviceId: 'd1', label: 'VG259QM (NVIDIA High Definition Audio)' },
      { deviceId: 'd2', label: 'BenQ EX2710Q (NVIDIA High Definition Audio)' },
    ];

    expect(devices.sort(compareAudioDevices).map((d) => d.deviceId)).toEqual([
      'd2',
      'd1',
    ]);
  });

  it('pins the default device first, ahead of alphabetically earlier labels', () => {
    const devices = [
      { deviceId: 'd1', label: 'BenQ EX2710Q (NVIDIA High Definition Audio)' },
      { deviceId: 'default', label: 'Default - 喇叭 (Realtek(R) Audio)' },
    ];

    expect(devices.sort(compareAudioDevices).map((d) => d.deviceId)).toEqual([
      'default',
      'd1',
    ]);
  });

  it('orders default before communications, both ahead of everything else', () => {
    const devices = [
      { deviceId: 'd1', label: 'Anything (Alphabetically First)' },
      {
        deviceId: 'communications',
        label: 'Communications - 喇叭 (Realtek(R) Audio)',
      },
      { deviceId: 'default', label: 'Default - 喇叭 (Realtek(R) Audio)' },
    ];

    expect(devices.sort(compareAudioDevices).map((d) => d.deviceId)).toEqual([
      'default',
      'communications',
      'd1',
    ]);
  });

  it('does not throw on a missing label (empty string sorts first)', () => {
    const devices = [
      { deviceId: 'd1', label: 'Anything' },
      { deviceId: 'd2', label: '' },
    ];

    expect(devices.sort(compareAudioDevices).map((d) => d.deviceId)).toEqual([
      'd2',
      'd1',
    ]);
  });
});

describe('groupDevicesByIdentity', () => {
  it('merges Default/Communications/literal entries for the same physical device into one row', () => {
    const devices = [
      {
        deviceId: 'default',
        label: 'Default - 喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)',
      },
      {
        deviceId: 'communications',
        label:
          'Communications - 喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)',
      },
      {
        deviceId: 'raw-turtle-beach',
        label: '喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)',
      },
    ];

    const groups = groupDevicesByIdentity(devices);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      label: '喇叭 (Turtle Beach Stealth 700 G2) (10f5:218c)',
      canonicalDeviceId: 'raw-turtle-beach',
      roleBadges: ['預設', '通訊'],
      sortDeviceId: 'default',
    });
    expect(groups[0].deviceIds).toEqual(
      expect.arrayContaining(['default', 'communications', 'raw-turtle-beach']),
    );
  });

  it('prefers the literal deviceId as canonical even when it is encountered last', () => {
    const devices = [
      { deviceId: 'default', label: 'Default - 喇叭 (X)' },
      { deviceId: 'raw-x', label: '喇叭 (X)' },
    ];

    const [group] = groupDevicesByIdentity(devices);

    expect(group.canonicalDeviceId).toBe('raw-x');
  });

  it('leaves an unrelated device as its own single-entry group with no badges', () => {
    const devices = [
      { deviceId: 'd1', label: 'BenQ EX2710Q (NVIDIA High Definition Audio)' },
    ];

    const [group] = groupDevicesByIdentity(devices);

    expect(group).toMatchObject({
      label: 'BenQ EX2710Q (NVIDIA High Definition Audio)',
      canonicalDeviceId: 'd1',
      roleBadges: [],
      sortDeviceId: 'd1',
    });
    expect(group.deviceIds).toEqual(['d1']);
  });

  it('keeps devices with different identities in separate groups', () => {
    const devices = [
      { deviceId: 'd1', label: 'BenQ EX2710Q (NVIDIA High Definition Audio)' },
      { deviceId: 'd2', label: 'VG259QM (NVIDIA High Definition Audio)' },
    ];

    expect(groupDevicesByIdentity(devices)).toHaveLength(2);
  });
});
