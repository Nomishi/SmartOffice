import { Form, Input, Modal, message } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { changePassword } from '../api/endpoints';
import { errDetails, errMsg } from '../api/client';

interface Values {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const mut = useMutation({
    mutationFn: (v: Values) => changePassword(v.currentPassword, v.newPassword),
    onSuccess: () => {
      message.success('Đã đổi mật khẩu');
      form.resetFields();
      onClose();
    },
    onError: (e) => message.error([errMsg(e), errDetails(e)].filter(Boolean).join(' – ')),
  });

  return (
    <Modal
      title="Đổi mật khẩu"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Đổi mật khẩu"
      cancelText="Hủy"
      confirmLoading={mut.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} onFinish={(v) => mut.mutate(v)}>
        <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="Mật khẩu mới"
          rules={[{ required: true, message: 'Nhập mật khẩu mới' }, { min: 8, message: 'Tối thiểu 8 ký tự' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Nhập lại mật khẩu mới"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Nhập lại mật khẩu mới' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('Mật khẩu nhập lại không khớp'));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
