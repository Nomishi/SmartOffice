import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { TableProps } from 'antd';
import { activateDevice, createDevice, decommissionDevice, getDevices, lockDevice } from '../api/endpoints';
import { errDetails, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import DeviceConfigModal from '../components/DeviceConfigModal';
import { DEVICE_STATUS_COLOR, fmtTime } from '../format';
import { CAN_ACTIVATE, CAN_DECOMMISSION, CAN_LOCK } from '../lifecycle';
import type { Device, DeviceStatus, RegisterDeviceInput } from '../types';

type Op = 'activate' | 'lock' | 'decommission';

function RegisterDeviceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<RegisterDeviceInput>();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (v: RegisterDeviceInput) => createDevice(v),
    onSuccess: (d) => {
      message.success(`Đã đăng ký ${d.deviceId} (trạng thái ${d.status})`);
      qc.invalidateQueries({ queryKey: ['devices'] });
      form.resetFields();
      onClose();
    },
    onError: (e) => message.error([errMsg(e), errDetails(e)].filter(Boolean).join(': ')),
  });

  return (
    <Modal
      title="Đăng ký thiết bị"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Đăng ký"
      cancelText="Hủy"
      confirmLoading={mut.isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ type: 'ENV', roomId: 'room-01' }}
        onFinish={(v) => mut.mutate(v)}
      >
        <Form.Item
          name="deviceId"
          label="Mã thiết bị (deviceId)"
          extra="Dùng làm tên đăng nhập MQTT và trong topic. Ví dụ: office-env-02"
          rules={[
            { required: true, message: 'Nhập mã thiết bị' },
            { pattern: /^[a-z0-9-]{3,40}$/, message: 'Chỉ gồm chữ thường, số, dấu gạch ngang (3–40 ký tự)' },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="name" label="Tên hiển thị" rules={[{ required: true, message: 'Nhập tên thiết bị' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'ENV', label: 'ENV – Node cảm biến môi trường' },
              { value: 'CONTROL', label: 'CONTROL – Node điều khiển' },
            ]}
          />
        </Form.Item>
        <Form.Item name="roomId" label="Phòng" rules={[{ required: true, message: 'Nhập mã phòng' }]}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function DevicesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['devices'], queryFn: getDevices });
  const [registering, setRegistering] = useState(false);
  const [configuring, setConfiguring] = useState<Device | null>(null);

  const op = useMutation({
    mutationFn: (v: { id: string; kind: Op }) =>
      v.kind === 'activate' ? activateDevice(v.id) : v.kind === 'lock' ? lockDevice(v.id) : decommissionDevice(v.id),
    onSuccess: (d) => {
      message.success(`${d.deviceId}: ${d.status}`);
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['status', d.deviceId] });
    },
    onError: (e) => message.error(errMsg(e)),
  });
  const busy = (id: string) => op.isPending && op.variables?.id === id;

  const columns: TableProps<Device>['columns'] = [
    { title: 'Mã', dataIndex: 'deviceId' },
    { title: 'Tên', dataIndex: 'name' },
    { title: 'Loại', dataIndex: 'type' },
    { title: 'Phòng', dataIndex: 'roomId' },
    { title: 'Trạng thái', dataIndex: 'status', render: (s: DeviceStatus) => <Tag color={DEVICE_STATUS_COLOR[s]}>{s}</Tag> },
    { title: 'Chế độ', dataIndex: 'mode' },
    {
      title: 'Kết nối',
      dataIndex: 'online',
      render: (o: boolean) => <Badge status={o ? 'success' : 'default'} text={o ? 'Online' : 'Offline'} />,
    },
    { title: 'Firmware', dataIndex: 'fwVersion' },
    { title: 'Thấy lần cuối', dataIndex: 'lastSeenAt', render: (v: string) => fmtTime(v) },
    {
      title: 'Thao tác',
      render: (_: unknown, d: Device) => (
        <Space wrap>
          {can.configDevice(user?.role) && d.status === 'ACTIVE' && (
            <Button size="small" onClick={() => setConfiguring(d)}>Cấu hình</Button>
          )}
          {can.manageDevices(user?.role) && CAN_ACTIVATE.includes(d.status) && (
            <Button size="small" type="primary" loading={busy(d.deviceId)} onClick={() => op.mutate({ id: d.deviceId, kind: 'activate' })}>
              Kích hoạt
            </Button>
          )}
          {can.manageDevices(user?.role) && CAN_LOCK.includes(d.status) && (
            <Popconfirm
              title="Khóa thiết bị này?"
              description="Thiết bị bị khóa sẽ không gửi được dữ liệu và không nhận được lệnh."
              okText="Khóa"
              cancelText="Hủy"
              onConfirm={() => op.mutate({ id: d.deviceId, kind: 'lock' })}
            >
              <Button size="small" danger loading={busy(d.deviceId)}>Khóa</Button>
            </Popconfirm>
          )}
          {can.manageDevices(user?.role) && CAN_DECOMMISSION.includes(d.status) && (
            <Popconfirm
              title="Ngừng sử dụng (decommission) thiết bị?"
              description="Thao tác này không hoàn tác được."
              okText="Decommission"
              okButtonProps={{ danger: true }}
              cancelText="Hủy"
              onConfirm={() => op.mutate({ id: d.deviceId, kind: 'decommission' })}
            >
              <Button size="small" danger loading={busy(d.deviceId)}>Decommission</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Thiết bị</Typography.Title>
        {can.manageDevices(user?.role) && (
          <Button type="primary" onClick={() => setRegistering(true)}>Đăng ký thiết bị</Button>
        )}
      </Space>
      {q.isError && <Alert type="error" showIcon message="Không tải được danh sách thiết bị" />}
      <Table<Device>
        rowKey="deviceId"
        loading={q.isLoading}
        columns={columns}
        dataSource={q.data?.items ?? []}
        pagination={false}
        scroll={{ x: true }}
      />
      <Typography.Text type="secondary">
        Vòng đời: REGISTERED → (PROVISIONED) → ACTIVE → LOCKED → DECOMMISSIONED. Thiết bị LOCKED hoặc DECOMMISSIONED không gửi được dữ liệu.
      </Typography.Text>

      <RegisterDeviceModal open={registering} onClose={() => setRegistering(false)} />
      {configuring && <DeviceConfigModal device={configuring} onClose={() => setConfiguring(null)} />}
    </Space>
  );
}
