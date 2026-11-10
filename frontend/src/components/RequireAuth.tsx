import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Result } from 'antd';
import { useAuth } from '../auth/AuthContext';
import type { Role } from '../types';

// Chưa đăng nhập -> /login. Có `roles` mà sai role -> trang 403.
export default function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="Bạn không có quyền truy cập trang này."
        extra={<Button href="/">Về trang chủ</Button>}
      />
    );
  }
  return <Outlet />;
}
