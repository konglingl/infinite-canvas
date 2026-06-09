"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Space, Switch, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminRedeemCode } from "@/services/api/admin";
import { useAdminRedeemCodes } from "./use-admin-redeem-codes";

type RedeemCodeFormValues = Partial<AdminRedeemCode>;

function randomRedeemCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789#$%*+-=@";
    const values = new Uint8Array(30);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
    else values.forEach((_, index) => (values[index] = Math.floor(Math.random() * 256)));
    const text = Array.from(values, (value) => chars[value % chars.length]).join("");
    return `STC-${text.match(/.{1,5}/g)?.join("-") || text}`;
}

export default function AdminRedeemCodesPage() {
    const { codes, keyword, page, pageSize, total, isLoading, searchCodes, changePage, changePageSize, resetFilters, refreshCodes, saveCode: saveAdminCode, deleteCode } = useAdminRedeemCodes();
    const [form] = Form.useForm<RedeemCodeFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingCode, setEditingCode] = useState<Partial<AdminRedeemCode> | null>(null);
    const [deletingCode, setDeletingCode] = useState<AdminRedeemCode | null>(null);

    useEffect(() => setKeywordText(keyword), [keyword]);

    useEffect(() => {
        if (editingCode) form.setFieldsValue({ credits: 100, totalLimit: 1, enabled: true, ...editingCode });
    }, [editingCode, form]);

    const saveCode = async () => {
        const value = await form.validateFields();
        await saveAdminCode({ ...editingCode, ...value });
        setEditingCode(null);
    };

    const columns: ProColumns<AdminRedeemCode>[] = [
        {
            title: "兑换码",
            dataIndex: "code",
            width: 220,
            render: (_, item) => (
                <Typography.Text copyable strong>
                    {item.code}
                </Typography.Text>
            ),
        },
        {
            title: "算力点",
            dataIndex: "credits",
            width: 100,
            render: (_, item) => <Typography.Text type="success">+{item.credits}</Typography.Text>,
        },
        {
            title: "使用次数",
            key: "used",
            width: 130,
            render: (_, item) => (
                <Typography.Text>
                    {item.usedCount} / {item.totalLimit > 0 ? item.totalLimit : "不限"}
                </Typography.Text>
            ),
        },
        {
            title: "状态",
            dataIndex: "enabled",
            width: 100,
            render: (_, item) => <Tag color={item.enabled ? "green" : "red"}>{item.enabled ? "启用" : "停用"}</Tag>,
        },
        {
            title: "过期时间",
            dataIndex: "expiresAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.expiresAt ? dayjs(item.expiresAt).format("YYYY-MM-DD HH:mm:ss") : "长期有效"}</Typography.Text>,
        },
        {
            title: "备注",
            dataIndex: "remark",
            ellipsis: true,
            render: (_, item) => <Typography.Text type="secondary">{item.remark || "-"}</Typography.Text>,
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingCode(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingCode(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <main className="p-3 md:p-6">
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keywordText} placeholder="搜索兑换码或备注" allowClear enterButton={<SearchOutlined />} onSearch={() => searchCodes(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Space>
                                        <Button icon={<ReloadOutlined />} onClick={() => resetFilters()}>
                                            重置
                                        </Button>
                                        <Button type="primary" icon={<SearchOutlined />} onClick={() => searchCodes(keywordText)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminRedeemCode>
                    rowKey="id"
                    columns={columns}
                    dataSource={codes}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1100 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>兑换码</Typography.Text>
                            <Tag>{total} 个</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshCodes() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingCode({ code: randomRedeemCode(), credits: 100, totalLimit: 1, enabled: true })}>
                            新增兑换码
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 个`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Space>

            <Modal title={editingCode?.id ? "编辑兑换码" : "新增兑换码"} open={Boolean(editingCode)} width={720} onCancel={() => setEditingCode(null)} onOk={() => void saveCode()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={16}>
                            <Form.Item name="code" label="兑换码" tooltip="留空保存时后端也会自动生成" rules={[{ max: 64, message: "兑换码不能超过 64 个字符" }]}>
                                <Input placeholder="留空自动生成" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="生成">
                                <Button icon={<SyncOutlined />} onClick={() => form.setFieldValue("code", randomRedeemCode())} block>
                                    随机生成
                                </Button>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="credits" label="兑换算力点" rules={[{ required: true, message: "请输入算力点" }]}>
                                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="totalLimit" label="可兑换次数" tooltip="0 表示不限总次数">
                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="enabled" label="状态" valuePropName="checked">
                                <Switch checkedChildren="启用" unCheckedChildren="停用" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="expiresAt" label="过期时间">
                                <Input placeholder="留空长期有效，或填 2026-12-31 23:59:59" />
                            </Form.Item>
                        </Col>
                        {editingCode?.id ? (
                            <Col span={12}>
                                <Form.Item label="已使用次数">
                                    <Input value={editingCode.usedCount || 0} disabled />
                                </Form.Item>
                            </Col>
                        ) : null}
                        <Col span={24}>
                            <Form.Item name="remark" label="备注">
                                <Input.TextArea rows={3} placeholder="例如：活动批次、发放对象" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="删除兑换码"
                open={Boolean(deletingCode)}
                onCancel={() => setDeletingCode(null)}
                onOk={async () => {
                    if (!deletingCode) return;
                    await deleteCode(deletingCode.id);
                    setDeletingCode(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除兑换码「{deletingCode?.code}」吗？已兑换用户的算力点不会回退。
            </Modal>
        </main>
    );
}
