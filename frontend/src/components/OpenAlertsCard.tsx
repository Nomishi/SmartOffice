import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, List, Space, Tag, Typography, message } from 'antd';
import { ackAlert, getAlerts } from '../api/endpoints';
import { errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { ALERT_LABEL, SEVERITY_COLOR, fmtClock } from '../format';

export default function OpenAlertsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['alerts', 'open-dashboard'],
    queryFn: () => getAlerts({ status: 'OPEN', page: 0, size: 5 }),
  });
  const ack = useMutation({
    mutationFn: (id: number) => ackAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    onError: (e) => message.error(errMsg(e)),
  });

  return (
    <Card title={`Cảnh báo đang mở (${q.data?.total ?? 0})`} extra={<Link to="/alerts">Xem tất cả</Link>} loading={q.isLoading}>
      <List
        dataSource={q.data?.items ?? []}
        locale={{ emptyText: 'Không có cảnh báo nào đang mở' }}
        renderItem={(a) => (
          <List.Item
            actions={
              can.ackAlert(user?.role)
                ? [
                    <Button
                      key="ack"
                      size="small"
                      loading={ack.isPending && ack.variables === a.alertId}
                      onClick={() => ack.mutate(a.alertId)}
                    >
                      Xác nhận
                    </Button>,
                  ]
                : []
            }
          >
            <Space wrap>
              <Tag color={SEVERITY_COLOR[a.severity]}>{a.severity}</Tag>
              <Typography.Text>{ALERT_LABEL[a.type]}</Typography.Text>
              <Typography.Text type="secondary">
                {a.deviceId}
                {a.value !== null ? ` · ${a.value}` : ''} · {fmtClock(a.createdAt)}
              </Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
