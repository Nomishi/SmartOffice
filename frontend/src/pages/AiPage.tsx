import { useEffect, useRef, useState } from 'react';
import { Alert as AntAlert, Avatar, Button, Card, Input, Select, Space, Tag, Typography, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { askAi, getDevices } from '../api/endpoints';
import { ApiError, errMsg } from '../api/client';
import { fmtTime } from '../format';
import type { AiChatMessage } from '../types';

const WELCOME: AiChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Xin chào, mình là trợ lý AI của SmartOffice. Mình có thể giải thích trạng thái phòng, cảnh báo, xu hướng 24 giờ và lịch sử năng lượng dựa trên dữ liệu backend. Mình chỉ tư vấn, không tự điều khiển thiết bị.',
};

const SUGGESTIONS = [
  'Tóm tắt tình trạng phòng hiện tại',
  'Có cảnh báo nào đang mở?',
  'Nhiệt độ 24 giờ qua có bất thường không?',
  'Thiết bị nào đang offline?',
  'Vì sao có cảnh báo ENERGY_WASTE?',
];

export default function AiPage() {
  const [messages, setMessages] = useState<AiChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const devices = useQuery({
    queryKey: ['devices', 'ai-selector'],
    queryFn: () => getDevices(),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function send(text = input) {
    const value = text.trim();
    if (!value || loading) return;
    if (value.length > 2000) {
      message.error('Câu hỏi tối đa 2000 ký tự');
      return;
    }

    const history = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMessage: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: value,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const result = await askAi(value, deviceId, history);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          model: result.model,
          generatedAt: result.generatedAt,
        },
      ]);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'AI_UNAVAILABLE') {
          setError('AI chưa được bật. Cần cấu hình AI_ENABLED=true và AI_BASE_URL/AI_MODEL ở backend; provider cloud cần thêm AI_API_KEY.');
        } else if (e.code === 'AI_UPSTREAM_ERROR') {
          setError('AI provider đang lỗi hoặc timeout. Thử lại sau.');
        } else if (e.code === 'NOT_FOUND') {
          setError('Không tìm thấy thiết bị đã chọn.');
        } else {
          setError(errMsg(e));
        }
      } else {
        setError(errMsg(e));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Trợ lý AI</Typography.Title>
          <Typography.Text type="secondary">
            Hỏi về trạng thái phòng, cảnh báo, xu hướng 24 giờ và năng lượng. AI chỉ tư vấn, không tự gửi lệnh điều khiển.
          </Typography.Text>
        </div>
        <Button
          disabled={loading || messages.length <= 1}
          onClick={() => {
            setMessages([WELCOME]);
            setError(null);
          }}
        >
          Xóa hội thoại
        </Button>
      </div>

      <Card size="small">
        <Space wrap>
          <Typography.Text strong>Phạm vi dữ liệu:</Typography.Text>
          <Select
            allowClear
            style={{ minWidth: 260 }}
            placeholder="Toàn hệ thống"
            value={deviceId}
            loading={devices.isLoading}
            onChange={(value) => setDeviceId(value)}
            options={(devices.data?.items ?? []).map((d) => ({
              value: d.deviceId,
              label: `${d.name} (${d.deviceId})`,
            }))}
          />
          <Typography.Text type="secondary">
            AI nhận tối đa 8 tin gần nhất để hiểu câu hỏi nối tiếp.
          </Typography.Text>
        </Space>
      </Card>

      {error && <AntAlert type="warning" showIcon message={error} closable onClose={() => setError(null)} />}

      <Card bodyStyle={{ padding: 0 }}>
        <div style={{ height: 430, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 8,
                }}
              >
                {m.role === 'assistant' && <Avatar style={{ background: '#4f46e5', flex: '0 0 auto' }}>AI</Avatar>}
                <div
                  style={{
                    maxWidth: '78%',
                    background: m.role === 'user' ? '#4f46e5' : '#ffffff',
                    color: m.role === 'user' ? '#ffffff' : '#1e2433',
                    border: m.role === 'assistant' ? '1px solid #e8ecf4' : 'none',
                    borderRadius: 12,
                    padding: '10px 12px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.55,
                  }}
                >
                  {m.content}
                  {m.role === 'assistant' && (m.model || m.generatedAt) && (
                    <div style={{ marginTop: 8 }}>
                      <Space size={6} wrap>
                        {m.model && <Tag color="geekblue">{m.model}</Tag>}
                        {m.generatedAt && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(m.generatedAt)}</Typography.Text>}
                      </Space>
                    </div>
                  )}
                </div>
                {m.role === 'user' && <Avatar style={{ background: '#0f766e', flex: '0 0 auto' }}>Bạn</Avatar>}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Avatar style={{ background: '#4f46e5' }}>AI</Avatar>
                <div style={{ background: '#ffffff', border: '1px solid #e8ecf4', borderRadius: 12, padding: '10px 12px' }}>
                  <Typography.Text type="secondary">AI đang phân tích...</Typography.Text>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </Space>
        </div>

        <div style={{ padding: 16, borderTop: '1px solid #e8ecf4', background: '#ffffff' }}>
          <Space wrap style={{ marginBottom: 10 }}>
            {SUGGESTIONS.map((s) => (
              <Button key={s} size="small" disabled={loading} onClick={() => send(s)}>
                {s}
              </Button>
            ))}
          </Space>
          <Space.Compact style={{ width: '100%', alignItems: 'flex-end' }}>
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              autoSize={{ minRows: 2, maxRows: 5 }}
              maxLength={2000}
              showCount
              placeholder="Hỏi AI về phòng làm việc... (Enter để gửi, Shift+Enter xuống dòng)"
              disabled={loading}
            />
            <Button type="primary" onClick={() => send()} loading={loading} style={{ height: 54, marginLeft: 8 }}>
              Gửi
            </Button>
          </Space.Compact>
        </div>
      </Card>
    </Space>
  );
}
