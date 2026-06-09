"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminCreditLog } from "@/services/api/admin";
import { useAdminCreditLogs } from "./use-admin-credit-logs";

type CreditLogFormValues = Partial<AdminCreditLog>;
type CreditLogFilterDraft = { keyword: string; userId: string; type: string; startAt: string; endAt: string };

const emptyFilters: CreditLogFilterDraft = { keyword: "", userId: "", type: "", startAt: "", endAt: "" };
const creditLogTypeLabels: Record<string, string> = {
    admin_adjust: "后台调整",
    ai_consume: "模型消费",
    ai_refund: "失败返还",
    redeem: "兑换码兑换",
};
const creditLogTypeOptions = Object.entries(creditLogTypeLabels).map(([value, label]) => ({ value, label }));

export default function AdminCreditLogsPage() {
    const { logs, filters, page, pageSize, total, isLoading, searchLogs, changePage, changePageSize, resetFilters, refreshLogs, saveLog: saveAdminLog, deleteLog } = useAdminCreditLogs();
    const [form] = Form.useForm<CreditLogFormValues>();
    const [filterDraft, setFilterDraft] = useState<CreditLogFilterDraft>(filters);
    const [editingLog, setEditingLog] = useState<Partial<AdminCreditLog> | null>(null);
    const [deletingLog, setDeletingLog] = useState<AdminCreditLog | null>(null);

    useEffect(() => setFilterDraft(filters), [filters]);

    useEffect(() => {
        if (editingLog) form.setFieldsValue({ type: "admin_adjust", amount: 0, balance: 0, ...editingLog });
    }, [editingLog, form]);

    const saveLog = async () => {
        const value = await form.validateFields();
        await saveAdminLog({ ...editingLog, ...value });
        setEditingLog(null);
    };

    const applyFilters = () => searchLogs(filterDraft);
    const resetLogFilters = () => {
        setFilterDraft(emptyFilters);
        resetFilters();
    };

    const columns: ProColumns<AdminCreditLog>[] = [
        {
            title: "用户 ID",
            dataIndex: "userId",
            width: 220,
            render: (_, item) => <Typography.Text copyable>{item.userId}</Typography.Text>,
        },
        {
            title: "用户昵称",
            dataIndex: "userDisplayName",
            width: 160,
            ellipsis: true,
            render: (_, item) => item.userDisplayName || "-",
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 140,
            render: (_, item) => <Tag>{creditLogTypeLabels[item.type] || item.type || "-"}</Tag>,
        },
        {
            title: "变动",
            dataIndex: "amount",
            width: 100,
            render: (_, item) => <Typography.Text type={item.amount >= 0 ? "success" : "danger"}>{item.amount}</Typography.Text>,
        },
        {
            title: "余额",
            dataIndex: "balance",
            width: 100,
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
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingLog(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingLog(item)} />
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
                            <Col flex="320px">
                                <Form.Item label="关键词">
                                    <Input.Search
                                        value={filterDraft.keyword}
                                        placeholder="搜索用户、类型、备注或关联 ID"
                                        allowClear
                                        enterButton={<SearchOutlined />}
                                        onSearch={applyFilters}
                                        onChange={(event) => setFilterDraft((current) => ({ ...current, keyword: event.target.value }))}
                                    />
                                </Form.Item>
                            </Col>
                            <Col flex="260px">
                                <Form.Item label="用户筛选">
                                    <Input value={filterDraft.userId} placeholder="用户 ID / 昵称 / 用户名" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, userId: event.target.value }))} onPressEnter={applyFilters} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="类型">
                                    <Select allowClear value={filterDraft.type || undefined} placeholder="全部类型" options={creditLogTypeOptions} onChange={(value) => setFilterDraft((current) => ({ ...current, type: value || "" }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="开始时间">
                                    <Input value={filterDraft.startAt} placeholder="YYYY-MM-DD" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, startAt: event.target.value }))} onPressEnter={applyFilters} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="结束时间">
                                    <Input value={filterDraft.endAt} placeholder="YYYY-MM-DD" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, endAt: event.target.value }))} onPressEnter={applyFilters} />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Space>
                                        <Button onClick={resetLogFilters}>重置</Button>
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={applyFilters}>
                                            查询全站日志
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                    <Typography.Text type="secondary">管理员默认查看全站算力点流水；填写用户筛选后可只查看指定成员。</Typography.Text>
                </Card>
                <ProTable<AdminCreditLog>
                    rowKey="id"
                    columns={columns}
                    dataSource={logs}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1180 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>算力点日志</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshLogs() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingLog({ type: "admin_adjust", amount: 0, balance: 0 })}>
                            新增
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Space>

            <Modal title={editingLog?.id ? "编辑日志" : "新增日志"} open={Boolean(editingLog)} width={680} onCancel={() => setEditingLog(null)} onOk={() => void saveLog()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
                                <Select options={creditLogTypeOptions} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="amount" label="变动数量" rules={[{ required: true, message: "请输入变动数量" }]}>
                                <InputNumber precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="balance" label="变动后余额" rules={[{ required: true, message: "请输入变动后余额" }]}>
                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="relatedId" label="关联 ID">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="createdAt" label="创建时间">
                                <Input placeholder="不填则新增时自动生成" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="remark" label="备注">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="extra" label="扩展信息">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="删除日志"
                open={Boolean(deletingLog)}
                onCancel={() => setDeletingLog(null)}
                onOk={async () => {
                    if (!deletingLog) return;
                    await deleteLog(deletingLog.id);
                    setDeletingLog(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除这条算力点日志吗？
            </Modal>
        </main>
    );
}
