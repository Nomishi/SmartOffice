import type { Role } from '../types';

// Bảng phân quyền theo Contract mục 10. UI chỉ để ẩn/khóa nút cho tiện,
// backend (M3) vẫn là nơi kiểm tra quyền thật.
export const can = {
  control: (r?: Role) => r === 'ADMIN' || r === 'OPERATOR',
  ackAlert: (r?: Role) => r === 'ADMIN' || r === 'OPERATOR',
  editRules: (r?: Role) => r === 'ADMIN' || r === 'OPERATOR',
  manageDevices: (r?: Role) => r === 'ADMIN', // đăng ký, kích hoạt, khóa, decommission
  configDevice: (r?: Role) => r === 'ADMIN' || r === 'OPERATOR',
  manageUsers: (r?: Role) => r === 'ADMIN',
  viewAudit: (r?: Role) => r === 'ADMIN', // backend: GET /api/audit-logs chỉ dành cho ADMIN (Operator nhận 403)
};
