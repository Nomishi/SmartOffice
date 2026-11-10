import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errDetails, errMsg, setUnauthorizedHandler } from './client';
import { getDevices, login, sendCommand } from './endpoints';

// Kiểm thử lớp gọi API: đi qua client.ts -> endpoints.ts -> mock (VITE_USE_MOCK=true trong vitest.config.ts).
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;
if (!(globalThis as { crypto?: unknown }).crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const setToken = (token: string | null) => (token ? store.set('iot.auth', JSON.stringify({ token })) : store.delete('iot.auth'));

beforeEach(() => {
  setToken(null);
  setUnauthorizedHandler(null);
});

describe('request / endpoints', () => {
  it('login trả token dùng được cho các request sau', async () => {
    const res = await login('viewer1', 'viewer123');
    expect(res.user.role).toBe('VIEWER');
    setToken(res.token);
    const devices = await getDevices();
    expect(devices.items.map((d) => d.deviceId)).toContain('office-env-01');
  });

  it('không có token thì ném ApiError 401 và gọi hàm tự đăng xuất đúng một lần', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    await expect(getDevices()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('đăng nhập sai không kích hoạt tự đăng xuất', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    await expect(login('admin', 'sai-mat-khau')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(0);
  });

  it('Viewer gửi lệnh bị 403 FORBIDDEN', async () => {
    setToken((await login('viewer1', 'viewer123')).token);
    await expect(sendCommand('office-ctrl-01', 'light1', 'ON')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});

describe('errMsg / errDetails', () => {
  it('RATE_LIMITED hiện số giây phải chờ', () => {
    const e = new ApiError(429, 'RATE_LIMITED', 'x');
    e.retryAfterSec = 42;
    expect(errMsg(e)).toContain('42 giây');
  });

  it('RATE_LIMITED không có Retry-After vẫn có thông báo thân thiện', () => {
    expect(errMsg(new ApiError(429, 'RATE_LIMITED', 'x'))).toContain('quá nhanh');
  });

  it('lỗi khác dùng message của backend; lỗi lạ dùng thông báo chung', () => {
    expect(errMsg(new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ'))).toBe('Dữ liệu không hợp lệ');
    expect(errMsg(new Error('boom'))).toContain('Có lỗi xảy ra');
  });

  it('errDetails ghép lỗi từng field', () => {
    const e = new ApiError(400, 'VALIDATION_ERROR', 'x', [
      { field: 'params.thresholdC', message: 'phải trong khoảng 0–60' },
      { field: 'name', message: 'không được để trống' },
    ]);
    expect(errDetails(e)).toBe('params.thresholdC: phải trong khoảng 0–60; name: không được để trống');
    expect(errDetails(new ApiError(500, 'X', 'x'))).toBe('');
  });
});
