import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useAuth } from '../auth/AuthContext';
import { ApiError, errMsg } from '../api/client';
import { USE_MOCK } from '../config';

interface FormValues {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0); // giây còn lại khi bị giới hạn tần suất (429)

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
  if (user) return <Navigate to={from} replace />;

  const onFinish = async (v: FormValues) => {
    setLoading(true);
    setError(null);
    try {
      await login(v.username, v.password);
      navigate(from, { replace: true });
    } catch (e) {
      setError(errMsg(e));
      if (e instanceof ApiError && e.code === 'RATE_LIMITED') setCooldown(e.retryAfterSec ?? 30);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <aside className="login-hero">
        <div className="brand">
          <span className="brand-logo" aria-hidden>💡</span>
          <span>Phòng làm việc thông minh</span>
        </div>
        <div>
          <h1>Giám sát và điều khiển phòng làm việc, mọi lúc mọi nơi</h1>
          <p>Theo dõi nhiệt độ, độ ẩm, ánh sáng, chất lượng không khí và điều khiển đèn, quạt, cửa theo thời gian thực.</p>
          <ul className="login-features">
            <li><span className="dot" aria-hidden>📈</span>Số liệu cảm biến cập nhật liên tục</li>
            <li><span className="dot" aria-hidden>🎛️</span>Điều khiển thiết bị, chế độ AUTO / MANUAL</li>
            <li><span className="dot" aria-hidden>🔔</span>Cảnh báo tức thì khi vượt ngưỡng</li>
          </ul>
        </div>
        <div className="login-foot">SmartOffice · IoT</div>
      </aside>
      <main className="login-form-side">
        <Card className="login-card">
          <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
            Chào mừng trở lại
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
            Đăng nhập để tiếp tục
          </Typography.Paragraph>
          {USE_MOCK && (
            <Alert
              style={{ marginBottom: 16 }}
              type="info"
              showIcon
              message="Đang chạy dữ liệu giả"
              description="admin / admin123, operator1 / operator123, viewer1 / viewer123"
            />
          )}
          {error && <Alert style={{ marginBottom: 16 }} type="error" showIcon message={error} />}
          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
              <Input autoFocus autoComplete="username" prefix={<span aria-hidden>👤</span>} />
            </Form.Item>
            <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
              <Input.Password autoComplete="current-password" prefix={<span aria-hidden>🔒</span>} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} disabled={cooldown > 0}>
              {cooldown > 0 ? `Thử lại sau ${cooldown} giây` : 'Đăng nhập'}
            </Button>
          </Form>
        </Card>
      </main>
    </div>
  );
}