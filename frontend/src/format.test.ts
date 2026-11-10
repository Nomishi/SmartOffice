import { describe, expect, it } from 'vitest';
import type { Dayjs } from 'dayjs';
import { ALERT_LABEL, AUDIT_ACTION_LABEL, RULE_FIELDS, RULE_LABEL, show, toIso } from './format';

describe('show (quy ước quality, Contract 5.5)', () => {
  it('INVALID không hiển thị như giá trị hiện tại', () => {
    expect(show('INVALID', 28.5)).toBe('—');
  });
  it('thiếu giá trị thì hiện dấu —', () => {
    expect(show('VALID', undefined)).toBe('—');
  });
  it('VALID và SUSPECT vẫn hiện giá trị', () => {
    expect(show('VALID', 28.5)).toBe(28.5);
    expect(show('SUSPECT', 0)).toBe(0);
  });
});

describe('toIso', () => {
  it('bỏ phần mili giây, giữ hậu tố Z (định dạng Contract)', () => {
    const d = { toISOString: () => '2026-10-24T15:30:00.123Z' } as unknown as Dayjs;
    expect(toIso(d)).toBe('2026-10-24T15:30:00Z');
  });
});

describe('bảng nhãn và tham số rule', () => {
  it('có nhãn cho đủ 6 loại cảnh báo và 5 loại rule', () => {
    expect(Object.keys(ALERT_LABEL)).toHaveLength(6);
    expect(Object.keys(RULE_LABEL)).toHaveLength(5);
    expect(Object.keys(RULE_FIELDS).sort()).toEqual(Object.keys(RULE_LABEL).sort());
  });

  it('dải giá trị đúng Contract 9.1', () => {
    const temp = RULE_FIELDS.TEMP_HIGH;
    expect(temp.find((f) => f.key === 'thresholdC')).toMatchObject({ min: 0, max: 60 });
    expect(temp.find((f) => f.key === 'consecutiveSamples')).toMatchObject({ min: 1, max: 20, int: true });
    expect(RULE_FIELDS.ABSENCE_OFF[0]).toMatchObject({ key: 'absenceMinutes', min: 1, max: 120 });
    expect(RULE_FIELDS.ENERGY_WASTE.find((f) => f.key === 'powerThresholdW')).toMatchObject({ min: 0, max: 100 });
    expect(RULE_FIELDS.AIR_BAD.find((f) => f.key === 'warmupSec')).toMatchObject({ min: 0, max: 600 });
  });

  it('mọi hành động ghi nhật ký của mock đều có nhãn tiếng Việt', () => {
    expect(Object.keys(AUDIT_ACTION_LABEL)).toHaveLength(15);
    expect(AUDIT_ACTION_LABEL.LOCK_DEVICE).toBe('Khóa thiết bị');
  });
});
