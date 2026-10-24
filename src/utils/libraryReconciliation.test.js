import { expect, it } from 'vitest';
import {
  displayMetadata,
  reconciliationReason,
  reconciliationItemLabel,
} from './libraryReconciliation.js';
it('formats unknown, cleared and precise dates without technical payloads', () => {
  expect(displayMetadata(null)).toBe('未提供');
  expect(displayMetadata('')).toBe('空白');
  expect(displayMetadata(5)).toBe('5');
  expect(displayMetadata({ value: '2026-07-25', precision: 'day' })).toBe(
    '2026-07-25',
  );
  expect(displayMetadata({ path: 'private' })).toBe('未提供');
});
it('maps product reasons and unknown issue types to bounded labels', () => {
  expect(reconciliationReason('different-source')).toContain('不同來源');
  expect(reconciliationReason('unknown')).toContain('比較');
  expect(reconciliationItemLabel('metadata')).toBe('曲目資訊');
  expect(reconciliationItemLabel('unknown')).toBe('待檢查');
});
