import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { getCommands, getDevices } from '../api/endpoints';
import { COMMAND_COLOR, fmtTime } from '../format';
import type { Command, CommandStatus } from '../types';

const columns: TableProps<Command>['columns'] = [
  { title: 'Mã lệnh', dataIndex: 'commandId' },
  { title: 'Đích', dataIndex: 'target' },
  { title: 'Hành động', dataIndex: 'action' },
  { title: 'Trạng thái', dataIndex: 'status', render: (s: CommandStatus) => <Tag color={COMMAND_COLOR[s]}>{s}</Tag> },
  { title: 'Người gửi', dataIndex: 'issuedBy' },
  { title: 'Gửi lúc', dataIndex: 'issuedAt', render: (v: string) => fmtTime(v) },
  { title: 'ACK lúc', dataIndex: 'ackAt', render: (v: string | null | undefined) => fmtTime(v) },
  { title: 'Độ trễ', dataIndex: 'latencyMs', render: (v: number | null | undefined) => (v == null ? '—' : `${v} ms`) },
];

// Lịch sử lệnh điều khiển của một thiết bị CONTROL (kể cả lệnh TIMEOUT/FAILED).
export default function CommandsPage() {
  const devicesQ = useQuery({ queryKey: ['devices'], queryFn: getDevices });
  const controls = (devicesQ.data?.items ?? []).filter((d) => d.type === 'CONTROL');
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const deviceId = selected ?? controls[0]?.deviceId;

  // key bắt đầu bằng ['commands'] nên tự làm mới khi có sự kiện realtime 'command'
  const q = useQuery({
    queryKey: ['commands', deviceId, 'page', page, size],
    enabled: !!deviceId,
    queryFn: () => getCommands(deviceId!, page, size),
    placeholderData: keepPreviousData,
  });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Lịch sử lệnh</Typography.Title>
      <Select
        style={{ minWidth: 260 }}
        value={deviceId}
        placeholder="Chọn thiết bị"
        options={controls.map((d) => ({ value: d.deviceId, label: `${d.name} (${d.deviceId})` }))}
        onChange={(v) => {
          setSelected(v);
          setPage(0);
        }}
      />
      {q.isError && <Alert type="error" showIcon message="Không tải được lịch sử lệnh" />}
      <Table<Command>
        rowKey="commandId"
        size="small"
        loading={q.isFetching}
        columns={columns}
        dataSource={q.data?.items ?? []}
        scroll={{ x: true }}
        locale={{ emptyText: 'Chưa có lệnh nào' }}
        pagination={{
          current: page + 1,
          pageSize: size,
          total: q.data?.total ?? 0,
          showTotal: (t) => `${t} lệnh`,
          onChange: (p, s) => {
            setPage(p - 1);
            setSize(s);
          },
        }}
      />
    </Space>
  );
}
