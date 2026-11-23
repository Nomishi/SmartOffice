import type { DeviceStatus } from './types';

// Trạng thái nào được bấm nút nào. Khớp với bảng ALLOWED_FROM trong backend DeviceService
// (Contract mục 7); backend trả 409 INVALID_TRANSITION nếu chuyển sai luồng.
// OFFLINE / FAULT do hệ thống tự đặt, không có nút.
export const CAN_ACTIVATE: DeviceStatus[] = ['REGISTERED', 'PROVISIONED', 'MAINTENANCE', 'LOCKED']; // LOCKED = mở khóa
export const CAN_MAINTENANCE: DeviceStatus[] = ['ACTIVE', 'OFFLINE', 'FAULT'];
export const CAN_LOCK: DeviceStatus[] = ['ACTIVE', 'OFFLINE', 'FAULT', 'MAINTENANCE'];
// Không hoàn tác. Thiết bị đang dùng phải khóa trước; thiết bị đăng ký nhưng chưa dùng thì bỏ được ngay.
export const CAN_DECOMMISSION: DeviceStatus[] = ['LOCKED', 'REGISTERED', 'PROVISIONED'];

// Nhãn nút "kích hoạt" theo trạng thái hiện tại.
export const activateLabel = (s: DeviceStatus) =>
  s === 'LOCKED' ? 'Mở khóa' : s === 'MAINTENANCE' ? 'Xong bảo trì' : 'Kích hoạt';
