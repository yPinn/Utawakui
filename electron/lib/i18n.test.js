import { describe, it, expect } from 'vitest';
import { t } from './i18n.js';

describe('main i18n', () => {
  it('translates shared catalog keys with the launch locale', () => {
    expect(t('shell.thumbar.play')).toBe('播放');
    expect(t('destination.library')).toBe('曲庫');
  });
});
