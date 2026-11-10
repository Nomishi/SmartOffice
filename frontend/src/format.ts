import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { AlertType, CommandStatus, DeviceStatus, Quality, RuleType, Severity } from './types';

export const fmtTime = (iso?: string | null) => (iso ? dayjs(iso).format('HH:mm:ss DD/MM/YYYY') : '—');
export const fmtClock = (iso?: string | null) => (iso ? dayjs(iso).format('HH:mm:ss') : '—');

export const ALERT_LABEL: Record<AlertType, string> = {
  TEMP_HIGH: 'Nhiệt độ cao',
  AIR_BAD: 'Chất lượng không khí kém',
  DOOR_LEFT_OPEN: 'Cửa mở quá lâu',
  DEVICE_OFFLINE: 'Thiết bị offline',
  ENERGY_WASTE: 'Lãng phí điện',
  SENSOR_FAULT: 'Lỗi cảm biến',
};

export const SEVERITY_COLOR: Record<Severity, string> = { LOW: 'blue', MEDIUM: 'orange', HIGH: 'red' };
export const QUALITY_COLOR: Record<Quality, string> = { VALID: 'green', SUSPECT: 'orange', INVALID: 'red' };
export const COMMAND_COLOR: Record<CommandStatus, string> = {
  PENDING: 'processing', SUCCESS: 'green', FAILED: 'red', TIMEOUT: 'orange',
};

// Quy ước quality (Contract 5.5): INVALID không hiển thị như giá trị hiện tại
export function show(quality: Quality | undefined, value: number | undefined): string | number {
  if (value === undefined || quality === 'INVALID') return '—';
  return value;
}

// ISO-8601 UTC không có phần mili giây, đúng định dạng Contract (2026-10-24T15:30:00Z)
export const toIso = (d: Dayjs) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export const DEVICE_STATUS_COLOR: Record<DeviceStatus, string> = {
  REGISTERED: 'default', PROVISIONED: 'blue', ACTIVE: 'green', OFFLINE: 'default',
  FAULT: 'red', MAINTENANCE: 'orange', LOCKED: 'volcano', DECOMMISSIONED: 'default',
};

export const RULE_LABEL: Record<RuleType, string> = {
  TEMP_HIGH: 'Nhiệt độ cao',
  AIR_BAD: 'Chất lượng không khí kém',
  ABSENCE_OFF: 'Tự tắt khi phòng trống',
  DOOR_OPEN_LIMIT: 'Cửa mở quá lâu',
  ENERGY_WASTE: 'Lãng phí điện',
};

// Tham số chỉnh được của từng loại rule, dải giá trị theo Contract 9.1
export interface ParamField { key: string; label: string; min: number; max: number; int?: boolean }
export const RULE_FIELDS: Record<RuleType, ParamField[]> = {
  TEMP_HIGH: [
    { key: 'thresholdC', label: 'Ngưỡng nhiệt độ (°C)', min: 0, max: 60 },
    { key: 'consecutiveSamples', label: 'Số lần đo liên tiếp', min: 1, max: 20, int: true },
  ],
  AIR_BAD: [
    { key: 'thresholdRaw', label: 'Ngưỡng airRaw', min: 0, max: 4095 },
    { key: 'consecutiveSamples', label: 'Số lần đo liên tiếp', min: 1, max: 20, int: true },
    { key: 'warmupSec', label: 'Thời gian làm nóng MQ-135 (giây)', min: 0, max: 600, int: true },
  ],
  ABSENCE_OFF: [{ key: 'absenceMinutes', label: 'Số phút vắng mặt', min: 1, max: 120, int: true }],
  DOOR_OPEN_LIMIT: [{ key: 'openMinutes', label: 'Số phút cửa mở tối đa', min: 1, max: 120, int: true }],
  ENERGY_WASTE: [
    { key: 'absenceMinutes', label: 'Số phút vắng mặt', min: 1, max: 120, int: true },
    { key: 'powerThresholdW', label: 'Ngưỡng công suất (W)', min: 0, max: 100 },
  ],
};

// Nhãn tiếng Việt cho cột hành động trong nhật ký; hành động lạ từ backend vẫn hiện nguyên văn.
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Đăng nhập',
  SEND_COMMAND: 'Gửi lệnh điều khiển',
  SET_MODE: 'Đổi chế độ AUTO/MANUAL',
  ACK_ALERT: 'Xác nhận cảnh báo',
  REGISTER_DEVICE: 'Đăng ký thiết bị',
  ACTIVATE_DEVICE: 'Kích hoạt thiết bị',
  LOCK_DEVICE: 'Khóa thiết bị',
  DECOMMISSION_DEVICE: 'Decommission thiết bị',
  UPDATE_CONFIG: 'Cấu hình thiết bị',
  UPDATE_RULE: 'Sửa rule',
  CREATE_USER: 'Tạo người dùng',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  // Các action backend (M3) đang ghi
  COMMAND_SENT: 'Gửi lệnh điều khiển',
  COMMAND_TIMEOUT: 'Lệnh hết thời gian chờ',
  CONFIG_SENT: 'Gửi cấu hình thiết bị',
};
