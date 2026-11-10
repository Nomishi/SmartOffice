import type { DeviceStatus } from './types';

// Trạng thái nào được bấm nút nào. Contract chỉ mô tả lifecycle ở mục 7 nên đây là giả định,
// cần M3 xác nhận (đặc biệt MAINTENANCE -> kích hoạt lại và khóa từ OFFLINE/FAULT/MAINTENANCE).
export const CAN_ACTIVATE: DeviceStatus[] = ['REGISTERED', 'PROVISIONED', 'MAINTENANCE'];
export const CAN_LOCK: DeviceStatus[] = ['ACTIVE', 'OFFLINE', 'FAULT', 'MAINTENANCE'];
export const CAN_DECOMMISSION: DeviceStatus[] = ['LOCKED'];
