import { USE_MOCK } from '../config';

const AUTH_KEY = 'iot.auth';

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  retryAfterSec?: number; // từ header Retry-After khi bị giới hạn tần suất (429)
  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? ((JSON.parse(raw) as { token?: string }).token ?? null) : null;
  } catch {
    return null;
  }
}

// AuthProvider đăng ký hàm này để tự đăng xuất khi token sai/hết hạn
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

// Cho các nơi ngoài request() (như kết nối SSE) báo token hết hạn
export function notifyUnauthorized() {
  onUnauthorized?.();
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

interface RawResponse {
  status: number;
  body: unknown;
  retryAfter?: number;
}

function buildQuery(query?: RequestOptions['query']): Record<string, string> {
  const out: Record<string, string> = {};
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') out[k] = String(v);
    }
  }
  return out;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const query = buildQuery(opts.query);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: RawResponse;
  if (USE_MOCK) {
    const { mockRequest } = await import('../mock/server');
    res = await mockRequest({ method, path, query, body: opts.body, headers });
  } else {
    const qs = new URLSearchParams(query).toString();
    const r = await fetch(qs ? `${path}?${qs}` : path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let body: unknown = null;
    if (r.status !== 204) {
      try {
        body = await r.json();
      } catch {
        body = null;
      }
    }
    const ra = Number(r.headers.get('Retry-After'));
    res = { status: r.status, body, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined };
  }

  if (res.status >= 400) {
    // Format lỗi theo Contract mục 8.3: { error: { code, message, details } }
    const e = (res.body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const err = new ApiError(res.status, e?.code ?? 'INTERNAL_ERROR', e?.message ?? 'Có lỗi xảy ra', e?.details ?? null);
    err.retryAfterSec = res.retryAfter;
    if (path !== '/api/auth/login' && (err.code === 'TOKEN_EXPIRED' || err.code === 'UNAUTHORIZED')) {
      onUnauthorized?.();
    }
    throw err;
  }
  return res.body as T;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'RATE_LIMITED') {
      return e.retryAfterSec
        ? `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${e.retryAfterSec} giây.`
        : 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    }
    return e.message;
  }
  return 'Có lỗi xảy ra, vui lòng thử lại';
}

// Danh sách lỗi theo field (details của VALIDATION_ERROR), ví dụ: "params.thresholdC: phải trong khoảng 0–60"
export function errDetails(e: unknown): string {
  if (!(e instanceof ApiError) || !Array.isArray(e.details)) return '';
  return e.details
    .map((d) => {
      if (d && typeof d === 'object') {
        const o = d as { field?: string; message?: string };
        return o.field ? `${o.field}: ${o.message ?? ''}` : (o.message ?? '');
      }
      return String(d);
    })
    .filter(Boolean)
    .join('; ');
}
