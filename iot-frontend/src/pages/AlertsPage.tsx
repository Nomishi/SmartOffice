import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Segmented, Space, Table, Tag, Typography, message } from 'antd';
import type { TableProps } from 'antd';
import { ackAlert, getAlerts } from '../api/endpoints';
import { errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { ALERT_LABEL, SEVERITY_COLOR, fmtTime } from '../format';
import type { Alert, AlertStatus, AlertType, Severity } from '../types';

type Filter = 'ALL' | AlertStatus;

export default function AlertsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);

  const q = useQuery({
    queryKey: ['alerts', { filter, page, size }],
    queryFn: () => getAlerts({ status: filter === 'ALL' ? undefined : filter, page, size }),
  });
  const ack = useMutation({
    mutationFn: (id: number) => ackAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    onError: (e) => message.error(errMsg(e)),
  });

  const columns: TableProps<Alert>['columns'] = [
    { title: 'Loại', dataIndex: 'type', render: (t: AlertType) => ALERT_LABEL[t] },
    { title: 'Mức độ', dataIndex: 'severity', render: (s: Severity) => <Tag color={SEVERITY_COLOR[s]}>{s}</Tag> },
    { title: 'Thiết bị', dataIndex: 'deviceId' },
    {
      title: 'Giá trị / ngưỡng',
      render: (_: unknown, a: Alert) => (a.value === null ? '—' : `${a.value} / ${a.threshold ?? '—'}`),
    },
    { title: 'Thời điểm', dataIndex: 'createdAt', render: (v: string) => fmtTime(v) },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (s: AlertStatus) => <Tag color={s === 'OPEN' ? 'red' : 'default'}>{s === 'OPEN' ? 'Đang mở' : 'Đã xác nhận'}</Tag>,
    },
    {
      title: '',
      render: (_: unknown, a: Alert) =>
        a.status === 'OPEN' && can.ackAlert(user?.role) ? (
          <Button size="small" loading={ack.isPending && ack.variables === a.alertId} onClick={() => ack.mutate(a.alertId)}>
            Xác nhận
          </Button>
        ) : null,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Cảnh báo</Typography.Title>
      <Segmented
        value={filter}
        options={[
          { label: 'Đang mở', value: 'OPEN' },
          { label: 'Đã xác nhận', value: 'ACKNOWLEDGED' },
          { label: 'Tất cả', value: 'ALL' },
        ]}
        onChange={(v) => {
          setFilter(v as Filter);
          setPage(0);
        }}
      />
      <Table<Alert>
        rowKey="alertId"
        loading={q.isLoading}
        columns={columns}
        dataSource={q.data?.items ?? []}
        scroll={{ x: true }}
        pagination={{
          current: page + 1,
          pageSize: size,
          total: q.data?.total ?? 0,
          onChange: (p, s) => {
            setPage(p - 1);
            setSize(s);
          },
        }}
      />
    </Space>
  );
}
