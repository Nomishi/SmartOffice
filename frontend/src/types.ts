// Kiểu dữ liệu theo Contract chung v1.2 (mục 5, 7, 8, 9)

export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type DeviceStatus =
  | 'REGISTERED' | 'PROVISIONED' | 'ACTIVE' | 'OFFLINE'
  | 'FAULT' | 'MAINTENANCE' | 'LOCKED' | 'DECOMMISSIONED';
export type Mode = 'AUTO' | 'MANUAL';
export type Quality = 'VALID' | 'SUSPECT' | 'INVALID';
export type CommandStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';
export type AlertType =
  | 'TEMP_HIGH' | 'AIR_BAD' | 'DOOR_LEFT_OPEN'
  | 'DEVICE_OFFLINE' | 'ENERGY_WASTE' | 'SENSOR_FAULT';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED';
export type CommandTarget = 'light1' | 'fan1' | 'buzzer1' | 'door1';
export type CommandAction = 'ON' | 'OFF' | 'OPEN' | 'CLOSE' | 'BEEP' | 'BEEP2' | 'BEEP_LONG' | 'ALARM';

export interface User {
  userId: number;
  username: string;
  role: Role;
  accountStatus: string;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface Device {
  deviceId: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  mode: Mode;
  roomId: string;
  online: boolean;
  fwVersion: string;
  lastSeenAt: string | null; // thiết bị mới đăng ký chưa có dữ liệu thì null
}

export interface Actuators {
  light1: 'ON' | 'OFF';
  fan1: 'ON' | 'OFF';
  buzzer1: 'ON' | 'OFF';
  door1: 'OPEN' | 'CLOSED';
}

// Node A: temperature, humidity, lux, presence, airRaw. Node B: công suất từ INA219.
export interface LatestTelemetry {
  receivedAt: string;
  quality: Quality;
  temperature?: number;
  humidity?: number;
  lux?: number;
  presence?: boolean;
  airRaw?: number;
  busVoltageV?: number;
  light1PowerW?: number;
  light1CurrentMa?: number;
  fan1PowerW?: number;
  fan1CurrentMa?: number;
}

// GET /api/devices/{id}/status
export interface DeviceStatusDetail extends Omit<Device, 'roomId'> {
  actuators: Actuators | null;
  latestTelemetry: LatestTelemetry | null;
}

export interface Command {
  commandId: string;
  deviceId?: string;
  target: CommandTarget;
  action: CommandAction;
  status: CommandStatus;
  issuedBy: string;
  issuedAt: string;
  ackAt?: string | null;
  latencyMs?: number | null;
}

export interface Alert {
  alertId: number;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  deviceId: string;
  roomId: string;
  value: number | null;
  threshold: number | null;
  createdAt: string;
  acknowledgedBy: number | null;
  acknowledgedAt: string | null;
  message?: string | null; // mô tả do backend sinh
  resolvedAt?: string | null; // alert tự đóng khi điều kiện hết
}

export type DeviceType = 'ENV' | 'CONTROL';
export interface RegisterDeviceInput {
  deviceId: string;
  name: string;
  type: DeviceType;
  roomId: string;
}

// PUT /api/devices/{id}/config (Contract 5.4 và 8.2)
export interface DeviceConfigInput {
  telemetryIntervalSec?: number;
  servoOpenDeg?: number;
  servoCloseDeg?: number;
}
export interface ConfigResult {
  configId: string;
  deviceId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  issuedBy: string;
  issuedAt: string;
}

// Rule (Contract 9.1)
export type RuleType = 'TEMP_HIGH' | 'AIR_BAD' | 'ABSENCE_OFF' | 'DOOR_OPEN_LIMIT' | 'ENERGY_WASTE';
export interface Rule {
  ruleId: number;
  name: string;
  type: RuleType;
  enabled: boolean;
  params: Record<string, number | string[]>;
  action: { alert?: boolean; severity?: Severity; command?: { target: CommandTarget; action: CommandAction } };
  updatedAt: string;
}
export interface RulePatch {
  name?: string;
  enabled?: boolean;
  params?: Record<string, number | string[]>;
  action?: Rule['action'];
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: Role;
}

// GET /api/audit-logs. Contract mục 9 chỉ nêu các trường logId, userId, action, target, result, timestamp;
// `username` là trường bổ sung mà mock trả thêm (nếu backend không có thì giao diện hiện user-<id>).
export interface AuditLog {
  logId: number;
  userId: number | null;
  username?: string | null;
  action: string;
  target: string | null;
  result: string | null; // backend ghi SUCCESS / FAILURE / PENDING ...
  timestamp: string;
}

// GET /api/devices/{id}/energy (Contract 8.2)
export type EnergyBucketSize = 'raw' | 'minute' | 'hour' | 'day';
export interface EnergyBucket {
  start: string;
  light1Wh: number;
  fan1Wh: number;
  light1AvgW: number;
  fan1AvgW: number;
}
export interface EnergyResponse {
  deviceId: string;
  from: string;
  to: string;
  unit: 'Wh';
  totalWh: number;
  buckets: EnergyBucket[];
}

// Sự kiện realtime đã chuẩn hoá ở frontend (realtime.ts đổi từ định dạng SSE của backend {type,data,timestamp} sang dạng này)
export type RealtimeEvent =
  | { type: 'telemetry'; deviceId: string; data: LatestTelemetry }
  | { type: 'status'; deviceId: string; online?: boolean; mode?: Mode; actuators?: Actuators }
  | { type: 'command'; command: Command }
  | { type: 'alert'; alert: Alert }
  | { type: 'config'; deviceId: string; configId: string; status: ConfigResult['status'] };

// AI API (contract v1.4, tùy chọn)
export interface AiChatResponse {
  answer: string;
  model: string;
  generatedAt: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  generatedAt?: string;
}

export interface AiChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}
