import { useEffect } from 'react';
import { Alert, Form, InputNumber, Modal, Spin, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDeviceConfig, updateDeviceConfig } from '../api/endpoints';
import { errDetails, errMsg } from '../api/client';
import { fmtTime } from '../format';
import type { Device, DeviceConfigInput } from '../types';

// Cấu hình tham số chạy trên thiết bị (topic config, Contract 5.4).
// Ngưỡng cảnh báo/automation KHÔNG nằm ở đây mà ở trang Ngưỡng/Rule.
export default function DeviceConfigModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const [form] = Form.useForm<DeviceConfigInput>();
  const qc = useQueryClient();
  const isControl = device.type === 'CONTROL';

  // Giá trị đang áp dụng trên thiết bị (các config đã được thiết bị ACK SUCCESS).
  const current = useQuery({
    queryKey: ['device-config', device.deviceId],
    queryFn: () => getDeviceConfig(device.deviceId),
  });

  useEffect(() => {
    if (!current.data) return;
    form.setFieldsValue({
      telemetryIntervalSec: current.data.telemetryIntervalSec,
      servoOpenDeg: current.data.servoOpenDeg ?? undefined,
      servoCloseDeg: current.data.servoCloseDeg ?? undefined,
    });
  }, [current.data, form]);

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
      qc.invalidateQueries({ queryKey: ['device-config', device.deviceId] });
      onClose();
    },
    onError: (e) => message.error([errMsg(e), errDetails(e)].filter(Boolean).join(': ')),
  });

  const c = current.data;
  return (
    <Modal
      open
      title={`Cấu hình thiết bị – ${device.name}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Gửi cấu hình"
      cancelText="Hủy"
      confirmLoading={mut.isPending}
      okButtonProps={{ disabled: current.isLoading || !!c?.pendingConfigId }}
    >
      {current.isError && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message={`Không đọc được cấu hình hiện tại: ${errMsg(current.error)}`} />
      )}
      {c?.pendingConfigId && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Cấu hình ${c.pendingConfigId} đang chờ thiết bị xác nhận, gửi lại sau vài giây.`}
        />
      )}
      {c && !c.pendingConfigId && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            c.source === 'ACKED'
              ? `Giá trị đang áp dụng trên thiết bị (cấu hình ${c.lastConfigId}, xác nhận lúc ${fmtTime(c.lastAckAt)}).`
              : 'Thiết bị chưa từng được cấu hình, đang chạy giá trị mặc định của firmware.'
          }
        />
      )}
      <Spin spinning={current.isLoading}>
        <Form form={form} layout="vertical" onFinish={(v) => mut.mutate(v)}>
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
      </Spin>
    </Modal>
  );
}
