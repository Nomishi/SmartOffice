import { request } from './client';
import type {
  Alert, AlertStatus, AuditLog, Command, CommandAction, CommandTarget, ConfigResult, CreateUserInput, Device,
  DeviceConfigInput, DeviceStatusDetail, RegisterDeviceInput, Rule, RulePatch, EnergyBucketSize, EnergyResponse, LatestTelemetry, LoginResponse, Mode, Page, User,
} from '../types';

// Mỗi hàm tương ứng một endpoint trong Contract mục 8.

export const login = (username: string, password: string) =>
  request<LoginResponse>('POST', '/api/auth/login', { body: { username, password } });

export const getDevices = () => request<Page<Device>>('GET', '/api/devices');

export const getDeviceStatus = (id: string) =>
  request<DeviceStatusDetail>('GET', `/api/devices/${id}/status`);

// Gửi lệnh là bất đồng bộ: trả 202 + PENDING, kết quả (SUCCESS/FAILED/TIMEOUT) lấy qua GET commands hoặc realtime.
// Không dùng ?wait=true (nhất là với door1).
export const sendCommand = (id: string, target: CommandTarget, action: CommandAction) =>
  request<Command>('POST', `/api/devices/${id}/commands`, {
    body: { target, action },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });

export const getCommands = (id: string, page = 0, size = 10) =>
  request<Page<Command>>('GET', `/api/devices/${id}/commands`, { query: { page, size } });

export const setMode = (id: string, mode: Mode) =>
  request<{ deviceId: string; mode: Mode; updatedAt: string }>('POST', `/api/devices/${id}/mode`, { body: { mode } });

export const getAlerts = (p: { status?: AlertStatus; page?: number; size?: number }) =>
  request<Page<Alert>>('GET', '/api/alerts', { query: { status: p.status, page: p.page ?? 0, size: p.size ?? 20 } });

export const ackAlert = (id: number) =>
  request<{ alertId: number; status: AlertStatus; acknowledgedBy: number; acknowledgedAt: string }>(
    'PATCH', `/api/alerts/${id}/acknowledge`);

export const getUsers = (page = 0, size = 20) =>
  request<Page<User>>('GET', '/api/users', { query: { page, size } });

// Lịch sử telemetry: from/to bắt buộc, tối đa 7 ngày/lần, có phân trang (size tối đa 100)
export const getTelemetry = (
  id: string,
  p: { from: string; to: string; page?: number; size?: number; sort?: string },
) =>
  request<Page<LatestTelemetry>>('GET', `/api/devices/${id}/telemetry`, {
    query: { from: p.from, to: p.to, page: p.page ?? 0, size: p.size ?? 20, sort: p.sort },
  });

// Công suất/điện năng (Wh) theo bucket, tối đa 1000 bucket/lần
export const getEnergy = (id: string, p: { from: string; to: string; bucket?: EnergyBucketSize }) =>
  request<EnergyResponse>('GET', `/api/devices/${id}/energy`, {
    query: { from: p.from, to: p.to, bucket: p.bucket ?? 'hour' },
  });

// ---- Quản lý thiết bị (Admin) ----
// Contract chưa mô tả body/response của các endpoint này; đang giả định body POST /devices là
// RegisterDeviceInput và các thao tác vòng đời trả về Device đã cập nhật.
export const createDevice = (body: RegisterDeviceInput) => request<Device>('POST', '/api/devices', { body });
export const activateDevice = (id: string) => request<Device>('POST', `/api/devices/${id}/activate`);
export const lockDevice = (id: string) => request<Device>('POST', `/api/devices/${id}/lock`);
export const decommissionDevice = (id: string) => request<Device>('POST', `/api/devices/${id}/decommission`);

// Cấu hình tham số thiết bị (Admin/Operator). Kết quả ACK (SUCCESS/FAILED/TIMEOUT) đến qua realtime.
export const updateDeviceConfig = (id: string, body: DeviceConfigInput) =>
  request<ConfigResult>('PUT', `/api/devices/${id}/config`, { body });

// ---- Rule/ngưỡng ----
export const getRules = (page = 0, size = 20) => request<Page<Rule>>('GET', '/api/rules', { query: { page, size } });
export const updateRule = (id: number, body: RulePatch) => request<Rule>('PUT', `/api/rules/${id}`, { body });

// ---- User ----
export const createUser = (body: CreateUserInput) => request<User>('POST', '/api/users', { body });
// Backend (ChangePasswordRequest) đặt tên trường là oldPassword
export const changePassword = (oldPassword: string, newPassword: string) =>
  request<void>('PUT', '/api/users/me/password', { body: { oldPassword, newPassword } });

// ---- Nhật ký thao tác (Admin xem tất cả; Operator giới hạn) ----
export const getAuditLogs = (page = 0, size = 20) =>
  request<Page<AuditLog>>('GET', '/api/audit-logs', { query: { page, size } });
