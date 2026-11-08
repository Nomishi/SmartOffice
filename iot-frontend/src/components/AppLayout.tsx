import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button, Dropdown, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import ChangePasswordModal from './ChangePasswordModal';

const { Header, Content } = Layout;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  useRealtimeSync();
  const [pwOpen, setPwOpen] = useState(false);
  // Màn hình hẹp (< 768px): thay thanh menu ngang bằng nút ☰ và rút gọn tiêu đề để không tràn ngang
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

  const items = [
    { key: '/', label: <Link to="/">Dashboard</Link> },
    { key: '/alerts', label: <Link to="/alerts">Cảnh báo</Link> },
    { key: '/history', label: <Link to="/history">Lịch sử đo</Link> },
    { key: '/commands', label: <Link to="/commands">Lịch sử lệnh</Link> },
    { key: '/energy', label: <Link to="/energy">Năng lượng</Link> },
    { key: '/devices', label: <Link to="/devices">Thiết bị</Link> },
    { key: '/rules', label: <Link to="/rules">Ngưỡng/Rule</Link> },
    ...(can.viewAudit(user?.role) ? [{ key: '/audit', label: <Link to="/audit">Nhật ký</Link> }] : []),
    ...(can.manageUsers(user?.role) ? [{ key: '/users', label: <Link to="/users">Người dùng</Link> }] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh', minWidth: 0 }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 24, paddingInline: isMobile ? 12 : 50 }}>
        {isMobile && (
          <Dropdown trigger={['click']} menu={{ items, selectedKeys: [location.pathname] }}>
            <Button size="small" aria-label="Mở menu">☰</Button>
          </Dropdown>
        )}
        <Typography.Text strong style={{ color: '#fff', whiteSpace: 'nowrap' }}>
          {isMobile ? '💡 IoT' : 'Phòng làm việc thông minh'}
        </Typography.Text>
        {isMobile ? (
          <div style={{ flex: 1 }} />
        ) : (
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={items}
            style={{ flex: 1, minWidth: 0 }}
          />
        )}
        <Space size={isMobile ? 4 : 8}>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>{user?.role}</Tag>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'pw', label: 'Đổi mật khẩu' },
                { key: 'out', label: 'Đăng xuất', danger: true },
              ],
              onClick: ({ key }) => (key === 'pw' ? setPwOpen(true) : logout()),
            }}
          >
            <Button size="small">{user?.username} ▾</Button>
          </Dropdown>
        </Space>
      </Header>
      <Content style={{ padding: isMobile ? 12 : 24, maxWidth: 1200, width: '100%', margin: '0 auto', minWidth: 0 }}>
        <Outlet />
      </Content>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </Layout>
  );
}
