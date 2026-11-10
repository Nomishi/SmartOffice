import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Row, Segmented, Space, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDevices, getEnergy } from '../api/endpoints';
import RangeBar from '../components/RangeBar';
import type { Range } from '../components/RangeBar';
import { toIso } from '../format';
import type { EnergyBucketSize } from '../types';

type Bucket = Exclude<EnergyBucketSize, 'raw'>;
const BUCKET_MS: Record<Bucket, number> = { minute: 60000, hour: 3600000, day: 86400000 };
const BUCKET_FMT: Record<Bucket, string> = { minute: 'HH:mm', hour: 'DD/MM HH:mm', day: 'DD/MM' };
const MAX_BUCKETS = 1000; // giới hạn của API (Contract 8.2)

// Báo cáo năng lượng Node B: điện năng (Wh) và công suất trung bình (W) của đèn và quạt.
export default function EnergyPage() {
  const devicesQ = useQuery({ queryKey: ['devices'], queryFn: getDevices });
  const ctrl = devicesQ.data?.items.find((d) => d.type === 'CONTROL');

  const [range, setRange] = useState<Range>(() => [dayjs().subtract(24, 'hour'), dayjs()]);
  const [bucket, setBucket] = useState<Bucket>('hour');

  const from = toIso(range[0]);
  const to = toIso(range[1]);
  const invalid = !range[1].isAfter(range[0]);
  const count = Math.ceil(range[1].diff(range[0]) / BUCKET_MS[bucket]);
  const tooMany = count > MAX_BUCKETS;
  const enabled = !!ctrl && !invalid && !tooMany;

  const q = useQuery({
    queryKey: ['energy', ctrl?.deviceId, from, to, bucket],
    enabled,
    queryFn: () => getEnergy(ctrl!.deviceId, { from, to, bucket }),
  });

  const data = useMemo(
    () =>
      (q.data?.buckets ?? []).map((b) => ({
        label: dayjs(b.start).format(BUCKET_FMT[bucket]),
        light1Wh: b.light1Wh,
        fan1Wh: b.fan1Wh,
        light1AvgW: b.light1AvgW,
        fan1AvgW: b.fan1AvgW,
      })),
    [q.data, bucket],
  );
  const lightWh = (q.data?.buckets ?? []).reduce((s, b) => s + b.light1Wh, 0);
  const fanWh = (q.data?.buckets ?? []).reduce((s, b) => s + b.fan1Wh, 0);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Báo cáo năng lượng {ctrl ? `– ${ctrl.name}` : ''}</Typography.Title>
      <Space wrap>
        <RangeBar value={range} onChange={setRange} />
        <Segmented
          value={bucket}
          options={[
            { label: 'Theo phút', value: 'minute' },
            { label: 'Theo giờ', value: 'hour' },
            { label: 'Theo ngày', value: 'day' },
          ]}
          onChange={(v) => setBucket(v as Bucket)}
        />
      </Space>
      {invalid && <Alert type="warning" showIcon message="Thời điểm bắt đầu phải trước thời điểm kết thúc" />}
      {tooMany && (
        <Alert type="warning" showIcon message={`Khoảng này có ${count} bucket, vượt giới hạn ${MAX_BUCKETS}. Hãy chọn bucket lớn hơn hoặc rút ngắn khoảng thời gian.`} />
      )}
      {q.isError && <Alert type="error" showIcon message="Không tải được báo cáo năng lượng" />}

      <Row gutter={16}>
        <Col xs={24} md={8}><Card><Statistic title="Tổng điện năng" value={q.data?.totalWh ?? '—'} suffix={q.data ? 'Wh' : undefined} precision={1} /></Card></Col>
        <Col xs={12} md={8}><Card><Statistic title="Đèn" value={q.data ? lightWh : '—'} suffix={q.data ? 'Wh' : undefined} precision={1} /></Card></Col>
        <Col xs={12} md={8}><Card><Statistic title="Quạt" value={q.data ? fanWh : '—'} suffix={q.data ? 'Wh' : undefined} precision={1} /></Card></Col>
      </Row>

      <Card title="Điện năng theo thời gian (Wh)" size="small" loading={q.isLoading && enabled}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={30} />
            <YAxis unit=" Wh" />
            <Tooltip />
            <Legend />
            <Bar dataKey="light1Wh" name="Đèn" stackId="e" fill="#d48806" isAnimationActive={false} />
            <Bar dataKey="fan1Wh" name="Quạt" stackId="e" fill="#1677ff" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Công suất trung bình (W)" size="small" loading={q.isLoading && enabled}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={30} />
            <YAxis unit=" W" />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="light1AvgW" name="Đèn" stroke="#d48806" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="fan1AvgW" name="Quạt" stroke="#1677ff" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </Space>
  );
}
