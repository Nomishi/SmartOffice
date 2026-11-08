import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Col, Row, Segmented, Space, Statistic, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { TableProps } from 'antd';
import { getCommands, getDeviceStatus, sendCommand, setMode } from '../api/endpoints';
import { errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { COMMAND_COLOR, fmtClock, show } from '../format';
import type { Command, CommandAction, CommandStatus, CommandTarget, Mode } from '../types';

const columns: TableProps<Command>['columns'] = [
  { title: 'Mã lệnh', dataIndex: 'commandId' },
  { title: 'Đích', dataIndex: 'target' },
  { title: 'Hành động', dataIndex: 'action' },
  { title: 'Trạng thái', dataIndex: 'status', render: (s: CommandStatus) => <Tag color={COMMAND_COLOR[s]}>{s}</Tag> },
  { title: 'Người gửi', dataIndex: 'issuedBy' },
  { title: 'Độ trễ', dataIndex: 'latencyMs', render: (v: number | null | undefined) => (v == null ? '—' : `${v} ms`) },
  { title: 'Lúc', dataIndex: 'issuedAt', render: (v: string) => fmtClock(v) },
];

// Node B (office-ctrl-01): đèn, quạt, còi, cửa, chế độ AUTO/MANUAL, công suất
export default function ControlCard({ deviceId }: { deviceId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['status', deviceId],
    queryFn: () => getDeviceStatus(deviceId),
    refetchInterval: 10000,
  });
  // Còn lệnh PENDING thì hỏi lại mỗi 2 giây cho tới khi có ACK/TIMEOUT
  const cmdQ = useQuery({
    queryKey: ['commands', deviceId],
    queryFn: () => getCommands(deviceId, 0, 10),
    refetchInterval: (query) => (query.state.data?.items.some((c) => c.status === 'PENDING') ? 2000 : false),
  });

  const s = statusQ.data;
  const t = s?.latestTelemetry;
  const pending = new Set<string>((cmdQ.data?.items ?? []).filter((c) => c.status === 'PENDING').map((c) => c.target));

  let reason = '';
  if (!can.control(user?.role)) reason = 'Viewer chỉ được xem';
  else if (s && !s.online) reason = 'Thiết bị đang offline';
  else if (s && s.status !== 'ACTIVE') reason = `Thiết bị ở trạng thái ${s.status}`;
  const locked = !s || !!reason;

  const cmdMut = useMutation({
    mutationFn: (v: { target: CommandTarget; action: CommandAction }) => sendCommand(deviceId, v.target, v.action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commands', deviceId] }),
    onError: (e) => message.error(errMsg(e)),
  });
  const modeMut = useMutation({
    mutationFn: (m: Mode) => setMode(deviceId, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', deviceId] }),
    onError: (e) => message.error(errMsg(e)),
  });

  const switchRow = (label: string, target: 'light1' | 'fan1' | 'buzzer1') => (
    <div key={target} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <Typography.Text>{label}</Typography.Text>
      <Tooltip title={reason}>
        <span>
          <Switch
            checked={s?.actuators?.[target] === 'ON'}
            loading={pending.has(target)}
            disabled={locked}
            checkedChildren="ON"
            unCheckedChildren="OFF"
            onChange={(checked) => cmdMut.mutate({ target, action: checked ? 'ON' : 'OFF' })}
          />
        </span>
      </Tooltip>
    </div>
  );

  const doorOpen = s?.actuators?.door1 === 'OPEN';
  const volt = show(t?.quality, t?.busVoltageV);
  const lightW = show(t?.quality, t?.light1PowerW);
  const fanW = show(t?.quality, t?.fan1PowerW);

  return (
    <Card
      title={s?.name ?? deviceId}
      loading={statusQ.isLoading}
      extra={s && <Badge status={s.online ? 'success' : 'default'} text={s.online ? 'Online' : 'Offline'} />}
    >
      {statusQ.isError && <Alert type="error" showIcon message="Không tải được dữ liệu thiết bị" style={{ marginBottom: 12 }} />}
      {reason && s && <Alert type="warning" showIcon message={reason} style={{ marginBottom: 12 }} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>Chế độ</Typography.Text>
        <Segmented
          options={['AUTO', 'MANUAL']}
          value={s?.mode}
          disabled={!s || !can.control(user?.role)}
          onChange={(v) => modeMut.mutate(v as Mode)}
        />
      </div>
      {s?.mode === 'MANUAL' && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          MANUAL: automation không ghi đè lệnh tay.
        </Typography.Paragraph>
      )}

      {switchRow('Đèn (light1)', 'light1')}
      {switchRow('Quạt (fan1)', 'fan1')}
      {switchRow('Còi (buzzer1)', 'buzzer1')}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
        <Typography.Text>Cửa (door1)</Typography.Text>
        <Space>
          <Tag color={doorOpen ? 'orange' : 'default'}>{doorOpen ? 'Đang mở' : 'Đang đóng'}</Tag>
          <Button size="small" disabled={locked || doorOpen} loading={pending.has('door1')}
            onClick={() => cmdMut.mutate({ target: 'door1', action: 'OPEN' })}>Mở</Button>
          <Button size="small" disabled={locked || !doorOpen} loading={pending.has('door1')}
            onClick={() => cmdMut.mutate({ target: 'door1', action: 'CLOSE' })}>Đóng</Button>
        </Space>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Cửa chạy servo nên chờ ACK lâu hơn (tối đa 10 giây).
      </Typography.Text>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}><Statistic title="Điện áp" value={volt} precision={1} suffix={volt === '—' ? undefined : 'V'} /></Col>
        <Col span={8}><Statistic title="Công suất đèn" value={lightW} precision={1} suffix={lightW === '—' ? undefined : 'W'} /></Col>
        <Col span={8}><Statistic title="Công suất quạt" value={fanW} precision={1} suffix={fanW === '—' ? undefined : 'W'} /></Col>
      </Row>

      <Typography.Title level={5} style={{ marginTop: 20 }}>Lệnh gần đây</Typography.Title>
      <Table<Command>
        size="small"
        rowKey="commandId"
        columns={columns}
        dataSource={cmdQ.data?.items ?? []}
        pagination={false}
        scroll={{ x: true }}
        locale={{ emptyText: 'Chưa có lệnh nào' }}
      />
    </Card>
  );
}
