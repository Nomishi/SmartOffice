import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Segmented, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { TableProps } from 'antd';
import { getCommands, getDeviceStatus, sendCommand, setMode } from '../api/endpoints';
import { errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { COMMAND_COLOR, fmtClock, show } from '../format';
import type { Command, CommandAction, CommandStatus, CommandTarget, Mode } from '../types';
import { MetricTile, StatusPill, fmtVal } from './ui';
import type { Tone } from './ui';

const columns: TableProps<Command>['columns'] = [
  { title: 'Mã lệnh', dataIndex: 'commandId' },
  { title: 'Đích', dataIndex: 'target' },
  { title: 'Hành động', dataIndex: 'action' },
  { title: 'Trạng thái', dataIndex: 'status', render: (s: CommandStatus) => <Tag color={COMMAND_COLOR[s]}>{s}</Tag> },
  { title: 'Người gửi', dataIndex: 'issuedBy' },
  { title: 'Độ trễ', dataIndex: 'latencyMs', render: (v: number | null | undefined) => (v == null ? '—' : `${v} ms`) },
  { title: 'Lúc', dataIndex: 'issuedAt', render: (v: string) => fmtClock(v) },
];

type SwitchTarget = 'light1' | 'fan1' | 'buzzer1';
const SWITCHES: { target: SwitchTarget; label: string; icon: string; tone: Tone }[] = [
  { target: 'light1', label: 'Đèn', icon: '💡', tone: 'amber' },
  { target: 'fan1', label: 'Quạt', icon: '🌀', tone: 'blue' },
  { target: 'buzzer1', label: 'Còi', icon: '🔔', tone: 'rose' },
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

  const doorOpen = s?.actuators?.door1 === 'OPEN';
  const volt = show(t?.quality, t?.busVoltageV);
  const lightW = show(t?.quality, t?.light1PowerW);
  const fanW = show(t?.quality, t?.fan1PowerW);
  const watts: Record<SwitchTarget, string | number | undefined> = { light1: lightW, fan1: fanW, buzzer1: undefined };

  const switchRow = (a: (typeof SWITCHES)[number]) => {
    const w = watts[a.target];
    return (
      <div key={a.target} className="ctrl-row">
        <div className={`metric-icon tone-${a.tone}`} aria-hidden>{a.icon}</div>
        <div className="ctrl-main">
          <div className="ctrl-name">{a.label}</div>
          <div className="ctrl-sub">{a.target}</div>
        </div>
        {w !== undefined && <div className="ctrl-watt">{w === '—' ? '—' : `${fmtVal(w, 1)} W`}</div>}
        <Tooltip title={reason}>
          <span>
            <Switch
              checked={s?.actuators?.[a.target] === 'ON'}
              loading={pending.has(a.target)}
              disabled={locked}
              checkedChildren="ON"
              unCheckedChildren="OFF"
              onChange={(checked) => cmdMut.mutate({ target: a.target, action: checked ? 'ON' : 'OFF' })}
            />
          </span>
        </Tooltip>
      </div>
    );
  };

  return (
    <Card
      title={<span className="card-title">🎛️ {s?.name ?? deviceId}</span>}
      loading={statusQ.isLoading}
      extra={s && <StatusPill online={s.online} />}
    >
      {statusQ.isError && <Alert type="error" showIcon message="Không tải được dữ liệu thiết bị" style={{ marginBottom: 12 }} />}
      {reason && s && <Alert type="warning" showIcon message={reason} style={{ marginBottom: 12 }} />}

      <div className="mode-bar">
        <div>
          <div className="ctrl-name">Chế độ vận hành</div>
          <div className="ctrl-sub">AUTO: hệ thống tự điều khiển theo rule</div>
        </div>
        <Segmented
          options={['AUTO', 'MANUAL']}
          value={s?.mode}
          disabled={!s || !can.control(user?.role)}
          onChange={(v) => modeMut.mutate(v as Mode)}
        />
      </div>
      {s?.mode === 'MANUAL' && <div className="mode-note">MANUAL: automation không ghi đè lệnh tay.</div>}

      <div className="ctrl-list">
        {SWITCHES.map(switchRow)}
        <div className="ctrl-row">
          <div className={`metric-icon ${doorOpen ? 'tone-orange' : 'tone-gray'}`} aria-hidden>🚪</div>
          <div className="ctrl-main">
            <div className="ctrl-name">Cửa</div>
            <div className="ctrl-sub">door1</div>
          </div>
          <div className="ctrl-actions">
            <Tag color={doorOpen ? 'orange' : 'default'} style={{ marginInlineEnd: 0 }}>{doorOpen ? 'Đang mở' : 'Đang đóng'}</Tag>
            <Button size="small" disabled={locked || doorOpen} loading={pending.has('door1')}
              onClick={() => cmdMut.mutate({ target: 'door1', action: 'OPEN' })}>Mở</Button>
            <Button size="small" disabled={locked || !doorOpen} loading={pending.has('door1')}
              onClick={() => cmdMut.mutate({ target: 'door1', action: 'CLOSE' })}>Đóng</Button>
          </div>
        </div>
      </div>
      <div className="ctrl-foot">Cửa chạy servo nên chờ ACK lâu hơn (tối đa 10 giây).</div>

      <div className="section-title">Điện năng</div>
      <div className="metric-grid auto">
        <MetricTile icon="⚡" tone="violet" label="Điện áp" value={volt} unit="V" digits={1} />
        <MetricTile icon="💡" tone="amber" label="Công suất đèn" value={lightW} unit="W" digits={1} />
        <MetricTile icon="🌀" tone="blue" label="Công suất quạt" value={fanW} unit="W" digits={1} />
      </div>

      <div className="section-title">Lệnh gần đây</div>
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