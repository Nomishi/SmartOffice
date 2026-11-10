// Backend GIẢ chạy ngay trong trình duyệt, bám Contract v1.2 để M4 làm UI khi M3 chưa xong.
// Chỉ được nạp khi VITE_USE_MOCK=true (import động). Khi có backend thật, đặt VITE_USE_MOCK=false.
import type {
  Actuators, Alert, AuditLog, Command, CommandAction, CommandTarget, ConfigResult, Device, DeviceStatus, DeviceType,
  EnergyBucketSize, LatestTelemetry, Mode, RealtimeEvent, Role, Rule, RuleType,
} from '../types';

export interface MockRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}
export interface MockResponse {
  status: number;
  body: unknown;
  retryAfter?: number; // giây, dùng cho 429
}

const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---------- Sự kiện realtime giả ----------
type Listener = (e: RealtimeEvent) => void;
const listeners = new Set<Listener>();
export function subscribeMock(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function emit(e: RealtimeEvent) {
  listeners.forEach((l) => l(e));
}

// ---------- Dữ liệu ----------
interface MockUser {
  userId: number;
  username: string;
  password: string;
  role: Role;
  accountStatus: string;
  createdAt: string;
}
const users: MockUser[] = [
  { userId: 1, username: 'admin', password: 'admin123', role: 'ADMIN', accountStatus: 'ACTIVE', createdAt: '2026-10-20T08:00:00Z' },
  { userId: 2, username: 'operator1', password: 'operator123', role: 'OPERATOR', accountStatus: 'ACTIVE', createdAt: '2026-10-20T08:05:00Z' },
  { userId: 3, username: 'viewer1', password: 'viewer123', role: 'VIEWER', accountStatus: 'ACTIVE', createdAt: '2026-10-20T08:10:00Z' },
];

interface DeviceState extends Device {
  actuators: Actuators | null;
  latest: LatestTelemetry;
}
const devices: Record<string, DeviceState> = {
  'office-env-01': {
    deviceId: 'office-env-01', name: 'Node A - môi trường', type: 'ENV', status: 'ACTIVE', mode: 'AUTO',
    roomId: 'room-01', online: true, fwVersion: '1.0.0', lastSeenAt: now(), actuators: null,
    latest: { receivedAt: now(), temperature: 28.5, humidity: 72, lux: 320.5, presence: true, airRaw: 1450, quality: 'VALID' },
  },
  'office-ctrl-01': {
    deviceId: 'office-ctrl-01', name: 'Node B - điều khiển', type: 'CONTROL', status: 'ACTIVE', mode: 'AUTO',
    roomId: 'room-01', online: true, fwVersion: '1.0.0', lastSeenAt: now(),
    actuators: { light1: 'OFF', fan1: 'OFF', buzzer1: 'OFF', door1: 'CLOSED' },
    latest: { receivedAt: now(), busVoltageV: 12.1, light1PowerW: 0, light1CurrentMa: 0, fan1PowerW: 0, fan1CurrentMa: 0, quality: 'VALID' },
  },
};

// 5 rule mặc định theo Contract 9.1
const rules: Rule[] = [
  { ruleId: 1, name: 'Nhiệt độ cao', type: 'TEMP_HIGH', enabled: true, params: { thresholdC: 30, consecutiveSamples: 3 }, action: { alert: true, severity: 'MEDIUM' }, updatedAt: '2026-10-24T15:30:00Z' },
  { ruleId: 2, name: 'Chất lượng không khí kém', type: 'AIR_BAD', enabled: true, params: { thresholdRaw: 2000, consecutiveSamples: 3, warmupSec: 180 }, action: { alert: true, severity: 'MEDIUM' }, updatedAt: '2026-10-24T15:30:00Z' },
  { ruleId: 3, name: 'Tự tắt khi phòng trống', type: 'ABSENCE_OFF', enabled: true, params: { absenceMinutes: 10, targets: ['light1', 'fan1'] }, action: { command: { target: 'light1', action: 'OFF' } }, updatedAt: '2026-10-24T15:30:00Z' },
  { ruleId: 4, name: 'Cửa mở quá lâu', type: 'DOOR_OPEN_LIMIT', enabled: true, params: { openMinutes: 5 }, action: { alert: true, severity: 'LOW' }, updatedAt: '2026-10-24T15:30:00Z' },
  { ruleId: 5, name: 'Cảnh báo lãng phí điện', type: 'ENERGY_WASTE', enabled: true, params: { absenceMinutes: 10, powerThresholdW: 2 }, action: { alert: true, severity: 'MEDIUM' }, updatedAt: '2026-10-24T15:30:00Z' },
];

let cfgSeq = 0;
const pendingConfig = new Set<string>();

// Các trạng thái được phép chuyển (UI chỉ hiện nút hợp lệ; đây là giả định, cần M3 xác nhận)
const CAN_ACTIVATE: DeviceStatus[] = ['REGISTERED', 'PROVISIONED', 'MAINTENANCE'];
const CAN_LOCK: DeviceStatus[] = ['ACTIVE', 'OFFLINE', 'FAULT', 'MAINTENANCE'];

const commands: Command[] = [];
let cmdSeq = 0;
const idem = new Map<string, { body: string; res: MockResponse }>();

const alerts: Alert[] = [
  {
    alertId: 1, type: 'TEMP_HIGH', severity: 'MEDIUM', status: 'OPEN', deviceId: 'office-env-01', roomId: 'room-01',
    value: 31.2, threshold: 30, createdAt: '2026-10-24T15:30:00Z', acknowledgedBy: null, acknowledgedAt: null,
  },
  {
    alertId: 2, type: 'DEVICE_OFFLINE', severity: 'HIGH', status: 'ACKNOWLEDGED', deviceId: 'office-ctrl-01', roomId: 'room-01',
    value: null, threshold: null, createdAt: '2026-10-23T09:10:00Z', acknowledgedBy: 2, acknowledgedAt: '2026-10-23T09:15:00Z',
  },
];
let alertSeq = 2;

// ---------- Tiện ích ----------
function fail(status: number, code: string, message: string, details: unknown = null): MockResponse {
  return { status, body: { error: { code, message, details, timestamp: now() } } };
}

function header(h: Record<string, string>, name: string): string | undefined {
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? h[k] : undefined;
}

function authUser(h: Record<string, string>): MockUser | null {
  const m = /^Bearer mock-(\d+)$/.exec(header(h, 'Authorization') ?? '');
  if (!m) return null;
  return users.find((u) => u.userId === Number(m[1])) ?? null;
}

function publicUser(u: MockUser) {
  return { userId: u.userId, username: u.username, role: u.role, accountStatus: u.accountStatus, createdAt: u.createdAt };
}

function paginate<T>(items: T[], q: Record<string, string>) {
  const page = Math.max(0, Number(q.page ?? 0) || 0);
  const size = clamp(Number(q.size ?? 20) || 20, 1, 100);
  return {
    items: items.slice(page * size, page * size + size),
    page,
    size,
    total: items.length,
    totalPages: Math.ceil(items.length / size),
  };
}

function asObject(b: unknown): Record<string, unknown> {
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

function toDevice(d: DeviceState): Device {
  return {
    deviceId: d.deviceId, name: d.name, type: d.type, status: d.status, mode: d.mode,
    roomId: d.roomId, online: d.online, fwVersion: d.fwVersion, lastSeenAt: d.lastSeenAt,
  };
}

function toStatus(d: DeviceState) {
  return {
    deviceId: d.deviceId, name: d.name, type: d.type, status: d.status, mode: d.mode,
    online: d.online, lastSeenAt: d.lastSeenAt, fwVersion: d.fwVersion,
    actuators: d.actuators, latestTelemetry: d.latest,
  };
}

// Công suất giả lập theo trạng thái tải (INA219)
function applyPower(d: DeviceState) {
  if (!d.actuators) return;
  const l = d.actuators.light1 === 'ON';
  const f = d.actuators.fan1 === 'ON';
  d.latest = {
    ...d.latest,
    light1PowerW: l ? round1(4.8 + Math.random() * 0.2) : 0,
    light1CurrentMa: l ? 397 : 0,
    fan1PowerW: f ? round1(2.1 + Math.random() * 0.2) : 0,
    fan1CurrentMa: f ? 173 : 0,
  };
}

function finishCommand(cmd: Command, d: DeviceState, startedAt: number) {
  if (!d.actuators) return;
  const state = cmd.target === 'door1' ? (cmd.action === 'OPEN' ? 'OPEN' : 'CLOSED') : cmd.action;
  (d.actuators as unknown as Record<string, string>)[cmd.target] = state;
  applyPower(d);
  cmd.status = 'SUCCESS';
  cmd.ackAt = now();
  cmd.latencyMs = Date.now() - startedAt;
  emit({ type: 'command', command: { ...cmd } });
  emit({ type: 'status', deviceId: d.deviceId, online: d.online, mode: d.mode, actuators: { ...d.actuators } });
  emit({ type: 'telemetry', deviceId: d.deviceId, data: { ...d.latest } });
}

// ---------- Lịch sử giả (tính theo thời gian nên lần gọi nào cũng ra cùng kết quả) ----------
const SAMPLE_MS = 5000;
const DAY_MS = 86400000;
const round2 = (n: number) => Math.round(n * 100) / 100;

function envSample(ts: number): LatestTelemetry {
  const h = ts / 3600000;
  return {
    receivedAt: new Date(ts).toISOString(),
    temperature: round1(28.5 + 2.2 * Math.sin(h / 3) + 0.3 * Math.sin(ts / 90000)),
    humidity: round1(70 + 5 * Math.sin(h / 4 + 1) + 0.8 * Math.sin(ts / 70000)),
    lux: round1(Math.max(0, 300 + 180 * Math.sin(h / 2) + 10 * Math.sin(ts / 50000))),
    presence: Math.sin(h / 1.5) > -0.3,
    airRaw: Math.round(1450 + 150 * Math.sin(h / 5) + 20 * Math.sin(ts / 40000)),
    quality: Math.floor(ts / SAMPLE_MS) % 37 === 0 ? 'SUSPECT' : 'VALID',
  };
}
const lightOn = (ts: number) => Math.sin(ts / 3600000 / 2) > -0.2;
const fanOn = (ts: number) => (envSample(ts).temperature ?? 0) > 29.2;

function ctrlSample(ts: number): LatestTelemetry {
  const l = lightOn(ts);
  const f = fanOn(ts);
  return {
    receivedAt: new Date(ts).toISOString(),
    busVoltageV: 12.1,
    light1PowerW: l ? 4.8 : 0,
    light1CurrentMa: l ? 397 : 0,
    fan1PowerW: f ? 2.1 : 0,
    fan1CurrentMa: f ? 173 : 0,
    quality: 'VALID',
  };
}

function parseRange(q: Record<string, string>): { from: number; to: number } | null {
  const from = Date.parse(q.from ?? '');
  const to = Date.parse(q.to ?? '');
  if (!q.from || !q.to || Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
  return { from, to };
}

type Detail = { field: string; message: string };
function inRange(p: Record<string, unknown>, key: string, lo: number, hi: number, int: boolean, prefix: string, errs: Detail[]) {
  const v = p[key];
  if (typeof v !== 'number' || Number.isNaN(v) || v < lo || v > hi || (int && !Number.isInteger(v))) {
    errs.push({ field: `${prefix}${key}`, message: `phải là ${int ? 'số nguyên' : 'số'} trong khoảng ${lo}–${hi}` });
  }
}
function validateRuleParams(type: RuleType, p: Record<string, unknown>): Detail[] {
  const errs: Detail[] = [];
  const r = (k: string, lo: number, hi: number, int = false) => inRange(p, k, lo, hi, int, 'params.', errs);
  if (type === 'TEMP_HIGH') { r('thresholdC', 0, 60); r('consecutiveSamples', 1, 20, true); }
  if (type === 'AIR_BAD') { r('thresholdRaw', 0, 4095); r('consecutiveSamples', 1, 20, true); r('warmupSec', 0, 600, true); }
  if (type === 'ABSENCE_OFF') {
    r('absenceMinutes', 1, 120, true);
    if (!Array.isArray(p.targets) || p.targets.length === 0) errs.push({ field: 'params.targets', message: 'chọn ít nhất một tải' });
  }
  if (type === 'DOOR_OPEN_LIMIT') r('openMinutes', 1, 120, true);
  if (type === 'ENERGY_WASTE') { r('absenceMinutes', 1, 120, true); r('powerThresholdW', 0, 100); }
  return errs;
}

// ---------- Giới hạn đăng nhập ----------
const LOGIN_WINDOW_MS = 60000;
const LOGIN_MAX_FAILS = 5;
const failedLogins = new Map<string, number[]>();

// ---------- Nhật ký thao tác ----------
const auditLogs: AuditLog[] = [
  { logId: 1, userId: 1, username: 'admin', action: 'REGISTER_DEVICE', target: 'office-env-01', result: 'SUCCESS', timestamp: '2026-10-20T08:30:00Z' },
  { logId: 2, userId: 1, username: 'admin', action: 'ACTIVATE_DEVICE', target: 'office-env-01', result: 'SUCCESS', timestamp: '2026-10-20T08:31:00Z' },
  { logId: 3, userId: 2, username: 'operator1', action: 'UPDATE_RULE', target: 'TEMP_HIGH', result: 'SUCCESS', timestamp: '2026-10-24T15:30:00Z' },
];
let auditSeq = 3;

// Mọi thao tác ghi (POST/PUT/PATCH) đều được ghi nhật ký ở một chỗ duy nhất (kể cả khi bị từ chối)
function describeAction(req: MockRequest): { action: string; target: string | null } | null {
  const { method, path } = req;
  if (method === 'GET') return null;
  const b = asObject(req.body);
  if (path === '/api/auth/login') return { action: 'LOGIN', target: String(b.username ?? '') };
  if (path === '/api/devices') return { action: 'REGISTER_DEVICE', target: String(b.deviceId ?? '') };
  if (path === '/api/users') return { action: 'CREATE_USER', target: String(b.username ?? '') };
  if (path === '/api/users/me/password') return { action: 'CHANGE_PASSWORD', target: null };
  let m = /^\/api\/devices\/([^/]+)\/commands$/.exec(path);
  if (m) return { action: 'SEND_COMMAND', target: `${m[1]}/${String(b.target ?? '')}` };
  m = /^\/api\/devices\/([^/]+)\/mode$/.exec(path);
  if (m) return { action: 'SET_MODE', target: m[1] };
  m = /^\/api\/devices\/([^/]+)\/(activate|lock|decommission)$/.exec(path);
  if (m) return { action: `${m[2].toUpperCase()}_DEVICE`, target: m[1] };
  m = /^\/api\/devices\/([^/]+)\/config$/.exec(path);
  if (m) return { action: 'UPDATE_CONFIG', target: m[1] };
  m = /^\/api\/rules\/(\d+)$/.exec(path);
  if (m) return { action: 'UPDATE_RULE', target: rules.find((r) => r.ruleId === Number(m![1]))?.type ?? m[1] };
  m = /^\/api\/alerts\/(\d+)\/acknowledge$/.exec(path);
  if (m) return { action: 'ACK_ALERT', target: m[1] };
  return null;
}

// ---------- Router ----------
async function route(req: MockRequest): Promise<MockResponse> {
  await sleep(100 + Math.random() * 120);
  const { method, path, query } = req;
  const body = asObject(req.body);

  if (method === 'POST' && path === '/api/auth/login') {
    // Giới hạn tần suất: sai mật khẩu 5 lần trong 60 giây thì bị chặn (429 RATE_LIMITED) cho tới khi hết cửa sổ
    const name = String(body.username ?? '');
    const recent = (failedLogins.get(name) ?? []).filter((t) => Date.now() - t < LOGIN_WINDOW_MS);
    if (recent.length >= LOGIN_MAX_FAILS) {
      const retryAfter = Math.max(1, Math.ceil((recent[0] + LOGIN_WINDOW_MS - Date.now()) / 1000));
      return { ...fail(429, 'RATE_LIMITED', 'Thử đăng nhập quá nhiều lần'), retryAfter };
    }
    const u = users.find((x) => x.username === name && x.password === body.password);
    if (!u) {
      failedLogins.set(name, [...recent, Date.now()]);
      return fail(401, 'UNAUTHORIZED', 'Sai tên đăng nhập hoặc mật khẩu');
    }
    failedLogins.delete(name);
    return { status: 200, body: { token: `mock-${u.userId}`, tokenType: 'Bearer', expiresIn: 3600, user: publicUser(u) } };
  }

  // Thứ tự kiểm tra theo Contract: 401 -> 403 -> 404 -> 409 -> 202
  const user = authUser(req.headers);
  if (!user) return fail(401, 'UNAUTHORIZED', 'Thiếu hoặc sai token đăng nhập');
  const canWrite = user.role === 'ADMIN' || user.role === 'OPERATOR';
  const forbidden = () => fail(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');

  if (method === 'GET' && path === '/api/devices') {
    return { status: 200, body: paginate(Object.values(devices).map(toDevice), query) };
  }

  let m = /^\/api\/devices\/([^/]+)\/status$/.exec(path);
  if (m && method === 'GET') {
    const d = devices[m[1]];
    return d ? { status: 200, body: toStatus(d) } : fail(404, 'NOT_FOUND', 'Không tìm thấy thiết bị');
  }

  m = /^\/api\/devices\/([^/]+)\/commands$/.exec(path);
  if (m && method === 'GET') {
    const list = commands.filter((c) => c.deviceId === m![1]).slice().reverse();
    return { status: 200, body: paginate(list, query) };
  }
  if (m && method === 'POST') {
    if (!canWrite) return forbidden();
    const d = devices[m[1]];
    if (!d) return fail(404, 'NOT_FOUND', 'Không tìm thấy thiết bị');

    const target = String(body.target) as CommandTarget;
    const action = String(body.action) as CommandAction;
    const okTarget = ['light1', 'fan1', 'buzzer1', 'door1'].includes(target);
    const okAction = target === 'door1' ? ['OPEN', 'CLOSE'].includes(action) : ['ON', 'OFF'].includes(action);
    if (!okTarget || !okAction || !d.actuators) {
      return fail(400, 'VALIDATION_ERROR', 'Lệnh không hợp lệ', { target, action });
    }
    if (d.status === 'LOCKED') return fail(409, 'DEVICE_LOCKED', 'Thiết bị đã bị khóa');
    if (d.status === 'DECOMMISSIONED') return fail(409, 'DEVICE_DECOMMISSIONED', 'Thiết bị đã ngừng sử dụng');
    if (d.status !== 'ACTIVE') return fail(409, 'DEVICE_NOT_ACTIVE', 'Thiết bị chưa được kích hoạt');
    if (!d.online) return fail(409, 'DEVICE_OFFLINE', 'Thiết bị đang offline');

    const key = header(req.headers, 'Idempotency-Key');
    const bodyStr = JSON.stringify({ target, action });
    if (key && idem.has(key)) {
      const old = idem.get(key)!;
      if (old.body !== bodyStr) return fail(409, 'COMMAND_DUPLICATE', 'Idempotency-Key đã dùng cho lệnh khác');
      return old.res;
    }

    cmdSeq += 1;
    const cmd: Command = {
      commandId: `CMD-${String(cmdSeq).padStart(4, '0')}`, deviceId: d.deviceId, target, action,
      status: 'PENDING', issuedBy: `user-${user.userId}`, issuedAt: now(), ackAt: null, latencyMs: null,
    };
    commands.push(cmd);
    emit({ type: 'command', command: { ...cmd } });
    const startedAt = Date.now();
    // relay/buzzer < 1 giây; door1 chạy servo nên lâu hơn (Contract mục 5.3)
    setTimeout(() => finishCommand(cmd, d, startedAt), target === 'door1' ? 2500 : 300 + Math.random() * 400);

    const res: MockResponse = { status: 202, body: { ...cmd } };
    if (key) idem.set(key, { body: bodyStr, res });
    return res;
  }

  m = /^\/api\/devices\/([^/]+)\/telemetry$/.exec(path);
  if (m && method === 'GET') {
    const d = devices[m[1]];
    if (!d) return fail(404, 'NOT_FOUND', 'Không tìm thấy thiết bị');
    const r = parseRange(query);
    if (!r || r.to - r.from > 7 * DAY_MS) {
      return fail(400, 'VALIDATION_ERROR', 'Thiếu from/to hoặc khoảng thời gian quá 7 ngày', { from: query.from, to: query.to });
    }
    const endTs = Math.floor(Math.min(r.to, Date.now()) / SAMPLE_MS) * SAMPLE_MS;
    const startTs = Math.ceil(r.from / SAMPLE_MS) * SAMPLE_MS;
    const total = endTs >= startTs ? Math.floor((endTs - startTs) / SAMPLE_MS) + 1 : 0;
    const page = Math.max(0, Number(query.page ?? 0) || 0);
    const size = clamp(Number(query.size ?? 20) || 20, 1, 100);
    const desc = !(query.sort ?? '').endsWith(',asc');
    const items: LatestTelemetry[] = [];
    for (let i = page * size; i < Math.min(total, page * size + size); i++) {
      const ts = desc ? endTs - i * SAMPLE_MS : startTs + i * SAMPLE_MS;
      items.push(d.type === 'ENV' ? envSample(ts) : ctrlSample(ts));
    }
    return { status: 200, body: { items, page, size, total, totalPages: Math.ceil(total / size) } };
  }

  m = /^\/api\/devices\/([^/]+)\/energy$/.exec(path);
  if (m && method === 'GET') {
    const d = devices[m[1]];
    if (!d) return fail(404, 'NOT_FOUND', 'Không tìm thấy thiết bị');
    const bucket = (query.bucket ?? 'hour') as EnergyBucketSize;
    const sizes: Record<EnergyBucketSize, number> = { raw: SAMPLE_MS, minute: 60000, hour: 3600000, day: DAY_MS };
    const r = parseRange(query);
    if (!r || !(bucket in sizes) || d.type !== 'CONTROL') {
      return fail(400, 'VALIDATION_ERROR', 'from/to, bucket hoặc thiết bị không hợp lệ', { from: query.from, to: query.to, bucket });
    }
    const bms = sizes[bucket];
    const first = Math.floor(r.from / bms) * bms;
    const last = Math.min(r.to, Date.now());
    if (Math.ceil((r.to - first) / bms) > 1000) {
      return fail(400, 'VALIDATION_ERROR', 'Tối đa 1000 bucket mỗi lần truy vấn', { bucket });
    }
    const buckets = [];
    let totalWh = 0;
    const sub = bms >= 3600000 ? 12 : 3;
    for (let start = first; start < last; start += bms) {
      let l = 0;
      let f = 0;
      for (let j = 0; j < sub; j++) {
        const ts = start + ((j + 0.5) * bms) / sub;
        l += lightOn(ts) ? 4.8 : 0;
        f += fanOn(ts) ? 2.1 : 0;
      }
      const light1AvgW = round2(l / sub);
      const fan1AvgW = round2(f / sub);
      const light1Wh = round2((light1AvgW * bms) / 3600000);
      const fan1Wh = round2((fan1AvgW * bms) / 3600000);
      totalWh += light1Wh + fan1Wh;
      buckets.push({ start: new Date(start).toISOString(), light1Wh, fan1Wh, light1AvgW, fan1AvgW });
    }
    return {
      status: 200,
      body: { deviceId: d.deviceId, from: new Date(r.from).toISOString(), to: new Date(r.to).toISOString(), unit: 'Wh', totalWh: round1(totalWh), buckets },
    };
  }

  m = /^\/api\/devices\/([^/]+)\/mode$/.exec(path);
  if (m && method === 'POST') {
    if (!canWrite) return forbidden();
    const d = devices[m[1]];
    if (!d) return fail(404, 'NOT_FOUND', 'Không tìm thấy thiết bị');
    const mode = body.mode as Mode;
    if (mode !== 'AUTO' && mode !== 'MANUAL') return fail(400, 'VALIDATION_ERROR', 'Chế độ không hợp lệ');
    d.mode = mode;
    emit({ type: 'status', deviceId: d.deviceId, mode });
    return { status: 200, body: { deviceId: d.deviceId, mode, updatedAt: now() } };
  }

  if (method === 'GET' && path === '/api/alerts') {
    let list = alerts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (query.status) list = list.filter((a) => a.status === query.status);
    return { status: 200, body: paginate(list, query) };
  }

  m = /^\/api\/alerts\/(\d+)\/acknowledge$/.exec(path);
  if (m && method === 'PATCH') {
    if (!canWrite) return forbidden();
    const a = alerts.find((x) => x.alertId === Number(m![1]));
    if (!a) return fail(404, 'NOT_FOUND', 'Không tìm thấy cảnh báo');
    a.status = 'ACKNOWLEDGED';
    a.acknowledgedBy = user.userId;
    a.acknowledgedAt = now();
    emit({ type: 'alert', alert: { ...a } });
    return { status: 200, body: { alertId: a.alertId, status: a.status, acknowledgedBy: a.acknowledgedBy, acknowledgedAt: a.acknowledgedAt } };
  }

  if (method === 'GET' && path === '/api/audit-logs') {
    if (user.role === 'VIEWER') return forbidden();
    let list = auditLogs.slice().reverse(); // mới nhất trước
    // "Giới hạn" của Operator (Contract mục 10) được hiểu tạm là chỉ xem thao tác của chính mình
    if (user.role === 'OPERATOR') list = list.filter((l) => l.userId === user.userId);
    return { status: 200, body: paginate(list, query) };
  }

  if (method === 'GET' && path === '/api/users') {
    if (user.role !== 'ADMIN') return forbidden();
    return { status: 200, body: paginate(users.map(publicUser), query) };
  }

  // ---- Quản lý thiết bị (Admin) ----
  if (method === 'POST' && path === '/api/devices') {
    if (user.role !== 'ADMIN') return forbidden();
    const deviceId = String(body.deviceId ?? '').trim();
    const name = String(body.name ?? '').trim();
    const type = body.type as DeviceType;
    const roomId = String(body.roomId ?? '').trim();
    const errs: Detail[] = [];
    if (!/^[a-z0-9-]{3,40}$/.test(deviceId)) errs.push({ field: 'deviceId', message: 'chỉ gồm chữ thường, số, dấu gạch ngang (3–40 ký tự)' });
    if (!name) errs.push({ field: 'name', message: 'không được để trống' });
    if (type !== 'ENV' && type !== 'CONTROL') errs.push({ field: 'type', message: 'phải là ENV hoặc CONTROL' });
    if (!roomId) errs.push({ field: 'roomId', message: 'không được để trống' });
    if (devices[deviceId]) errs.push({ field: 'deviceId', message: 'đã tồn tại' });
    if (errs.length) return fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', errs);
    const nd: DeviceState = {
      deviceId, name, type, status: 'REGISTERED', mode: 'AUTO', roomId, online: false, fwVersion: '-', lastSeenAt: now(),
      actuators: type === 'CONTROL' ? { light1: 'OFF', fan1: 'OFF', buzzer1: 'OFF', door1: 'CLOSED' } : null,
      latest: { receivedAt: now(), quality: 'VALID' },
    };
    devices[deviceId] = nd;
    return { status: 201, body: toDevice(nd) };
  }

  m = /^\/api\/devices\/([^/]+)\/(activate|lock|decommission)$/.exec(path);
  if (m && method === 'POST') {
    if (user.role !== 'ADMIN') return forbidden();
    const d = devices[m[1]];
    if (!d) return fail(404, 'NOT_FOUND', 'Không tìm thấy thiết bị');
    const op = m[2];
    if (op === 'activate') {
      if (!CAN_ACTIVATE.includes(d.status)) return fail(409, 'INVALID_STATE', `Không thể kích hoạt thiết bị đang ở trạng thái ${d.status}`);
      d.status = 'ACTIVE';
      d.online = true;
      d.lastSeenAt = now();
    } else if (op === 'lock') {
      if (!CAN_LOCK.includes(d.status)) return fail(409, 'INVALID_STATE', `Không thể khóa thiết bị đang ở trạng thái ${d.status}`);
      d.status = 'LOCKED';
      d.online = false; // thiết bị bị khóa không gửi được dữ liệu (Contract mục 11)
    } else {
      if (d.status !== 'LOCKED') return fail(409, 'INVALID_STATE', 'Chỉ thiết bị đã khóa mới được decommission');
      d.status = 'DECOMMISSIONED';
      d.online = false;
    }
    emit({ type: 'status', deviceId: d.deviceId, online: d.online });
    return { status: 200, body: toDevice(d) };
  }

  // ---- Cấu hình tham số thiết bị ----
  m = /^\/api\/devices\/([^/]+)\/config$/.exec(path);
  if (m && method === 'PUT') {
    if (!canWrite) return forbidden();
    const d = devices[m[1]];
    if (!d) return fail(404, 'NOT_FOUND', 'Không tìm thấy thiết bị');
    if (d.status === 'LOCKED') return fail(409, 'DEVICE_LOCKED', 'Thiết bị đã bị khóa');
    if (d.status === 'DECOMMISSIONED') return fail(409, 'DEVICE_DECOMMISSIONED', 'Thiết bị đã ngừng sử dụng');
    if (d.status !== 'ACTIVE') return fail(409, 'DEVICE_NOT_ACTIVE', 'Thiết bị chưa được kích hoạt');
    const errs: Detail[] = [];
    const has = ['telemetryIntervalSec', 'servoOpenDeg', 'servoCloseDeg'].filter((k) => body[k] !== undefined);
    if (has.length === 0) errs.push({ field: 'body', message: 'cần ít nhất một tham số' });
    if (body.telemetryIntervalSec !== undefined) inRange(body, 'telemetryIntervalSec', 1, 3600, true, '', errs);
    if (body.servoOpenDeg !== undefined) inRange(body, 'servoOpenDeg', 0, 180, true, '', errs);
    if (body.servoCloseDeg !== undefined) inRange(body, 'servoCloseDeg', 0, 180, true, '', errs);
    if (errs.length) return fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', errs);
    if (pendingConfig.has(d.deviceId)) return fail(409, 'CONFIG_CONFLICT', 'Đang có cấu hình chờ xác nhận, vui lòng thử lại sau');

    cfgSeq += 1;
    const res: ConfigResult = {
      configId: `CFG-${String(cfgSeq).padStart(4, '0')}`, deviceId: d.deviceId, status: 'PENDING',
      issuedBy: `user-${user.userId}`, issuedAt: now(),
    };
    pendingConfig.add(d.deviceId);
    setTimeout(() => {
      pendingConfig.delete(d.deviceId);
      emit({ type: 'config', deviceId: d.deviceId, configId: res.configId, status: 'SUCCESS' });
    }, 1200);
    return { status: 200, body: res };
  }

  // ---- Rule/ngưỡng ----
  if (method === 'GET' && path === '/api/rules') return { status: 200, body: paginate(rules, query) };
  m = /^\/api\/rules\/(\d+)$/.exec(path);
  if (m && method === 'PUT') {
    if (!canWrite) return forbidden();
    const rule = rules.find((x) => x.ruleId === Number(m![1]));
    if (!rule) return fail(404, 'NOT_FOUND', 'Không tìm thấy rule');
    const errs: Detail[] = [];
    if (body.name !== undefined && !String(body.name).trim()) errs.push({ field: 'name', message: 'không được để trống' });
    const params = body.params !== undefined ? { ...rule.params, ...asObject(body.params) } : rule.params;
    errs.push(...validateRuleParams(rule.type, params));
    if (errs.length) return fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', errs);
    if (body.name !== undefined) rule.name = String(body.name).trim();
    if (typeof body.enabled === 'boolean') rule.enabled = body.enabled;
    rule.params = params as Rule['params'];
    if (body.action !== undefined) rule.action = body.action as Rule['action'];
    rule.updatedAt = now();
    return { status: 200, body: rule };
  }

  // ---- User ----
  if (method === 'POST' && path === '/api/users') {
    if (user.role !== 'ADMIN') return forbidden();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const role = body.role as Role;
    const errs: Detail[] = [];
    if (username.length < 3) errs.push({ field: 'username', message: 'tối thiểu 3 ký tự' });
    if (users.some((u) => u.username === username)) errs.push({ field: 'username', message: 'đã tồn tại' });
    if (password.length < 8) errs.push({ field: 'password', message: 'tối thiểu 8 ký tự' });
    if (!['ADMIN', 'OPERATOR', 'VIEWER'].includes(role)) errs.push({ field: 'role', message: 'vai trò không hợp lệ' });
    if (errs.length) return fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', errs);
    const nu: MockUser = { userId: Math.max(...users.map((u) => u.userId)) + 1, username, password, role, accountStatus: 'ACTIVE', createdAt: now() };
    users.push(nu);
    return { status: 201, body: publicUser(nu) };
  }
  if (method === 'PUT' && path === '/api/users/me/password') {
    const cur = String(body.oldPassword ?? '');
    const next = String(body.newPassword ?? '');
    if (cur !== user.password) return fail(400, 'VALIDATION_ERROR', 'Mật khẩu hiện tại không đúng', [{ field: 'oldPassword', message: 'không đúng' }]);
    if (next.length < 8) return fail(400, 'VALIDATION_ERROR', 'Mật khẩu mới tối thiểu 8 ký tự', [{ field: 'newPassword', message: 'tối thiểu 8 ký tự' }]);
    user.password = next;
    return { status: 204, body: null };
  }

  return fail(404, 'NOT_FOUND', 'Mock chưa hỗ trợ endpoint này');
}

export async function mockRequest(req: MockRequest): Promise<MockResponse> {
  const res = await route(req);
  const d = describeAction(req);
  if (d) {
    const actor =
      req.path === '/api/auth/login'
        ? (users.find((u) => u.username === asObject(req.body).username) ?? null)
        : authUser(req.headers);
    auditSeq += 1;
    auditLogs.push({
      logId: auditSeq, userId: actor?.userId ?? null, username: actor?.username ?? null,
      action: d.action, target: d.target, result: res.status < 400 ? 'SUCCESS' : 'FAILURE', timestamp: now(),
    });
  }
  return res;
}

// ---------- Bộ giả lập telemetry (5 giây/lần như Contract mục 4) ----------
let started = false;
let hotCount = 0;

function tickEnv(a: DeviceState) {
  // Rule TEMP_HIGH lấy từ danh sách rule nên chỉnh ngưỡng trên giao diện sẽ có tác dụng ngay
  const rule = rules.find((x) => x.type === 'TEMP_HIGH');
  const thr = typeof rule?.params.thresholdC === 'number' ? rule.params.thresholdC : 30;
  const need = typeof rule?.params.consecutiveSamples === 'number' ? rule.params.consecutiveSamples : 3;

  const temp = clamp((a.latest.temperature ?? 28.5) + (Math.random() - 0.45) * 0.8, 26, 34);
  const quality = Math.random() < 0.05 ? 'SUSPECT' : 'VALID';
  a.latest = {
    receivedAt: now(),
    temperature: round1(temp),
    humidity: round1(clamp((a.latest.humidity ?? 72) + (Math.random() - 0.5) * 2, 60, 80)),
    lux: round1(clamp((a.latest.lux ?? 320) + (Math.random() - 0.5) * 20, 150, 500)),
    presence: Math.random() < 0.1 ? !a.latest.presence : a.latest.presence,
    airRaw: Math.round(clamp((a.latest.airRaw ?? 1450) + (Math.random() - 0.5) * 60, 1200, 1800)),
    quality,
  };
  a.lastSeenAt = a.latest.receivedAt;
  emit({ type: 'telemetry', deviceId: a.deviceId, data: { ...a.latest } });

  // TEMP_HIGH: vượt ngưỡng N lần liên tiếp, chỉ tính bản tin VALID (Contract 5.5, 9.1)
  if (quality === 'VALID') hotCount = temp > thr ? hotCount + 1 : 0;
  if (rule?.enabled !== false && hotCount >= need && !alerts.some((x) => x.type === 'TEMP_HIGH' && x.status === 'OPEN')) {
    alertSeq += 1;
    const al: Alert = {
      alertId: alertSeq, type: 'TEMP_HIGH', severity: rule?.action.severity ?? 'MEDIUM', status: 'OPEN', deviceId: a.deviceId, roomId: a.roomId,
      value: round1(temp), threshold: thr, createdAt: now(), acknowledgedBy: null, acknowledgedAt: null,
    };
    alerts.push(al);
    emit({ type: 'alert', alert: { ...al } });
  }
}

function tickCtrl(b: DeviceState) {
  applyPower(b);
  b.latest = { ...b.latest, receivedAt: now(), quality: 'VALID' };
  b.lastSeenAt = b.latest.receivedAt;
  emit({ type: 'telemetry', deviceId: b.deviceId, data: { ...b.latest } });
}

function tick() {
  // Thiết bị chưa kích hoạt, bị khóa hoặc decommission không gửi được dữ liệu (Contract mục 11)
  const a = devices['office-env-01'];
  const b = devices['office-ctrl-01'];
  if (a.status === 'ACTIVE') tickEnv(a);
  if (b.status === 'ACTIVE') tickCtrl(b);
}

export function startMockSimulator() {
  if (started) return;
  started = true;
  setInterval(tick, 5000);
}
