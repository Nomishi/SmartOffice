import { useQuery } from '@tanstack/react-query';
import { Alert, Col, Row, Space, Spin } from 'antd';
import { getDevices } from '../api/endpoints';
import EnvCard from '../components/EnvCard';
import ControlCard from '../components/ControlCard';
import OpenAlertsCard from '../components/OpenAlertsCard';
import { StatusPill } from '../components/ui';

export default function DashboardPage() {
  const q = useQuery({ queryKey: ['devices'], queryFn: getDevices });
  // Thiết bị đã decommission không còn hiển thị trên dashboard
  const devices = (q.data?.items ?? []).filter((d) => d.status !== 'DECOMMISSIONED');
  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="page-head">
        <div>
          <h2 className="page-title">Dashboard{devices[0] ? ` · ${devices[0].roomId}` : ''}</h2>
          <div className="page-sub">Theo dõi môi trường và điều khiển thiết bị theo thời gian thực</div>
        </div>
        {devices.length > 0 && (
          <Space size={8}>
            <StatusPill online={onlineCount > 0} />
            <span className="page-sub" style={{ marginTop: 0 }}>
              {onlineCount}/{devices.length} thiết bị trực tuyến
            </span>
          </Space>
        )}
      </div>
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