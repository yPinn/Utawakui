import { describe, expect, it, vi } from 'vitest';
import { createPairingApprovals } from './pairingApproval.js';

function setup() {
  let time = 1000;
  let id = 0;
  const approvals = createPairingApprovals({
    now: () => time,
    randomInt: () => 4321,
    createId: () => `req-${++id}`,
  });
  return { approvals, advance: (ms) => (time += ms) };
}

describe('companion pairing approvals', () => {
  it('issues the credential only after the computer approves', () => {
    const { approvals } = setup();
    const opened = approvals.open('Pixel');
    expect(opened).toMatchObject({ matchCode: '4321', expiresAt: 61000 });
    expect(opened.claimToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(approvals.status()).toEqual({
      id: 'req-1',
      label: 'Pixel',
      matchCode: '4321',
      expiresAt: 61000,
    });
    expect(approvals.poll(opened.claimToken)).toEqual({ state: 'pending' });

    const issue = vi.fn(() => 'credential-1');
    expect(approvals.approve('req-1', issue)).toBe(true);
    expect(issue).toHaveBeenCalledWith('Pixel');
    expect(approvals.status()).toBeNull();
    expect(approvals.poll(opened.claimToken)).toEqual({
      state: 'approved',
      credential: 'credential-1',
    });
    expect(approvals.poll(opened.claimToken)).toEqual({ state: 'unknown' });
  });

  it('reports a denial once and frees the slot', () => {
    const { approvals } = setup();
    const opened = approvals.open('Unknown phone');
    expect(approvals.open('Second')).toBeNull();
    expect(approvals.deny('req-1')).toBe(true);
    expect(approvals.approve('req-1', vi.fn())).toBe(false);
    expect(approvals.poll(opened.claimToken)).toEqual({ state: 'denied' });
    expect(approvals.open('Second')).not.toBeNull();
  });

  it('expires an unanswered request after 60 seconds', () => {
    const { approvals, advance } = setup();
    const opened = approvals.open('Pixel');
    advance(60000);
    expect(approvals.status()).toBeNull();
    expect(approvals.approve('req-1', vi.fn())).toBe(false);
    expect(approvals.poll(opened.claimToken)).toEqual({ state: 'unknown' });
    expect(approvals.open('Again')).not.toBeNull();
  });

  it('tells an expired requester before clearing the request', () => {
    const { approvals, advance } = setup();
    const opened = approvals.open('Pixel');
    advance(60000);
    expect(approvals.poll(opened.claimToken)).toEqual({ state: 'expired' });
  });

  it('ignores wrong ids, wrong tokens and cancelled requests', () => {
    const { approvals } = setup();
    const opened = approvals.open('Pixel');
    expect(approvals.approve('other', vi.fn())).toBe(false);
    expect(approvals.deny('other')).toBe(false);
    expect(approvals.poll('x'.repeat(43))).toEqual({ state: 'unknown' });
    expect(approvals.poll('short')).toEqual({ state: 'unknown' });
    approvals.cancel();
    expect(approvals.poll(opened.claimToken)).toEqual({ state: 'unknown' });
  });

  it('keeps the request pending when issuing the credential fails', () => {
    const { approvals } = setup();
    approvals.open('Pixel');
    expect(() =>
      approvals.approve('req-1', () => {
        throw new Error('full');
      }),
    ).toThrow('full');
    expect(approvals.status()).toMatchObject({ id: 'req-1' });
    expect(approvals.deny('req-1')).toBe(true);
  });
});
