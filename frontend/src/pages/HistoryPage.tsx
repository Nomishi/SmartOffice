import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Row, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDevices, getTelemetry } from '../api/endpoints';
import RangeBar from '../components/RangeBar';
import type { Range } from '../components/RangeBar';
import { QUALITY_COLOR, fmtTime, toIso } from '../format';
import type { LatestTelemetry, Quality } from '../types';

const columns: TableProps<LatestTelemetry>['columns'] = [
  { title: 'Thời điểm', dataIndex: 'receivedAt', render: (v: string) => fmtTime(v) },
  { title: 'Nhiệt độ (°C)', dataIndex: 'temperature' },
  { title: 'Độ ẩm (%)', dataIndex: 'humidity' },
  { title: 'Lux', dataIndex: 'lux' },
  { title: 'Hiện diện', dataIndex: 'presence', render: (v: boolean | undefined) => (v === undefined ? '—' : v ? 'Có' : 'Không') },
  { title: 'airRaw', dataIndex: 'airRaw' },
  { title: 'Chất lượng', dataIndex: 'quality', render: (q: Quality) => <Tag color={QUALITY_COLOR[q]}>{q}</Tag> },
];

// Lịch sử telemetry Node A. Contract: from/to bắt buộc, tối đa 7 ngày/lần, size tối đa 100.
export default function HistoryPage() {
  const devicesQ = useQuery({ queryKey: ['devices'], queryFn: getDevices });
  const env = devicesQ.data?.items.find((d) => d.type === 'ENV');

  const [range, setRangeState] = useState<Range>(() => [dayjs().subtract(1, 'hour'), dayjs()]);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const setRange = (r: Range) => {
    setRangeState(r);
    setPage(0);
  };

  const from = toIso(range[0]);
  const to = toIso(range[1]);
  const invalid = !range[1].isAfter(range[0]);
  const tooLong = range[1].diff(range[0], 'day', true) > 7;
  const enabled = !!env && !invalid && !tooLong;

  // Biểu đồ: 100 bản ghi mới nhất trong khoảng (API chỉ cho tối đa 100 bản ghi/trang)
  const chartQ = useQuery({
    queryKey: ['telemetry', 'chart', env?.deviceId, from, to],
    enabled,
    queryFn: () => getTelemetry(env!.deviceId, { from, to, page: 0, size: 100, sort: 'receivedAt,desc' }),
  });
  const tableQ = useQuery({
    queryKey: ['telemetry', 'table', env?.deviceId, from, to, page, size],
    enabled,
    queryFn: () => getTelemetry(env!.deviceId, { from, to, page, size, sort: 'receivedAt,desc' }),
    placeholderData: keepPreviousData,
  });

  // Bản ghi INVALID bị bỏ khỏi biểu đồ (Contract 5.5: không hiển thị như giá trị hiện tại)
  const chartData = useMemo(
    () =>
      (chartQ.data?.items ?? [])
        .slice()
        .reverse()
        .map((r) => {
          const ok = r.quality !== 'INVALID';
          return {
            time: dayjs(r.receivedAt).format('HH:mm:ss'),
            temperature: ok ? (r.temperature ?? null) : null,
            humidity: ok ? (r.humidity ?? null) : null,
            lux: ok ? (r.lux ?? null) : null,
            airRaw: ok ? (r.airRaw ?? null) : null,
          };
        }),
    [chartQ.data],
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Lịch sử telemetry {env ? `– ${env.name}` : ''}</Typography.Title>
      <RangeBar value={range} onChange={setRange} />
      {invalid && <Alert type="warning" showIcon message="Thời điểm bắt đầu phải trước thời điểm kết thúc" />}
      {tooLong && <Alert type="warning" showIcon message="Mỗi lần chỉ xem tối đa 7 ngày (giới hạn của API)" />}
      {(chartQ.isError || tableQ.isError) && <Alert type="error" showIcon message="Không tải được dữ liệu lịch sử" />}

      <Card title="Biểu đồ" size="small" loading={chartQ.isLoading && enabled}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Vẽ 100 bản ghi mới nhất trong khoảng đã chọn (API giới hạn 100 bản ghi/trang). Xem toàn bộ khoảng ở bảng bên dưới.
        </Typography.Paragraph>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Typography.Text strong>Nhiệt độ và độ ẩm</Typography.Text>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" minTickGap={40} />
                <YAxis yAxisId="t" domain={['auto', 'auto']} unit="°C" />
                <YAxis yAxisId="h" orientation="right" domain={['auto', 'auto']} unit="%" />
                <Tooltip />
                <Legend />
                <Line yAxisId="t" type="monotone" dataKey="temperature" name="Nhiệt độ" stroke="#d4380d" dot={false} isAnimationActive={false} />
                <Line yAxisId="h" type="monotone" dataKey="humidity" name="Độ ẩm" stroke="#1677ff" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Col>
          <Col xs={24} lg={12}>
            <Typography.Text strong>Ánh sáng và không khí</Typography.Text>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" minTickGap={40} />
                <YAxis yAxisId="l" domain={['auto', 'auto']} unit=" lux" />
                <YAxis yAxisId="a" orientation="right" domain={['auto', 'auto']} />
                <Tooltip />
                <Legend />
                <Line yAxisId="l" type="monotone" dataKey="lux" name="Ánh sáng (lux)" stroke="#d48806" dot={false} isAnimationActive={false} />
                <Line yAxisId="a" type="monotone" dataKey="airRaw" name="airRaw (tương đối)" stroke="#389e0d" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Col>
        </Row>
      </Card>

      <Table<LatestTelemetry>
        rowKey="receivedAt"
        size="small"
        loading={tableQ.isFetching}
        columns={columns}
        dataSource={tableQ.data?.items ?? []}
        scroll={{ x: true }}
        pagination={{
          current: page + 1,
          pageSize: size,
          total: tableQ.data?.total ?? 0,
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
