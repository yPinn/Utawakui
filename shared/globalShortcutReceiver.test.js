import { expect, it } from 'vitest';
import {
  parseReceiverIntent,
  parseReceiverOffer,
  parseGlobalShortcutEnvelope,
  ownsGlobalShortcut,
} from './globalShortcutReceiver.mjs';
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const offer = () => ({
  version: 1,
  receiverId: id,
  offerId: id,
  bootId: id,
  generation: 2,
  active: [
    {
      command: 'player.next',
      chord: { key: 'k', ctrl: true, alt: false, shift: true },
    },
  ],
  role: 'background',
});
it('accepts only fixed bounded intents without command/channel payloads', () => {
  expect(
    parseReceiverIntent('confirm', {
      receiverId: id,
      offerId: id,
      contextRevision: 1,
    }).contextRevision,
  ).toBe(1);
  for (const value of [
    { receiverId: id, command: 'player.next' },
    { receiverId: id, offerId: id, sequence: NaN },
    { receiverId: id, offerId: id, sequence: 0 },
    { receiverId: id, offerId: id, sequence: 1, channel: 'arbitrary' },
  ])
    expect(() => parseReceiverIntent('admit', value)).toThrow();
});
it('validates known immutable active projections, source identity and envelope fields', () => {
  const value = offer();
  expect(Object.isFrozen(parseReceiverOffer(value).active[0].chord)).toBe(true);
  for (const input of [
    {
      ...value,
      active: [{ command: 'arbitrary', chord: value.active[0].chord }],
    },
    { ...value, active: Array(11).fill(value.active[0]) },
    { ...value, generation: -1 },
    { ...value, role: 'performer' },
  ])
    expect(() => parseReceiverOffer(input)).toThrow();
  const packet = {
    version: 1,
    receiverId: id,
    offerId: id,
    bootId: id,
    generation: 2,
    sequence: 1,
    contextRevision: 1,
    command: 'player.next',
  };
  expect(parseGlobalShortcutEnvelope(packet).command).toBe('player.next');
  expect(() =>
    parseGlobalShortcutEnvelope({ ...packet, path: 'private' }),
  ).toThrow();
});
it('retains exact native chord ownership for repeat and handled/IME events but never widens modifiers', () => {
  const active = offer().active;
  expect(
    ownsGlobalShortcut(
      {
        key: 'K',
        ctrlKey: true,
        shiftKey: true,
        repeat: true,
        isComposing: true,
        defaultPrevented: true,
      },
      active,
    ),
  ).toBe(true);
  expect(
    ownsGlobalShortcut(
      { key: 'K', ctrlKey: true, shiftKey: true, altKey: true },
      active,
    ),
  ).toBe(false);
  expect(
    ownsGlobalShortcut(
      { key: 'K', ctrlKey: true, shiftKey: true, metaKey: true },
      active,
    ),
  ).toBe(false);
});
