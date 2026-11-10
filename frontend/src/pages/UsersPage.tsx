import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { TableProps } from 'antd';
import { createUser, getUsers } from '../api/endpoints';
import { errDetails, errMsg } from '../api/client';
import { fmtTime } from '../format';
import type { CreateUserInput, Role, User } from '../types';

const columns: TableProps<User>['columns'] = [
  { title: 'ID', dataIndex: 'userId' },
  { title: 'Tên đăng nhập', dataIndex: 'username' },
  { title: 'Vai trò', dataIndex: 'role', render: (r: Role) => <Tag color="blue">{r}</Tag> },
  { title: 'Trạng thái', dataIndex: 'accountStatus' },
  { title: 'Tạo lúc', dataIndex: 'createdAt', render: (v: string | undefined) => fmtTime(v) },
];

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<CreateUserInput>();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (v: CreateUserInput) => createUser(v),
    onSuccess: (u) => {
      message.success(`Đã tạo người dùng ${u.username}`);
      qc.invalidateQueries({ queryKey: ['users'] });
      form.resetFields();
      onClose();
    },
    onError: (e) => message.error([errMsg(e), errDetails(e)].filter(Boolean).join(': ')),
  });

  return (
    <Modal
      title="Tạo người dùng"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Tạo"
      cancelText="Hủy"
      confirmLoading={mut.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={{ role: 'VIEWER' }} onFinish={(v) => mut.mutate(v)}>
        <Form.Item
          name="username"
          label="Tên đăng nhập"
          rules={[{ required: true, message: 'Nhập tên đăng nhập' }, { min: 3, message: 'Tối thiểu 3 ký tự' }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Mật khẩu"
          rules={[{ required: true, message: 'Nhập mật khẩu' }, { min: 8, message: 'Tối thiểu 8 ký tự' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'ADMIN', label: 'ADMIN' },
              { value: 'OPERATOR', label: 'OPERATOR' },
              { value: 'VIEWER', label: 'VIEWER' },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Chỉ Admin vào được (xem App.tsx). TODO: đổi vai trò, khóa tài khoản (Contract chưa có endpoint).
export default function UsersPage() {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['users', page, size], queryFn: () => getUsers(page, size) });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Người dùng</Typography.Title>
        <Button type="primary" onClick={() => setCreating(true)}>Tạo người dùng</Button>
      </Space>
      <Table<User>
        rowKey="userId"
        loading={q.isLoading}
        columns={columns}
        dataSource={q.data?.items ?? []}
        pagination={{
          current: page + 1,
          pageSize: size,
          total: q.data?.total ?? 0,
          onChange: (p, s) => {
            setPage(p - 1);
            setSize(s);
          },
        }}
      />
      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
    </Space>
  );
}
