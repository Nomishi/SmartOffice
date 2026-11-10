import { fetchEventSource } from '@microsoft/fetch-event-source';
import { USE_MOCK } from './config';
import { getToken, notifyUnauthorized } from './api/client';
import type { Actuators, Alert, Command, ConfigResult, LatestTelemetry, RealtimeEvent } from './types';

// Backend (RealtimeService) gửi mỗi sự kiện SSE dạng: { type, data, timestamp }
// với data là DTO/entity tương ứng. Hàm này đổi sang RealtimeEvent mà frontend đang dùng.
interface BackendEnvelope {
  type?: string;
  data?: unknown;
  timestamp?: string;
}

export function normalizeEvent(raw: BackendEnvelope): RealtimeEvent | null {
  const d = (raw.data ?? {}) as Record<string, unknown>;
  switch (raw.type) {
    case 'telemetry': {
      // Node A: entity Telemetry; Node B: entity PowerReading. Cả hai đều có deviceId.
      const deviceId = d.deviceId as string | undefined;
      if (!deviceId) return null;
      const { id: _id, deviceId: _deviceId, deviceTs: _deviceTs, ...rest } = d; // bỏ trường nội bộ
      return { type: 'telemetry', deviceId, data: rest as unknown as LatestTelemetry };
    }
    case 'status': {
      const deviceId = d.deviceId as string | undefined;
      if (!deviceId) return null;
      return {
        type: 'status',
        deviceId,
        online: d.online as boolean | undefined,
        mode: d.mode as 'AUTO' | 'MANUAL' | undefined,
        // backend chưa gửi actuators trong sự kiện status; để undefined thì giữ giá trị cũ
        actuators: d.actuators as Actuators | undefined,
      };
    }
    case 'command':
      return { type: 'command', command: d as unknown as Command };
    case 'alert':
      return { type: 'alert', alert: d as unknown as Alert };
    case 'config': {
      const deviceId = d.deviceId as string | undefined;
      const configId = d.configId as string | undefined;
      if (!deviceId || !configId) return null;
      return { type: 'config', deviceId, configId, status: d.status as ConfigResult['status'] };
    }
    default:
      return null; // 'connected' và các loại lạ: bỏ qua
  }
}

class FatalStreamError extends Error {}

// Kết nối realtime, trả về hàm hủy.
// - Mock: nhận sự kiện từ bộ giả lập trong trình duyệt.
// - Thật: SSE tới VITE_REALTIME_URL (mặc định /api/stream). Dùng fetch-event-source vì
//   EventSource gốc không gắn được header Authorization.
export function connectRealtime(onEvent: (e: RealtimeEvent) => void): () => void {
  if (USE_MOCK) {
    let off: () => void = () => {};
    let cancelled = false;
    import('./mock/server').then((m) => {
      if (!cancelled) off = m.subscribeMock(onEvent);
    });
    return () => {
      cancelled = true;
      off();
    };
  }

  const ctrl = new AbortController();
  const url = import.meta.env.VITE_REALTIME_URL || '/api/stream';
  fetchEventSource(url, {
    signal: ctrl.signal,
    // Token lấy lúc mở kết nối; nếu hết hạn thì onopen nhận 401 và dừng hẳn (xem bên dưới)
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    openWhenHidden: true,
    async onopen(res) {
      if (res.ok) return;
      // Token hết hạn/sai: dừng hẳn (không retry vô hạn) và đưa người dùng về trang đăng nhập
      if (res.status === 401 || res.status === 403) {
        notifyUnauthorized();
        throw new FatalStreamError(`SSE ${res.status}`);
      }
      throw new Error(`SSE ${res.status}`); // lỗi tạm thời: để thư viện thử lại
    },
    onmessage(ev) {
      if (!ev.data) return;
      try {
        const evt = normalizeEvent(JSON.parse(ev.data) as BackendEnvelope);
        if (evt) onEvent(evt);
      } catch {
        // bỏ qua sự kiện sai định dạng
      }
    },
    onerror(err) {
      if (err instanceof FatalStreamError) throw err; // dừng, không retry
      // lỗi khác: không throw, thư viện tự kết nối lại
    },
  }).catch(() => {
    // FatalStreamError đã được xử lý ở onopen
  });
  return () => ctrl.abort();
}
