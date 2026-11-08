import { describe, expect, it } from 'vitest';
import { normalizeEvent } from './realtime';

// Kiểm tra việc đổi định dạng SSE của backend ({type,data,timestamp}) sang RealtimeEvent của frontend.
const ts = '2026-11-08T02:00:00Z';

describe('normalizeEvent', () => {
  it('telemetry Node A: lấy deviceId lên trên, bỏ trường nội bộ', () => {
    const e = normalizeEvent({
      type: 'telemetry',
      timestamp: ts,
      data: { id: 7, deviceId: 'office-env-01', receivedAt: ts, temperature: 27.5, quality: 'VALID', deviceTs: null },
    });
    expect(e).toEqual({
      type: 'telemetry',
      deviceId: 'office-env-01',
      data: { receivedAt: ts, temperature: 27.5, quality: 'VALID' },
    });
  });

  it('telemetry Node B (PowerReading) cũng được nhận', () => {
    const e = normalizeEvent({ type: 'telemetry', data: { deviceId: 'office-ctrl-01', receivedAt: ts, light1PowerW: 4.8, quality: 'VALID' } });
    expect(e?.type).toBe('telemetry');
    if (e?.type === 'telemetry') expect(e.data.light1PowerW).toBe(4.8);
  });

  it('command / alert: data nằm trong command / alert', () => {
    const cmd = { commandId: 'c1', deviceId: 'office-ctrl-01', target: 'light1', action: 'ON', status: 'SUCCESS' };
    expect(normalizeEvent({ type: 'command', data: cmd })).toEqual({ type: 'command', command: cmd });
    const alert = { alertId: 1, type: 'TEMP_HIGH', deviceId: 'office-env-01', status: 'OPEN' };
    expect(normalizeEvent({ type: 'alert', data: alert })).toEqual({ type: 'alert', alert });
  });

  it('status và config', () => {
    expect(normalizeEvent({ type: 'status', data: { deviceId: 'd1', online: true, mode: 'AUTO' } })).toMatchObject({
      type: 'status', deviceId: 'd1', online: true, mode: 'AUTO',
    });
    expect(normalizeEvent({ type: 'config', data: { configId: 'cfg1', deviceId: 'd1', status: 'SUCCESS' } })).toEqual({
      type: 'config', deviceId: 'd1', configId: 'cfg1', status: 'SUCCESS',
    });
  });

  it('bỏ qua connected, loại lạ và dữ liệu thiếu deviceId', () => {
    expect(normalizeEvent({ type: 'connected', data: { message: 'x' } })).toBeNull();
    expect(normalizeEvent({ type: 'whatever', data: {} })).toBeNull();
    expect(normalizeEvent({ type: 'telemetry', data: { temperature: 1 } })).toBeNull();
  });
});
