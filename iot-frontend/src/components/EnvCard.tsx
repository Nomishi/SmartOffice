import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Space, Tag, Typography } from 'antd';
import { getDeviceStatus } from '../api/endpoints';
import { QUALITY_COLOR, fmtClock, show } from '../format';
import { MetricTile, StatusPill } from './ui';

// Node A (office-env-01): nhiệt độ, độ ẩm, lux, hiện diện, không khí
export default function EnvCard({ deviceId }: { deviceId: string }) {
  const q = useQuery({
    queryKey: ['status', deviceId],
    queryFn: () => getDeviceStatus(deviceId),
    refetchInterval: 10000, // dự phòng khi realtime chưa chạy
  });
  const s = q.data;
  const t = s?.latestTelemetry;

  const temp = show(t?.quality, t?.temperature);
  const hum = show(t?.quality, t?.humidity);
  const lux = show(t?.quality, t?.lux);
  const air = show(t?.quality, t?.airRaw);
  const hasPresence = !!t && t.presence !== undefined && t.quality !== 'INVALID';
  const presence = !hasPresence ? '—' : t?.presence ? 'Có người' : 'Phòng trống';

  return (
    <Card
      title={<span className="card-title">🌡️ {s?.name ?? deviceId}</span>}
      loading={q.isLoading}
      extra={s && <StatusPill online={s.online} />}
    >
      {q.isError && <Alert type="error" showIcon message="Không tải được dữ liệu thiết bị" style={{ marginBottom: 12 }} />}
      <div className="metric-grid">
        <MetricTile icon="🌡️" tone="orange" label="Nhiệt độ" value={temp} unit="°C" digits={1} />
        <MetricTile icon="💧" tone="blue" label="Độ ẩm" value={hum} unit="%" digits={1} />
        <MetricTile icon="☀️" tone="amber" label="Ánh sáng" value={lux} unit="lux" digits={1} />
        <MetricTile
          icon={hasPresence && t?.presence ? '🧑‍💼' : '🪑'}
          tone={hasPresence && t?.presence ? 'green' : 'gray'}
          label="Hiện diện"
          value={presence}
        />
        <MetricTile icon="🍃" tone="violet" label="Không khí" value={air} hint="airRaw, giá trị tương đối" wide />
      </div>
      {t && s && (
        <Space style={{ marginTop: 16 }}>
          <Tag color={QUALITY_COLOR[t.quality]} style={{ marginInlineEnd: 0 }}>{t.quality}</Tag>
          <Typography.Text type="secondary">Cập nhật: {fmtClock(s.lastSeenAt)}</Typography.Text>
        </Space>
      )}
    </Card>
  );
}