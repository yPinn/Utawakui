import { expect, it } from 'vitest';
import { planVideoReference } from './trackVideoFormats.js';

it('takes only bounded direct audio formats from the selected video', () => {
  const audio = {
    format_id: '251',
    ext: 'webm',
    vcodec: 'none',
    acodec: 'opus',
    protocol: 'https',
    filesize: 4_000_000,
    abr: 125,
  };
  expect(
    planVideoReference([
      { ...audio, format_id: 'muxed', vcodec: 'avc1', abr: 300 },
      { ...audio, format_id: 'large', filesize: 30_000_000, abr: 300 },
      { ...audio, format_id: 'playlist', protocol: 'm3u8_native', abr: 300 },
      { ...audio, format_id: 'foo+bar', abr: 300 },
      audio,
    ]),
  ).toEqual({ id: '251', ext: 'webm' });
  expect(planVideoReference([{ ...audio, acodec: 'none' }])).toBeNull();
});
