import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import { getDeviceStatus } from '../api/endpoints';
import { QUALITY_COLOR, fmtClock, show } from '../format';

// Node A (office-env-01): nhiệt độ, độ ẩm, lux, hiện diện, không khí
export default function EnvCard({ deviceId }: { deviceId: string }) {
  const q = useQuery({
    queryKey: ['status', deviceId],
    queryFn: () => getDeviceStatus(deviceId),
    refetchInterval: 10000, // dự phòng khi realtime chưa chạy
  });
  const s = q.data;
  const t = s?.latestTelemetry;
  const sfx = (v: string | number, unit: string) => (v === '—' ? undefined : unit);

  const temp = show(t?.quality, t?.temperature);
  const hum = show(t?.quality, t?.humidity);
  const lux = show(t?.quality, t?.lux);
  const air = show(t?.quality, t?.airRaw);
  const presence =
    !t || t.presence === undefined || t.quality === 'INVALID' ? '—' : t.presence ? 'Có người' : 'Phòng trống';

  return (
    <Card
      title={s?.name ?? deviceId}
      loading={q.isLoading}
      extra={s && <Badge status={s.online ? 'success' : 'default'} text={s.online ? 'Online' : 'Offline'} />}
    >
      {q.isError && <Alert type="error" showIcon message="Không tải được dữ liệu thiết bị" style={{ marginBottom: 12 }} />}
      <Row gutter={[16, 16]}>
        <Col span={12}><Statistic title="Nhiệt độ" value={temp} suffix={sfx(temp, '°C')} /></Col>
        <Col span={12}><Statistic title="Độ ẩm" value={hum} suffix={sfx(hum, '%')} /></Col>
        <Col span={12}><Statistic title="Ánh sáng" value={lux} suffix={sfx(lux, 'lux')} /></Col>
        <Col span={12}><Statistic title="Hiện diện" value={presence} /></Col>
        <Col span={24}><Statistic title="Không khí (airRaw, giá trị tương đối)" value={air} /></Col>
      </Row>
      {t && s && (
        <Space style={{ marginTop: 16 }}>
          <Tag color={QUALITY_COLOR[t.quality]}>{t.quality}</Tag>
          <Typography.Text type="secondary">Cập nhật: {fmtClock(s.lastSeenAt)}</Typography.Text>
        </Space>
      )}
    </Card>
  );
}
