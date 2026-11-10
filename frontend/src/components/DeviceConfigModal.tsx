import { Alert, Form, InputNumber, Modal, message } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { updateDeviceConfig } from '../api/endpoints';
import { errDetails, errMsg } from '../api/client';
import type { Device, DeviceConfigInput } from '../types';

// Cấu hình tham số chạy trên thiết bị (topic config, Contract 5.4).
// Ngưỡng cảnh báo/automation KHÔNG nằm ở đây mà ở trang Ngưỡng/Rule.
export default function DeviceConfigModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const [form] = Form.useForm<DeviceConfigInput>();
  const isControl = device.type === 'CONTROL';

  const mut = useMutation({
    mutationFn: (v: DeviceConfigInput) => {
      const body: DeviceConfigInput = { telemetryIntervalSec: v.telemetryIntervalSec };
      if (isControl) {
        body.servoOpenDeg = v.servoOpenDeg;
        body.servoCloseDeg = v.servoCloseDeg;
      }
      return updateDeviceConfig(device.deviceId, body);
    },
    onSuccess: (r) => {
      message.info(`Đã gửi cấu hình ${r.configId}, đang chờ thiết bị xác nhận`);
      onClose();
    },
    onError: (e) => message.error([errMsg(e), errDetails(e)].filter(Boolean).join(': ')),
  });

  return (
    <Modal
      open
      title={`Cấu hình thiết bị – ${device.name}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Gửi cấu hình"
      cancelText="Hủy"
      confirmLoading={mut.isPending}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Hiện chưa có API đọc cấu hình đang áp dụng nên form hiển thị giá trị mặc định."
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={{ telemetryIntervalSec: 5, servoOpenDeg: 90, servoCloseDeg: 0 }}
        onFinish={(v) => mut.mutate(v)}
      >
        <Form.Item name="telemetryIntervalSec" label="Chu kỳ gửi telemetry (giây)" rules={[{ required: true, message: 'Nhập chu kỳ' }]}>
          <InputNumber min={1} max={3600} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        {isControl && (
          <>
            <Form.Item name="servoOpenDeg" label="Góc mở cửa (độ)" rules={[{ required: true, message: 'Nhập góc mở' }]}>
              <InputNumber min={0} max={180} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="servoCloseDeg" label="Góc đóng cửa (độ)" rules={[{ required: true, message: 'Nhập góc đóng' }]}>
              <InputNumber min={0} max={180} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
