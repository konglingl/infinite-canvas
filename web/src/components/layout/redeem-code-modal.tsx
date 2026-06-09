"use client";

import { useEffect, useState } from "react";
import { App, Form, Input, Modal, Typography } from "antd";

import { redeemCode } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";

type RedeemCodeModalProps = {
    open: boolean;
    onClose: () => void;
};

type RedeemCodeFormValues = {
    code: string;
};

export function RedeemCodeModal({ open, onClose }: RedeemCodeModalProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm<RedeemCodeFormValues>();
    const token = useUserStore((state) => state.token);
    const setUser = useUserStore((state) => state.setUser);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) form.resetFields();
    }, [form, open]);

    const submit = async () => {
        const values = await form.validateFields();
        setLoading(true);
        try {
            const result = await redeemCode(token, values.code);
            setUser(result.user);
            message.success(`兑换成功，获得 ${result.credits.toLocaleString()} 算力点`);
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="兑换算力点" open={open} onCancel={onClose} onOk={() => void submit()} confirmLoading={loading} okText="兑换" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    输入管理员发放的兑换码，兑换成功后算力点会立即加入当前账号。
                </Typography.Paragraph>
                <Form.Item name="code" label="兑换码" rules={[{ required: true, message: "请输入兑换码" }]}>
                    <Input autoFocus placeholder="请输入兑换码" onPressEnter={() => void submit()} />
                </Form.Item>
            </Form>
        </Modal>
    );
}
