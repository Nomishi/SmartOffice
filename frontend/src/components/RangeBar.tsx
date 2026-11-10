import { Button, DatePicker, Space } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

export type Range = [Dayjs, Dayjs];

const PRESETS: { label: string; hours: number }[] = [
  { label: '1 giờ', hours: 1 },
  { label: '6 giờ', hours: 6 },
  { label: '24 giờ', hours: 24 },
  { label: '7 ngày', hours: 168 },
];

// Chọn khoảng thời gian: nút nhanh + chọn tay
export default function RangeBar({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <Space wrap>
      {PRESETS.map((p) => (
        <Button
          key={p.label}
          size="small"
          onClick={() => {
            const now = dayjs();
            onChange([now.subtract(p.hours, 'hour'), now]);
          }}
        >
          {p.label}
        </Button>
      ))}
      <DatePicker.RangePicker
        showTime
        allowClear={false}
        format="DD/MM/YYYY HH:mm"
        value={value}
        onChange={(v) => {
          if (v && v[0] && v[1]) onChange([v[0], v[1]]);
        }}
      />
    </Space>
  );
}
