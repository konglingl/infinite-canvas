"use client";

import { DeleteOutlined, EyeOutlined, SearchOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import { deleteAdminAICallLogs, fetchAdminAICallLogs, fetchAdminSettings, saveAdminSettings, type AdminAICallLog, type AdminLogQuery } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

type AILogFilterDraft = {
    keyword: string;
    userId: string;
    model: string;
    channelId: string;
    method: string;
    status: string;
    startAt: string;
    endAt: string;
};

const emptyFilters: AILogFilterDraft = { keyword: "", userId: "", model: "", channelId: "", method: "", status: "", startAt: "", endAt: "" };
const methodOptions = ["GET", "POST"].map((value) => ({ value, label: value }));
const statusOptions = [
    { value: "success", label: "成功" },
    { value: "failed", label: "失败" },
];

export default function AdminAICallLogsPage() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [filters, setFilters] = useState<AILogFilterDraft>(emptyFilters);
    const [filterDraft, setFilterDraft] = useState<AILogFilterDraft>(emptyFilters);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [logs, setLogs] = useState<AdminAICallLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [clearDays, setClearDays] = useState(7);
    const [clearing, setClearing] = useState(false);
    const [detail, setDetail] = useState<{ title: string; value: string } | null>(null);
    const [localDirectReportEnabled, setLocalDirectReportEnabled] = useState(false);
    const [savingLocalDirectReport, setSavingLocalDirectReport] = useState(false);

    const loadLogs = async (nextFilters = filters, nextPage = page, nextPageSize = pageSize) => {
        if (!token) return;
        setLoading(true);
        try {
            const query: AdminLogQuery = { ...nextFilters, page: nextPage, pageSize: nextPageSize };
            const result = await fetchAdminAICallLogs(token, query);
            setLogs(result.items);
            setTotal(result.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取 AI 调用日志失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadLogs(filters, page, pageSize);
    }, [token, page, pageSize]);

    useEffect(() => {
        if (!token) return;
        fetchAdminSettings(token)
            .then((settings) => setLocalDirectReportEnabled(settings.private.aiLog?.localDirectReportEnabled === true))
            .catch(() => undefined);
    }, [token]);

    const applyFilters = () => {
        setFilters(filterDraft);
        setPage(1);
        void loadLogs(filterDraft, 1, pageSize);
    };

    const resetFilters = () => {
        setFilterDraft(emptyFilters);
        setFilters(emptyFilters);
        setPage(1);
        void loadLogs(emptyFilters, 1, pageSize);
    };

    const clearLogs = async () => {
        if (!token) return;
        setClearing(true);
        try {
            const result = await deleteAdminAICallLogs(token, clearDays);
            message.success(`已清理 ${result.removedFiles} 个日志文件`);
            setPage(1);
            await loadLogs(filters, 1, pageSize);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "清理 AI 调用日志失败");
        } finally {
            setClearing(false);
        }
    };

    const updateLocalDirectReport = async (checked: boolean) => {
        if (!token) return;
        const previous = localDirectReportEnabled;
        setLocalDirectReportEnabled(checked);
        setSavingLocalDirectReport(true);
        try {
            const settings = await fetchAdminSettings(token);
            await saveAdminSettings(token, {
                ...settings,
                private: {
                    ...settings.private,
                    aiLog: {
                        ...settings.private.aiLog,
                        localDirectReportEnabled: checked,
                    },
                },
            });
            message.success(checked ? "已开启本地直连日志上报" : "已关闭本地直连日志上报");
        } catch (error) {
            setLocalDirectReportEnabled(previous);
            message.error(error instanceof Error ? error.message : "保存本地直连日志设置失败");
        } finally {
            setSavingLocalDirectReport(false);
        }
    };

    const columns = useMemo(
        () => [
            { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => formatTime(value) },
            { title: "用户", dataIndex: "userDisplayName", width: 150, render: (_: string, item: AdminAICallLog) => item.userDisplayName || item.userId || "-" },
            { title: "接口", dataIndex: "endpoint", width: 170 },
            { title: "模型", dataIndex: "model", width: 180, ellipsis: true },
            { title: "渠道", dataIndex: "channelName", width: 150, ellipsis: true, render: (_: string, item: AdminAICallLog) => item.channelName || item.channelId || "-" },
            { title: "状态", dataIndex: "status", width: 90, render: (status: number) => <Tag color={status >= 200 && status < 400 ? "success" : "error"}>{status || "失败"}</Tag> },
            { title: "耗时", dataIndex: "durationMs", width: 110, render: (value: number) => formatDuration(value) },
            { title: "扣点", dataIndex: "credits", width: 90, render: (value: number) => value || 0 },
            {
                title: "详情",
                key: "actions",
                width: 190,
                render: (_: unknown, item: AdminAICallLog) => (
                    <Space size={4}>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail({ title: "请求详情", value: item.requestBody })}>
                            请求详情
                        </Button>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail({ title: "返回详情", value: item.responseBody || item.error })}>
                            返回详情
                        </Button>
                    </Space>
                ),
            },
        ],
        [],
    );

    return (
        <main className="p-3 md:p-6">
            <Flex vertical gap={16} className="w-full">
                <Card variant="borderless">
                    <Form layout="vertical" onFinish={applyFilters}>
                        <Row gutter={12} align="bottom">
                            <Col flex="320px">
                                <Form.Item label="关键词">
                                    <Input value={filterDraft.keyword} placeholder="搜索用户、模型、渠道、接口或错误" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, keyword: event.target.value }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="240px">
                                <Form.Item label="用户筛选">
                                    <Input value={filterDraft.userId} placeholder="用户 ID / 昵称" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, userId: event.target.value }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="220px">
                                <Form.Item label="模型">
                                    <Input value={filterDraft.model} placeholder="模型名" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, model: event.target.value }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="200px">
                                <Form.Item label="渠道">
                                    <Input value={filterDraft.channelId} placeholder="渠道 ID / 名称" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, channelId: event.target.value }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="140px">
                                <Form.Item label="方法">
                                    <Select allowClear value={filterDraft.method || undefined} placeholder="全部" options={methodOptions} onChange={(value) => setFilterDraft((current) => ({ ...current, method: value || "" }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="140px">
                                <Form.Item label="状态">
                                    <Select allowClear value={filterDraft.status || undefined} placeholder="全部" options={statusOptions} onChange={(value) => setFilterDraft((current) => ({ ...current, status: value || "" }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="170px">
                                <Form.Item label="开始时间">
                                    <Input value={filterDraft.startAt} placeholder="YYYY-MM-DD" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, startAt: event.target.value }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="170px">
                                <Form.Item label="结束时间">
                                    <Input value={filterDraft.endAt} placeholder="YYYY-MM-DD" allowClear onChange={(event) => setFilterDraft((current) => ({ ...current, endAt: event.target.value }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Space>
                                        <Button onClick={resetFilters}>重置</Button>
                                        <Button htmlType="submit" type="primary" icon={<SearchOutlined />}>
                                            查询全站日志
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item label="浏览器直连日志">
                                    <div className="flex h-8 items-center gap-2 rounded-md border border-stone-200 px-3 dark:border-stone-800">
                                        <Typography.Text className="whitespace-nowrap text-sm">主动上报</Typography.Text>
                                        <Switch size="small" checked={localDirectReportEnabled} loading={savingLocalDirectReport} onChange={(checked) => void updateLocalDirectReport(checked)} />
                                    </div>
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item label="清理旧日志">
                                    <Space>
                                        <InputNumber min={1} value={clearDays} className="!w-24" onChange={(value) => setClearDays(Number(value) || 7)} />
                                        <Typography.Text type="secondary">天前</Typography.Text>
                                        <Button danger icon={<DeleteOutlined />} loading={clearing} onClick={() => void clearLogs()}>
                                            清理
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                    <Typography.Text type="secondary">管理员默认查看全站 AI 调用日志；经本站 /api/v1 代理的自带 Key 调用会默认记录，此开关只控制浏览器绕过后端直连时的主动上报；填写用户筛选后可只查看指定成员。</Typography.Text>
                </Card>
                <Card variant="borderless" title={<span>AI 调用日志 <Tag>{total} 条</Tag></span>}>
                    <Table
                        rowKey="id"
                        size="small"
                        loading={loading}
                        columns={columns}
                        dataSource={logs}
                        scroll={{ x: 1440 }}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            showSizeChanger: true,
                            onChange: (nextPage, nextPageSize) => {
                                if (nextPageSize !== pageSize) {
                                    setPage(1);
                                    setPageSize(nextPageSize);
                                    return;
                                }
                                setPage(nextPage);
                            },
                        }}
                    />
                </Card>
            </Flex>
            <Modal title={detail?.title || "AI 调用详情"} open={Boolean(detail)} width="min(1100px, 92vw)" footer={null} onCancel={() => setDetail(null)} destroyOnHidden>
                <LogBlock value={detail?.value || ""} />
            </Modal>
        </main>
    );
}

function LogBlock({ value }: { value: string }) {
    return (
        <pre className="max-h-[72vh] whitespace-pre-wrap break-words overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200">{value || "-"}</pre>
    );
}

function formatTime(value: string) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDuration(value: number) {
    if (!Number.isFinite(value) || value <= 0) return "-";
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}
