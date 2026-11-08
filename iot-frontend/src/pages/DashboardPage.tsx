import { useQuery } from '@tanstack/react-query';
import { Alert, Col, Row, Space, Spin, Typography } from 'antd';
import { getDevices } from '../api/endpoints';
import EnvCard from '../components/EnvCard';
import ControlCard from '../components/ControlCard';
import OpenAlertsCard from '../components/OpenAlertsCard';

export default function DashboardPage() {
  const q = useQuery({ queryKey: ['devices'], queryFn: getDevices });
  // Thiết bị đã decommission không còn hiển thị trên dashboard
  const devices = (q.data?.items ?? []).filter((d) => d.status !== 'DECOMMISSIONED');

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Dashboard {devices[0] ? `– ${devices[0].roomId}` : ''}
      </Typography.Title>
      {q.isLoading && <Spin />}
      {q.isError && <Alert type="error" showIcon message="Không tải được danh sách thiết bị" />}
      <Row gutter={[16, 16]}>
        {devices.map((d) => (
          <Col xs={24} lg={12} key={d.deviceId}>
            {d.type === 'ENV' ? <EnvCard deviceId={d.deviceId} /> : <ControlCard deviceId={d.deviceId} />}
          </Col>
        ))}
      </Row>
      <OpenAlertsCard />
    </Space>
  );
}
