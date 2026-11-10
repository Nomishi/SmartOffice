import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { getAuditLogs } from '../api/endpoints';
import { AUDIT_ACTION_LABEL, fmtTime } from '../format';
import type { AuditLog } from '../types';

const columns: TableProps<AuditLog>['columns'] = [
  { title: 'Thời điểm', dataIndex: 'timestamp', render: (v: string) => fmtTime(v) },
  {
    title: 'Người thực hiện',
    render: (_: unknown, r: AuditLog) => r.username ?? (r.userId !== null ? `user-${r.userId}` : '—'),
  },
  { title: 'Hành động', dataIndex: 'action', render: (a: string) => AUDIT_ACTION_LABEL[a] ?? a },
  { title: 'Đối tượng', dataIndex: 'target', render: (v: string | null) => v ?? '—' },
  {
    title: 'Kết quả',
    dataIndex: 'result',
    render: (r: AuditLog['result']) => {
      if (r === 'SUCCESS') return <Tag color="green">Thành công</Tag>;
      if (r === 'FAILURE' || r === 'FAILED') return <Tag color="red">Thất bại</Tag>;
      if (r === 'PENDING') return <Tag color="blue">Đang chờ</Tag>;
      return <Tag>{r ?? '—'}</Tag>;
    },
  },
];

// Nhật ký thao tác: ai làm gì, lúc nào, kết quả ra sao (truy vết, Contract mục 9 và 10).
// Admin xem toàn bộ; Operator "giới hạn": mock hiểu là chỉ thấy thao tác của chính mình.
export default function AuditPage() {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const q = useQuery({
    queryKey: ['audit', page, size],
    queryFn: () => getAuditLogs(page, size),
    placeholderData: keepPreviousData,
  });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Nhật ký thao tác</Typography.Title>
        <Button onClick={() => q.refetch()} loading={q.isFetching}>Làm mới</Button>
      </Space>
      {q.isError && <Alert type="error" showIcon message="Không tải được nhật ký thao tác" />}
      <Table<AuditLog>
        rowKey="logId"
        size="small"
        loading={q.isLoading}
        columns={columns}
        dataSource={q.data?.items ?? []}
        scroll={{ x: true }}
        locale={{ emptyText: 'Chưa có thao tác nào' }}
        pagination={{
          current: page + 1,
          pageSize: size,
          total: q.data?.total ?? 0,
          showTotal: (t) => `${t} bản ghi`,
          onChange: (p, s) => {
            setPage(p - 1);
            setSize(s);
          },
        }}
      />
    </Space>
  );
}
