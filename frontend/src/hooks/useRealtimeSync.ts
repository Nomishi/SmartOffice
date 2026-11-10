import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { connectRealtime } from '../realtime';
import type { DeviceStatusDetail, RealtimeEvent } from '../types';

// Mở một kết nối realtime duy nhất cho cả ứng dụng và đẩy sự kiện vào cache của React Query.
// Component chỉ cần useQuery như bình thường, dữ liệu tự cập nhật.
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const handle = (e: RealtimeEvent) => {
      if (e.type === 'telemetry') {
        qc.setQueryData<DeviceStatusDetail>(['status', e.deviceId], (old) =>
          old
            ? {
                ...old,
                online: true,
                lastSeenAt: e.data.receivedAt,
                latestTelemetry: { ...(old.latestTelemetry ?? {}), ...e.data },
              }
            : old,
        );
      } else if (e.type === 'status') {
        qc.setQueryData<DeviceStatusDetail>(['status', e.deviceId], (old) =>
          old
            ? {
                ...old,
                online: e.online ?? old.online,
                mode: e.mode ?? old.mode,
                actuators: e.actuators ?? old.actuators,
              }
            : old,
        );
      } else if (e.type === 'command') {
        qc.invalidateQueries({ queryKey: ['commands'] });
        // Backend chỉ gửi sự kiện command; trạng thái actuator mới (sau ACK) lấy lại từ /status
        if (e.command.deviceId && e.command.status !== 'PENDING') {
          qc.invalidateQueries({ queryKey: ['status', e.command.deviceId] });
        }
      } else if (e.type === 'alert') {
        qc.invalidateQueries({ queryKey: ['alerts'] });
        // Mất kết nối (LWT) / SENSOR_FAULT làm đổi online/status của thiết bị nhưng không có sự kiện status riêng
        qc.invalidateQueries({ queryKey: ['status', e.alert.deviceId] });
        qc.invalidateQueries({ queryKey: ['devices'] });
      } else if (e.type === 'config') {
        // Kết quả ACK cấu hình thiết bị
        const text = `Cấu hình ${e.configId} trên ${e.deviceId}: ${e.status}`;
        if (e.status === 'SUCCESS') message.success(text);
        else if (e.status === 'PENDING') message.info(text);
        else message.error(text);
      }
    };
    return connectRealtime(handle);
  }, [qc]);
}
