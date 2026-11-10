import { describe, expect, it } from 'vitest';
import { can } from './permissions';

// Bảng phân quyền theo Contract mục 10 (UI chỉ ẩn/khóa nút; backend mới là nơi kiểm tra thật)
describe('can', () => {
  it('Viewer chỉ được xem', () => {
    expect(can.control('VIEWER')).toBe(false);
    expect(can.ackAlert('VIEWER')).toBe(false);
    expect(can.editRules('VIEWER')).toBe(false);
    expect(can.configDevice('VIEWER')).toBe(false);
    expect(can.manageDevices('VIEWER')).toBe(false);
    expect(can.manageUsers('VIEWER')).toBe(false);
    expect(can.viewAudit('VIEWER')).toBe(false);
  });

  it('Operator điều khiển, xác nhận cảnh báo, sửa rule và cấu hình nhưng không quản lý thiết bị/user', () => {
    expect(can.control('OPERATOR')).toBe(true);
    expect(can.ackAlert('OPERATOR')).toBe(true);
    expect(can.editRules('OPERATOR')).toBe(true);
    expect(can.configDevice('OPERATOR')).toBe(true);
    expect(can.viewAudit('OPERATOR')).toBe(false);
    expect(can.manageDevices('OPERATOR')).toBe(false);
    expect(can.manageUsers('OPERATOR')).toBe(false);
  });

  it('Admin làm được mọi thứ', () => {
    for (const fn of Object.values(can)) expect(fn('ADMIN')).toBe(true);
  });

  it('chưa đăng nhập (undefined) không có quyền nào', () => {
    for (const fn of Object.values(can)) expect(fn(undefined)).toBe(false);
  });
});
