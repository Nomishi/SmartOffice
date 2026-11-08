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
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Đăng nhập
        </Typography.Title>
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
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
            <Input autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} disabled={cooldown > 0}>
            {cooldown > 0 ? `Thử lại sau ${cooldown} giây` : 'Đăng nhập'}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
