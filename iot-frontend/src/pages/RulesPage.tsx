import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import type { TableProps } from 'antd';
import { getRules, updateRule } from '../api/endpoints';
import { errDetails, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { RULE_FIELDS, RULE_LABEL, SEVERITY_COLOR, fmtTime } from '../format';
import type { Rule, RulePatch, Severity } from '../types';

function paramsSummary(r: Rule): string[] {
  const lines = RULE_FIELDS[r.type].map((f) => `${f.label}: ${r.params[f.key]}`);
  if (Array.isArray(r.params.targets)) lines.push(`Tải: ${r.params.targets.join(', ')}`);
  return lines;
}

function actionSummary(r: Rule) {
  if (r.action.alert) return <Tag color={SEVERITY_COLOR[r.action.severity ?? 'MEDIUM']}>Cảnh báo {r.action.severity}</Tag>;
  if (r.action.command) return <Tag>Gửi lệnh {r.action.command.action} (tắt tải)</Tag>;
  return '—';
}

interface FormValues {
  name: string;
  enabled: boolean;
  params: Record<string, number | string[]>;
  severity?: Severity;
}

function RuleEditModal({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const fields = RULE_FIELDS[rule.type];
  const hasAlert = !!rule.action.alert;

  const mut = useMutation({
    mutationFn: (patch: RulePatch) => updateRule(rule.ruleId, patch),
    onSuccess: () => {
      message.success('Đã lưu rule');
      qc.invalidateQueries({ queryKey: ['rules'] });
      onClose();
    },
    onError: (e) => message.error([errMsg(e), errDetails(e)].filter(Boolean).join(': ')),
  });

  const onFinish = (v: FormValues) => {
    const patch: RulePatch = { name: v.name, enabled: v.enabled, params: { ...rule.params, ...v.params } };
    if (hasAlert) patch.action = { alert: true, severity: v.severity };
    mut.mutate(patch);
  };

  return (
    <Modal
      open
      title={`Sửa rule – ${RULE_LABEL[rule.type]}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Lưu"
      cancelText="Hủy"
      confirmLoading={mut.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: rule.name, enabled: rule.enabled, params: rule.params, severity: rule.action.severity }}
        onFinish={onFinish}
      >
        <Form.Item name="name" label="Tên hiển thị" rules={[{ required: true, message: 'Nhập tên rule' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="enabled" label="Bật rule" valuePropName="checked">
          <Switch />
        </Form.Item>
        {fields.map((f) => (
          <Form.Item
            key={f.key}
            name={['params', f.key]}
            label={`${f.label} (${f.min}–${f.max})`}
            rules={[{ required: true, message: 'Nhập giá trị' }]}
          >
            <InputNumber min={f.min} max={f.max} precision={f.int ? 0 : undefined} style={{ width: '100%' }} />
          </Form.Item>
        ))}
        {rule.type === 'ABSENCE_OFF' && (
          <Form.Item
            name={['params', 'targets']}
            label="Tải tự tắt"
            rules={[{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất một tải' }]}
          >
            <Select
              mode="multiple"
              options={[
                { value: 'light1', label: 'Đèn (light1)' },
                { value: 'fan1', label: 'Quạt (fan1)' },
              ]}
            />
          </Form.Item>
        )}
        {hasAlert && (
          <Form.Item name="severity" label="Mức độ cảnh báo">
            <Select
              options={[
                { value: 'LOW', label: 'LOW' },
                { value: 'MEDIUM', label: 'MEDIUM' },
                { value: 'HIGH', label: 'HIGH' },
              ]}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

// Ngưỡng và rule lưu ở backend (Contract 5.4, 9.1). Admin/Operator sửa, Viewer chỉ xem.
export default function RulesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rules'], queryFn: () => getRules(0, 100) });
  const [editing, setEditing] = useState<Rule | null>(null);
  const editable = can.editRules(user?.role);

  const toggle = useMutation({
    mutationFn: (v: { id: number; enabled: boolean }) => updateRule(v.id, { enabled: v.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
    onError: (e) => message.error(errMsg(e)),
  });

  const columns: TableProps<Rule>['columns'] = [
    { title: 'Tên', dataIndex: 'name' },
    { title: 'Loại', dataIndex: 'type', render: (t: Rule['type']) => RULE_LABEL[t] },
    {
      title: 'Điều kiện',
      render: (_: unknown, r: Rule) => (
        <div>
          {paramsSummary(r).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      ),
    },
    { title: 'Hành động', render: (_: unknown, r: Rule) => actionSummary(r) },
    {
      title: 'Bật',
      dataIndex: 'enabled',
      render: (v: boolean, r: Rule) => (
        <Switch
          checked={v}
          disabled={!editable}
          loading={toggle.isPending && toggle.variables?.id === r.ruleId}
          onChange={(c) => toggle.mutate({ id: r.ruleId, enabled: c })}
        />
      ),
    },
    { title: 'Cập nhật', dataIndex: 'updatedAt', render: (v: string) => fmtTime(v) },
    {
      title: '',
      render: (_: unknown, r: Rule) => (editable ? <a onClick={() => setEditing(r)}>Sửa</a> : null),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Ngưỡng và rule</Typography.Title>
      {!editable && <Alert type="info" showIcon message="Viewer chỉ được xem, không sửa được rule." />}
      {q.isError && <Alert type="error" showIcon message="Không tải được danh sách rule" />}
      <Table<Rule>
        rowKey="ruleId"
        loading={q.isLoading}
        columns={columns}
        dataSource={q.data?.items ?? []}
        pagination={false}
        scroll={{ x: true }}
      />
      <Typography.Text type="secondary">
        Loại rule không đổi được sau khi tạo. Sai dải giá trị thì backend trả VALIDATION_ERROR kèm chi tiết từng trường.
      </Typography.Text>
      {editing && <RuleEditModal rule={editing} onClose={() => setEditing(null)} />}
    </Space>
  );
}
