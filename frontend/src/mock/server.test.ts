import { describe, expect, it } from 'vitest';
import { mockRequest } from './server';
import type { MockResponse } from './server';

// Kiểm thử backend giả để chắc UI được xây trên hành vi đúng Contract (401 -> 403 -> 404 -> 409, lệnh PENDING -> ACK...).
// State của mock nằm trong module nên các test dưới đây dùng id/username riêng để không ảnh hưởng nhau.
const ADMIN = 1;
const OPERATOR = 2;
const VIEWER = 3;

const call = (uid: number | null, method: string, path: string, body?: unknown, query: Record<string, string> = {}, extra: Record<string, string> = {}) =>
  mockRequest({ method, path, query, body, headers: { ...(uid ? { Authorization: `Bearer mock-${uid}` } : {}), ...extra } });
const err = (r: MockResponse) => (r.body as { error: { code: string; details: unknown } }).error;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

describe('đăng nhập và xác thực', () => {
  it('đăng nhập đúng trả token và user', async () => {
    const r = await call(null, 'POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tokenType: 'Bearer', user: { username: 'admin', role: 'ADMIN' } });
  });

  it('sai mật khẩu trả 401 và không lộ password trong user', async () => {
    const r = await call(null, 'POST', '/api/auth/login', { username: 'admin', password: 'sai' });
    expect(r.status).toBe(401);
    expect(err(r).code).toBe('UNAUTHORIZED');
  });

  it('thiếu token trả 401', async () => {
    const r = await call(null, 'GET', '/api/devices');
    expect(r.status).toBe(401);
  });

  it('sai mật khẩu 5 lần thì lần 6 bị 429 RATE_LIMITED kèm retryAfter', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await call(null, 'POST', '/api/auth/login', { username: 'nguoi-la', password: 'x' });
      expect(r.status).toBe(401);
    }
    const blocked = await call(null, 'POST', '/api/auth/login', { username: 'nguoi-la', password: 'x' });
    expect(blocked.status).toBe(429);
    expect(err(blocked).code).toBe('RATE_LIMITED');
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});

describe('điều khiển và lệnh', () => {
  it('Viewer bị 403, Operator gửi được lệnh (202 PENDING) rồi thành SUCCESS sau ACK', async () => {
    const body = { target: 'light1', action: 'ON' };
    expect((await call(VIEWER, 'POST', '/api/devices/office-ctrl-01/commands', body)).status).toBe(403);
    const r = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/commands', body, {}, { 'Idempotency-Key': 'k-1' });
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ status: 'PENDING', target: 'light1', action: 'ON' });
    await wait(1000);
    const list = await call(OPERATOR, 'GET', '/api/devices/office-ctrl-01/commands');
    const items = (list.body as { items: { commandId: string; status: string; latencyMs: number }[] }).items;
    const cmd = items.find((c) => c.commandId === (r.body as { commandId: string }).commandId);
    expect(cmd?.status).toBe('SUCCESS');
    const st = await call(VIEWER, 'GET', '/api/devices/office-ctrl-01/status');
    expect((st.body as { actuators: { light1: string } }).actuators.light1).toBe('ON');
  });

  it('còi nhận các chế độ BEEP/ALARM thay vì chỉ ON/OFF', async () => {
    const r = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/commands', { target: 'buzzer1', action: 'BEEP' });
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ target: 'buzzer1', action: 'BEEP', status: 'PENDING' });
    await wait(900);
    const list = await call(OPERATOR, 'GET', '/api/devices/office-ctrl-01/commands');
    const items = (list.body as { items: { commandId: string; status: string }[] }).items;
    expect(items.find((c) => c.commandId === (r.body as { commandId: string }).commandId)?.status).toBe('SUCCESS');
  });

  it('Idempotency-Key: cùng key + cùng body trả lại đúng lệnh cũ, khác body thì 409 COMMAND_DUPLICATE', async () => {
    const a = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/commands', { target: 'fan1', action: 'ON' }, {}, { 'Idempotency-Key': 'k-2' });
    const b = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/commands', { target: 'fan1', action: 'ON' }, {}, { 'Idempotency-Key': 'k-2' });
    expect((b.body as { commandId: string }).commandId).toBe((a.body as { commandId: string }).commandId);
    const c = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/commands', { target: 'fan1', action: 'OFF' }, {}, { 'Idempotency-Key': 'k-2' });
    expect(c.status).toBe(409);
    expect(err(c).code).toBe('COMMAND_DUPLICATE');
  });

  it('lệnh sai bị 400 VALIDATION_ERROR; thiết bị không tồn tại bị 404', async () => {
    const bad = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/commands', { target: 'light1', action: 'DIM' });
    expect(bad.status).toBe(400);
    expect(err(bad).code).toBe('VALIDATION_ERROR');
    expect((await call(OPERATOR, 'POST', '/api/devices/khong-co/commands', { target: 'light1', action: 'ON' })).status).toBe(404);
  });

  it('đổi chế độ: Viewer 403, Operator được, giá trị lạ 400', async () => {
    expect((await call(VIEWER, 'POST', '/api/devices/office-ctrl-01/mode', { mode: 'MANUAL' })).status).toBe(403);
    expect((await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/mode', { mode: 'MANUAL' })).status).toBe(200);
    expect((await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/mode', { mode: 'XYZ' })).status).toBe(400);
  });
});

describe('vòng đời thiết bị (test bảo mật bắt buộc số 2)', () => {
  const dev = { deviceId: 'office-ctrl-77', name: 'Node B2', type: 'CONTROL', roomId: 'room-01' };

  it('chỉ Admin đăng ký thiết bị; mã sai hoặc trùng bị 400', async () => {
    expect((await call(OPERATOR, 'POST', '/api/devices', dev)).status).toBe(403);
    expect((await call(ADMIN, 'POST', '/api/devices', { ...dev, deviceId: 'Sai Ma!' })).status).toBe(400);
    const ok = await call(ADMIN, 'POST', '/api/devices', dev);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ deviceId: 'office-ctrl-77', status: 'REGISTERED' });
    expect((await call(ADMIN, 'POST', '/api/devices', dev)).status).toBe(400);
  });

  it('thiết bị chưa ACTIVE không nhận lệnh (409 DEVICE_NOT_ACTIVE)', async () => {
    const r = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-77/commands', { target: 'light1', action: 'ON' });
    expect(r.status).toBe(409);
    expect(err(r).code).toBe('DEVICE_NOT_ACTIVE');
  });

  it('chuyển trạng thái sai bị 409; đúng thứ tự thì qua; LOCKED và DECOMMISSIONED chặn lệnh', async () => {
    expect((await call(ADMIN, 'POST', '/api/devices/office-ctrl-77/decommission')).status).toBe(409); // chưa khóa
    expect((await call(ADMIN, 'POST', '/api/devices/office-ctrl-77/activate')).body).toMatchObject({ status: 'ACTIVE', online: true });
    expect((await call(OPERATOR, 'POST', '/api/devices/office-ctrl-77/lock')).status).toBe(403);
    expect((await call(ADMIN, 'POST', '/api/devices/office-ctrl-77/lock')).body).toMatchObject({ status: 'LOCKED', online: false });
    const locked = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-77/commands', { target: 'light1', action: 'ON' });
    expect(err(locked).code).toBe('DEVICE_LOCKED');
    expect((await call(ADMIN, 'POST', '/api/devices/office-ctrl-77/decommission')).body).toMatchObject({ status: 'DECOMMISSIONED' });
    const gone = await call(OPERATOR, 'POST', '/api/devices/office-ctrl-77/commands', { target: 'light1', action: 'ON' });
    expect(err(gone).code).toBe('DEVICE_DECOMMISSIONED');
    expect((await call(ADMIN, 'POST', '/api/devices/office-ctrl-77/activate')).status).toBe(409); // không hoàn tác
  });
});

describe('cấu hình thiết bị', () => {
  it('Viewer 403; sai dải 400 kèm chi tiết; hợp lệ trả PENDING; gửi tiếp khi đang chờ thì CONFIG_CONFLICT', async () => {
    expect((await call(VIEWER, 'PUT', '/api/devices/office-env-01/config', { telemetryIntervalSec: 5 })).status).toBe(403);
    const bad = await call(OPERATOR, 'PUT', '/api/devices/office-env-01/config', { telemetryIntervalSec: 99999 });
    expect(bad.status).toBe(400);
    expect(Array.isArray(err(bad).details)).toBe(true);
    expect((await call(OPERATOR, 'PUT', '/api/devices/office-env-01/config', {})).status).toBe(400); // rỗng
    const ok = await call(OPERATOR, 'PUT', '/api/devices/office-env-01/config', { telemetryIntervalSec: 10 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'PENDING', deviceId: 'office-env-01' });
    const again = await call(OPERATOR, 'PUT', '/api/devices/office-env-01/config', { telemetryIntervalSec: 10 });
    expect(err(again).code).toBe('CONFIG_CONFLICT');
    await wait(1400); // chờ mock phát xong ACK để không ảnh hưởng test khác
  });
});

describe('rule và ngưỡng', () => {
  it('mọi role xem được; Viewer không sửa được', async () => {
    const r = await call(VIEWER, 'GET', '/api/rules');
    expect((r.body as { items: unknown[] }).items).toHaveLength(5);
    expect((await call(VIEWER, 'PUT', '/api/rules/1', { enabled: false })).status).toBe(403);
  });

  it('sai dải giá trị bị 400 và chỉ ra field lỗi; hợp lệ thì lưu', async () => {
    const bad = await call(OPERATOR, 'PUT', '/api/rules/1', { params: { thresholdC: 99, consecutiveSamples: 0 } });
    expect(bad.status).toBe(400);
    const fields = (err(bad).details as { field: string }[]).map((d) => d.field);
    expect(fields).toContain('params.thresholdC');
    expect(fields).toContain('params.consecutiveSamples');
    const ok = await call(OPERATOR, 'PUT', '/api/rules/1', { params: { thresholdC: 32, consecutiveSamples: 3 } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ params: { thresholdC: 32 } });
  });

  it('rule ABSENCE_OFF bắt buộc chọn ít nhất một tải', async () => {
    const bad = await call(OPERATOR, 'PUT', '/api/rules/3', { params: { targets: [] } });
    expect(bad.status).toBe(400);
  });
});

describe('người dùng', () => {
  it('chỉ Admin tạo user; trùng tên hoặc mật khẩu ngắn bị 400', async () => {
    const u = { username: 'nguoi-moi', password: 'matkhau123', role: 'VIEWER' };
    expect((await call(OPERATOR, 'POST', '/api/users', u)).status).toBe(403);
    expect((await call(ADMIN, 'POST', '/api/users', u)).status).toBe(201);
    expect((await call(ADMIN, 'POST', '/api/users', u)).status).toBe(400);
    expect((await call(ADMIN, 'POST', '/api/users', { ...u, username: 'khac', password: '123' })).status).toBe(400);
  });

  it('danh sách user chỉ Admin xem được và không lộ mật khẩu', async () => {
    expect((await call(OPERATOR, 'GET', '/api/users')).status).toBe(403);
    const r = await call(ADMIN, 'GET', '/api/users');
    expect(JSON.stringify(r.body)).not.toContain('password');
  });

  it('đổi mật khẩu: sai mật khẩu cũ bị 400, đúng thì 204 và đăng nhập được bằng mật khẩu mới', async () => {
    const bad = await call(OPERATOR, 'PUT', '/api/users/me/password', { oldPassword: 'sai', newPassword: 'matkhaumoi1' });
    expect(bad.status).toBe(400);
    const ok = await call(OPERATOR, 'PUT', '/api/users/me/password', { oldPassword: 'operator123', newPassword: 'matkhaumoi1' });
    expect(ok.status).toBe(204);
    const login = await call(null, 'POST', '/api/auth/login', { username: 'operator1', password: 'matkhaumoi1' });
    expect(login.status).toBe(200);
  });
});

describe('lịch sử đo và năng lượng', () => {
  it('telemetry: thiếu from/to hoặc quá 7 ngày bị 400; hợp lệ có phân trang đúng', async () => {
    const now = Date.now();
    expect((await call(VIEWER, 'GET', '/api/devices/office-env-01/telemetry')).status).toBe(400);
    expect((await call(VIEWER, 'GET', '/api/devices/office-env-01/telemetry', undefined, { from: iso(now - 8 * 86400000), to: iso(now) })).status).toBe(400);
    const r = await call(VIEWER, 'GET', '/api/devices/office-env-01/telemetry', undefined, { from: iso(now - 3600000), to: iso(now), size: '100' });
    const b = r.body as { total: number; totalPages: number; items: unknown[] };
    expect(b.total).toBeGreaterThan(700); // 5 giây/lần trong 1 giờ ≈ 720
    expect(b.items).toHaveLength(100);
    expect(b.totalPages).toBe(Math.ceil(b.total / 100));
  });

  it('năng lượng: chỉ Node B, tối đa 1000 bucket', async () => {
    const now = Date.now();
    const ok = await call(VIEWER, 'GET', '/api/devices/office-ctrl-01/energy', undefined, { from: iso(now - 86400000), to: iso(now), bucket: 'hour' });
    expect(ok.status).toBe(200);
    expect((ok.body as { totalWh: number }).totalWh).toBeGreaterThan(0);
    const many = await call(VIEWER, 'GET', '/api/devices/office-ctrl-01/energy', undefined, { from: iso(now - 7 * 86400000), to: iso(now), bucket: 'minute' });
    expect(many.status).toBe(400);
    const nodeA = await call(VIEWER, 'GET', '/api/devices/office-env-01/energy', undefined, { from: iso(now - 3600000), to: iso(now) });
    expect(nodeA.status).toBe(400);
  });
});

describe('nhật ký thao tác (audit log)', () => {
  it('Viewer bị 403; thao tác ghi (kể cả bị từ chối) được ghi lại; Operator chỉ thấy của mình', async () => {
    expect((await call(VIEWER, 'GET', '/api/audit-logs')).status).toBe(403);
    await call(OPERATOR, 'POST', '/api/devices/office-ctrl-01/mode', { mode: 'AUTO' });
    await call(VIEWER, 'POST', '/api/devices/office-ctrl-01/commands', { target: 'light1', action: 'OFF' }); // bị 403

    type Row = { userId: number; action: string; result: string };
    const adminView = (await call(ADMIN, 'GET', '/api/audit-logs', undefined, { size: '100' })).body as { items: Row[] };
    expect(adminView.items.some((l) => l.userId === VIEWER && l.action === 'SEND_COMMAND' && l.result === 'FAILURE')).toBe(true);
    expect(adminView.items.some((l) => l.userId === OPERATOR && l.action === 'SET_MODE' && l.result === 'SUCCESS')).toBe(true);

    const opView = (await call(OPERATOR, 'GET', '/api/audit-logs', undefined, { size: '100' })).body as { items: Row[] };
    expect(opView.items.length).toBeGreaterThan(0);
    expect(opView.items.every((l) => l.userId === OPERATOR)).toBe(true);
  });

  it('mới nhất đứng đầu', async () => {
    const r = (await call(ADMIN, 'GET', '/api/audit-logs', undefined, { size: '5' })).body as { items: { logId: number }[] };
    const ids = r.items.map((l) => l.logId);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });
});
