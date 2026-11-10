import { describe, expect, it } from 'vitest';
import { mockRequest } from './mock/server';

const call = (uid: number | null, body: unknown) =>
  mockRequest({
    method: 'POST',
    path: '/api/ai/chat',
    query: {},
    body,
    headers: uid ? { Authorization: `Bearer mock-${uid}` } : {},
  });

describe('AI mock', () => {
  it('trả answer cho user đã đăng nhập', async () => {
    const r = await call(2, { message: 'Nhiệt độ thế nào?', deviceId: 'office-env-01' });
    expect(r.status).toBe(200);
    expect((r.body as { answer: string }).answer).toContain('Nhiệt độ');
    expect((r.body as { model: string }).model).toBe('mock-ai');
  });

  it('yêu cầu đăng nhập', async () => {
    const r = await call(null, { message: 'test' });
    expect(r.status).toBe(401);
  });

  it('validate deviceId', async () => {
    const r = await call(2, { message: 'test', deviceId: 'khong-ton-tai' });
    expect(r.status).toBe(404);
  });
});
