"use client";

import { App, Button, Checkbox, Empty, Image, Input, Modal, Select, Space, Switch, Tag, Typography } from "antd";
import { AlertCircle, CheckCircle2, Copy, Download, Edit3, FilePlus2, LoaderCircle, Play, Plus, Sparkles, Trash2, WandSparkles } from "lucide-react";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useState } from "react";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { formatBytes, formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { requestGeneration } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

type WorkflowVariableType = "text" | "textarea" | "number" | "select" | "boolean";

type WorkflowVariable = {
    id: string;
    key: string;
    label: string;
    type: WorkflowVariableType;
    required: boolean;
    defaultValue: string;
    options: string[];
    placeholder?: string;
};

type WorkflowGenerationConfig = Pick<
    AiConfig,
    "model" | "imageModel" | "quality" | "size" | "count" | "apiMode" | "outputFormat" | "outputCompression" | "moderation" | "timeout" | "streamImages" | "streamPartialImages" | "responseFormatB64Json" | "codexCli"
> & {
    systemPrompt: string;
    promptTemplate: string;
    negativePrompt: string;
};

type CreativeWorkflow = {
    id: string;
    name: string;
    category: string;
    description: string;
    variables: WorkflowVariable[];
    config: WorkflowGenerationConfig;
    createdAt: number;
    updatedAt: number;
    lastRunAt?: number;
};

type WorkflowRunResult = {
    id: string;
    workflowId: string;
    workflowName: string;
    prompt: string;
    imageUrl: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    durationMs: number;
    createdAt: number;
};

type WorkflowTask = {
    id: string;
    status: "running" | "success" | "failed";
    workflowId: string;
    workflowName: string;
    prompt: string;
    inputs: Record<string, string>;
    model: string;
    apiMode: AiConfig["apiMode"];
    config: WorkflowGenerationConfig;
    count: number;
    startedAt: number;
    endedAt?: number;
    durationMs?: number;
    images: WorkflowRunResult[];
    error?: string;
};

type ImageHistoryLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: WorkflowGenerationConfig;
    references: [];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "成功" | "失败";
    images: Array<{
        id: string;
        dataUrl: string;
        storageKey: string;
        durationMs: number;
        width: number;
        height: number;
        bytes: number;
        mimeType: string;
    }>;
    thumbnails: string[];
    errors: string[];
    categoryIds: string[];
    workflowId: string;
    workflowName: string;
    workflowInputs: Record<string, unknown>;
};

const WORKFLOW_STORE_KEY = "infinite-canvas:creative-workflows";
const workflowStore = localforage.createInstance({ name: "infinite-canvas", storeName: "creative_workflows" });
const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

const variableTypeOptions: Array<{ value: WorkflowVariableType; label: string }> = [
    { value: "text", label: "短文本" },
    { value: "textarea", label: "长文本" },
    { value: "number", label: "数字" },
    { value: "select", label: "选项" },
    { value: "boolean", label: "开关" },
];

export default function WorkflowsPage() {
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [workflows, setWorkflows] = useState<CreativeWorkflow[]>([]);
    const [editingWorkflow, setEditingWorkflow] = useState<CreativeWorkflow | null>(null);
    const [runningWorkflow, setRunningWorkflow] = useState<CreativeWorkflow | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [runResults, setRunResults] = useState<WorkflowRunResult[]>([]);
    const [workflowTasks, setWorkflowTasks] = useState<WorkflowTask[]>([]);
    const [now, setNow] = useState(Date.now());
    const [query, setQuery] = useState("");

    const filteredWorkflows = useMemo(() => {
        const text = query.trim().toLowerCase();
        if (!text) return workflows;
        return workflows.filter((workflow) => [workflow.name, workflow.category, workflow.description].some((value) => value.toLowerCase().includes(text)));
    }, [query, workflows]);

    const renderedPrompt = useMemo(() => (runningWorkflow ? renderWorkflowPrompt(runningWorkflow, inputValues) : ""), [inputValues, runningWorkflow]);
    const runningTaskCount = workflowTasks.filter((task) => task.status === "running").length;

    useEffect(() => {
        void refreshWorkflows();
    }, []);

    useEffect(() => {
        if (!runningTaskCount) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [runningTaskCount]);

    const refreshWorkflows = async () => {
        const stored = await workflowStore.getItem<CreativeWorkflow[]>(WORKFLOW_STORE_KEY);
        if (stored?.length) {
            setWorkflows(stored.map(normalizeWorkflow).sort((a, b) => b.updatedAt - a.updatedAt));
            return;
        }
        const seed = [createStarterWorkflow(effectiveConfig)];
        setWorkflows(seed);
        await workflowStore.setItem(WORKFLOW_STORE_KEY, seed);
    };

    const saveWorkflows = async (items: CreativeWorkflow[]) => {
        const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
        setWorkflows(sorted);
        await workflowStore.setItem(WORKFLOW_STORE_KEY, sorted);
    };

    const openRunner = (workflow: CreativeWorkflow) => {
        setRunningWorkflow(workflow);
        setInputValues(createDefaultInputValues(workflow));
    };

    const closeRunner = () => {
        setRunningWorkflow(null);
    };

    const saveWorkflow = async (workflow: CreativeWorkflow) => {
        if (!workflow.name.trim()) {
            message.error("请输入工作流名称");
            return;
        }
        if (!workflow.config.promptTemplate.trim()) {
            message.error("请输入提示词模板");
            return;
        }
        const now = Date.now();
        const normalized = normalizeWorkflow({ ...workflow, name: workflow.name.trim(), category: workflow.category.trim(), updatedAt: now, createdAt: workflow.createdAt || now });
        await saveWorkflows([normalized, ...workflows.filter((item) => item.id !== normalized.id)]);
        setEditingWorkflow(null);
        message.success("工作流已保存");
    };

    const duplicateWorkflow = async (workflow: CreativeWorkflow) => {
        const now = Date.now();
        const copy = normalizeWorkflow({ ...workflow, id: nanoid(), name: `${workflow.name} 副本`, createdAt: now, updatedAt: now, lastRunAt: undefined });
        await saveWorkflows([copy, ...workflows]);
    };

    const deleteWorkflow = (workflow: CreativeWorkflow) => {
        modal.confirm({
            title: "删除工作流",
            content: `确定删除「${workflow.name}」吗？本地模板会被移除，已生成的图片历史不受影响。`,
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await saveWorkflows(workflows.filter((item) => item.id !== workflow.id));
                if (runningWorkflow?.id === workflow.id) setRunningWorkflow(null);
            },
        });
    };

    const runWorkflow = async () => {
        if (!runningWorkflow) return;
        const missing = runningWorkflow.variables.find((item) => item.required && !String(inputValues[item.key] || "").trim());
        if (missing) {
            message.error(`请填写 ${missing.label}`);
            return;
        }
        const runtime = resolveWorkflowRuntime(runningWorkflow, effectiveConfig);
        const model = runtime.model;
        const runConfig = buildRunConfig(effectiveConfig, runningWorkflow.config, runtime);
        if (!isAiConfigReady(runConfig, model)) {
            message.warning("请先完成 API 配置");
            openConfigDialog(true);
            return;
        }

        const startedAt = Date.now();
        const performanceStartedAt = performance.now();
        const count = Math.max(1, Math.min(10, Number(runConfig.count) || 1));
        const taskId = nanoid();
        const taskConfig = { ...runningWorkflow.config, model, imageModel: model, apiMode: runtime.apiMode };
        const promptSnapshot = renderedPrompt;
        const inputSnapshot = { ...inputValues };
        setWorkflowTasks((value) => [
            {
                id: taskId,
                status: "running",
                workflowId: runningWorkflow.id,
                workflowName: runningWorkflow.name,
                prompt: promptSnapshot,
                inputs: inputSnapshot,
                model,
                apiMode: runtime.apiMode,
                config: taskConfig,
                count,
                startedAt,
                images: [],
            },
            ...value,
        ]);
        void executeWorkflowTask({ taskId, workflow: runningWorkflow, prompt: promptSnapshot, inputSnapshot, runConfig, taskConfig, model, count, startedAt, performanceStartedAt });
        message.success("工作流任务已开始");
    };

    const executeWorkflowTask = async ({
        taskId,
        workflow,
        prompt,
        inputSnapshot,
        runConfig,
        taskConfig,
        model,
        count,
        startedAt,
        performanceStartedAt,
    }: {
        taskId: string;
        workflow: CreativeWorkflow;
        prompt: string;
        inputSnapshot: Record<string, string>;
        runConfig: AiConfig;
        taskConfig: WorkflowGenerationConfig;
        model: string;
        count: number;
        startedAt: number;
        performanceStartedAt: number;
    }) => {
        try {
            const images = await Promise.all(Array.from({ length: count }, () => requestGeneration({ ...runConfig, count: "1" }, prompt)));
            const flattened = images.flat();
            if (!flattened.length) throw new Error("接口没有返回图片");
            const durationMs = performance.now() - performanceStartedAt;
            const storedImages = await Promise.all(
                flattened.map(async (image) => {
                    const meta = await readImageMeta(image.dataUrl);
                    const stored = await uploadImage(image.dataUrl);
                    return {
                        id: image.id,
                        dataUrl: stored.url,
                        storageKey: stored.storageKey,
                        durationMs,
                        width: stored.width || meta.width,
                        height: stored.height || meta.height,
                        bytes: stored.bytes || getDataUrlByteSize(image.dataUrl),
                        mimeType: stored.mimeType || meta.mimeType,
                    };
                }),
            );
            const log = buildImageHistoryLog({
                workflow,
                prompt,
                config: taskConfig,
                model,
                images: storedImages,
                durationMs,
                inputs: inputSnapshot,
            });
            await imageLogStore.setItem(log.id, serializeHistoryLog(log));
            const finishedAt = Date.now();
            setWorkflows((value) => {
                const next = value.map((item) => (item.id === workflow.id ? { ...item, lastRunAt: finishedAt, updatedAt: finishedAt } : item)).sort((a, b) => b.updatedAt - a.updatedAt);
                void workflowStore.setItem(WORKFLOW_STORE_KEY, next);
                return next;
            });
            setRunningWorkflow((value) => (value?.id === workflow.id ? { ...value, lastRunAt: finishedAt, updatedAt: finishedAt } : value));
            const nextResults = storedImages.map((image) => ({
                id: nanoid(),
                workflowId: workflow.id,
                workflowName: workflow.name,
                prompt,
                imageUrl: image.dataUrl,
                storageKey: image.storageKey,
                width: image.width,
                height: image.height,
                bytes: image.bytes,
                mimeType: image.mimeType,
                durationMs,
                createdAt: finishedAt,
            }));
            setWorkflowTasks((value) =>
                value.map((task) =>
                    task.id === taskId
                        ? {
                              ...task,
                              status: "success",
                              endedAt: finishedAt,
                              durationMs,
                              images: nextResults,
                          }
                        : task,
                ),
            );
            setRunResults((value) => [...nextResults, ...value]);
            message.success("工作流运行完成，结果已写入生图历史");
        } catch (error) {
            const finishedAt = Date.now();
            setWorkflowTasks((value) =>
                value.map((task) =>
                    task.id === taskId
                        ? {
                              ...task,
                              status: "failed",
                              endedAt: finishedAt,
                              durationMs: finishedAt - startedAt,
                              error: error instanceof Error ? error.message : "工作流运行失败",
                          }
                        : task,
                ),
            );
            message.error(error instanceof Error ? error.message : "工作流运行失败");
        }
    };

    return (
        <main className="h-full overflow-y-auto bg-stone-50 p-4 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-900/70">
                    <div>
                        <div className="flex items-center gap-2 text-lg font-semibold">
                            <WandSparkles className="size-5" />
                            创作工作流
                        </div>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">把固定提示词和参数沉淀成模板，每次只填写变量即可批量复用。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input.Search allowClear placeholder="搜索名称、分类、描述" className="w-72 max-w-full" value={query} onChange={(event) => setQuery(event.target.value)} />
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setEditingWorkflow(createBlankWorkflow(effectiveConfig))}>
                            新建工作流
                        </Button>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {filteredWorkflows.map((workflow) => (
                        <WorkflowCard key={workflow.id} workflow={workflow} onRun={() => openRunner(workflow)} onEdit={() => setEditingWorkflow(workflow)} onCopy={() => void duplicateWorkflow(workflow)} onDelete={() => deleteWorkflow(workflow)} />
                    ))}
                    {!filteredWorkflows.length ? (
                        <div className="col-span-full rounded-lg border border-dashed border-stone-300 bg-white/70 py-14 dark:border-stone-800 dark:bg-stone-900/60">
                            <Empty description="暂无工作流" />
                        </div>
                    ) : null}
                </section>

                {workflowTasks.length ? (
                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-base font-semibold">
                                <LoaderCircle className={`size-4 ${runningTaskCount ? "animate-spin" : ""}`} />
                                工作流任务
                                <Tag className="m-0">{workflowTasks.length} 个</Tag>
                                {runningTaskCount ? (
                                    <Tag className="m-0" color="processing">
                                        {runningTaskCount} 运行中
                                    </Tag>
                                ) : null}
                            </div>
                            <Button size="small" onClick={() => setWorkflowTasks((value) => value.filter((task) => task.status === "running"))}>
                                清理已完成
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                            {workflowTasks.map((task) => (
                                <WorkflowTaskCard key={task.id} task={task} now={now} onCopyPrompt={() => void navigator.clipboard.writeText(task.prompt)} onDownload={(image, index) => saveAs(image.imageUrl, `workflow-task-${index + 1}.png`)} />
                            ))}
                        </div>
                    </section>
                ) : null}

                {runResults.length ? (
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <Sparkles className="size-4" />
                            最近运行结果
                            <Tag className="m-0">{runResults.length} 张</Tag>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                            {runResults.map((result, index) => (
                                <div key={result.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
                                    <Image src={result.imageUrl} alt={result.workflowName} className="aspect-[4/3] object-cover" />
                                    <div className="space-y-1 p-2 text-xs">
                                        <div className="line-clamp-1 font-medium">{result.workflowName}</div>
                                        <div className="flex flex-wrap gap-1 text-stone-500">
                                            <Tag className="m-0 text-[10px]">
                                                {result.width}x{result.height}
                                            </Tag>
                                            <Tag className="m-0 text-[10px]">{formatBytes(result.bytes)}</Tag>
                                            <Tag className="m-0 text-[10px]">{formatDuration(result.durationMs)}</Tag>
                                        </div>
                                        <div className="flex justify-end gap-1">
                                            <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard.writeText(result.prompt)} />
                                            <Button size="small" icon={<Download className="size-3.5" />} onClick={() => saveAs(result.imageUrl, `workflow-${index + 1}.png`)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>

            <WorkflowEditorModal
                open={Boolean(editingWorkflow)}
                workflow={editingWorkflow}
                modelConfig={effectiveConfig}
                theme={theme}
                onChange={setEditingWorkflow}
                onCancel={() => setEditingWorkflow(null)}
                onSave={(workflow) => void saveWorkflow(workflow)}
            />
            <Modal title={runningWorkflow?.name || "运行工作流"} open={Boolean(runningWorkflow)} width={980} onCancel={closeRunner} footer={null} destroyOnHidden>
                {runningWorkflow ? (
                    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                        <div className="space-y-3">
                            <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                <div className="text-sm font-medium">变量输入</div>
                                <div className="mt-3 space-y-3">
                                    {runningWorkflow.variables.map((variable) => (
                                        <WorkflowVariableInput key={variable.id} variable={variable} value={inputValues[variable.key] || ""} onChange={(value) => setInputValues((current) => ({ ...current, [variable.key]: value }))} />
                                    ))}
                                    {!runningWorkflow.variables.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此工作流没有变量" /> : null}
                                </div>
                            </div>
                            <Button block type="primary" size="large" icon={<Play className="size-4" />} onClick={() => void runWorkflow()}>
                                启动任务
                            </Button>
                        </div>
                        <div className="space-y-3">
                            <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-sm font-medium">生成提示词预览</span>
                                    <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard.writeText(renderedPrompt)}>
                                        复制
                                    </Button>
                                </div>
                                <Typography.Paragraph className="!mb-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-stone-100 p-3 text-sm dark:bg-stone-950">{renderedPrompt || "填写变量后会在这里预览最终提示词"}</Typography.Paragraph>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-stone-500 dark:text-stone-400">
                                <InfoPill label="模型" value={resolveWorkflowRuntime(runningWorkflow, effectiveConfig).model} />
                                <InfoPill label="接口" value={resolveWorkflowRuntime(runningWorkflow, effectiveConfig).apiMode === "responses" ? "Responses" : "Images"} />
                                <InfoPill label="尺寸" value={runningWorkflow.config.size || effectiveConfig.size} />
                                <InfoPill label="数量" value={`${runningWorkflow.config.count || "1"} 张`} />
                            </div>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </main>
    );
}

function WorkflowCard({ workflow, onRun, onEdit, onCopy, onDelete }: { workflow: CreativeWorkflow; onRun: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void }) {
    return (
        <article className="flex min-h-[250px] flex-col rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="line-clamp-1 text-base font-semibold">{workflow.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                        <Tag className="m-0">{workflow.category || "未分类"}</Tag>
                        <Tag className="m-0">{workflow.variables.length} 个变量</Tag>
                    </div>
                </div>
                <Button type="primary" size="small" icon={<Play className="size-3.5" />} onClick={onRun}>
                    运行
                </Button>
            </div>
            <p className="mt-3 line-clamp-3 min-h-[60px] text-sm text-stone-500 dark:text-stone-400">{workflow.description || "暂无描述"}</p>
            <div className="mt-3 rounded-md bg-stone-100 p-3 text-xs text-stone-600 dark:bg-stone-950 dark:text-stone-300">
                <div className="line-clamp-4 whitespace-pre-wrap">{workflow.config.promptTemplate}</div>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-stone-500">
                <span>{workflow.lastRunAt ? `最近运行 ${formatDate(workflow.lastRunAt)}` : `创建于 ${formatDate(workflow.createdAt)}`}</span>
                <div className="flex gap-1">
                    <Button size="small" icon={<Edit3 className="size-3.5" />} onClick={onEdit} />
                    <Button size="small" icon={<FilePlus2 className="size-3.5" />} onClick={onCopy} />
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete} />
                </div>
            </div>
        </article>
    );
}

function WorkflowTaskCard({ task, now, onCopyPrompt, onDownload }: { task: WorkflowTask; now: number; onCopyPrompt: () => void; onDownload: (image: WorkflowRunResult, index: number) => void }) {
    const elapsedMs = task.status === "running" ? now - task.startedAt : task.durationMs || (task.endedAt || task.startedAt) - task.startedAt;
    const statusView = {
        running: { label: "运行中", color: "processing", icon: <LoaderCircle className="size-4 animate-spin" /> },
        success: { label: "成功", color: "success", icon: <CheckCircle2 className="size-4" /> },
        failed: { label: "失败", color: "error", icon: <AlertCircle className="size-4" /> },
    }[task.status];

    return (
        <article className="overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-3 dark:border-stone-800">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="shrink-0 text-stone-500 dark:text-stone-400">{statusView.icon}</span>
                        <div className="truncate font-medium">{task.workflowName}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                        <Tag className="m-0" color={statusView.color}>
                            {statusView.label}
                        </Tag>
                        <Tag className="m-0">{formatDuration(elapsedMs)}</Tag>
                        <Tag className="m-0">{formatDate(task.startedAt)}</Tag>
                    </div>
                </div>
                <Button size="small" icon={<Copy className="size-3.5" />} onClick={onCopyPrompt}>
                    复制提示词
                </Button>
            </div>
            <div className="space-y-3 p-3">
                <div className="line-clamp-2 whitespace-pre-wrap text-sm text-stone-600 dark:text-stone-300">{task.prompt}</div>
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <InfoPill label="模型" value={task.model} />
                    <InfoPill label="接口" value={task.apiMode === "responses" ? "Responses" : "Images"} />
                    <InfoPill label="尺寸" value={task.config.size || "auto"} />
                    <InfoPill label="数量" value={`${task.count} 张`} />
                    <InfoPill label="质量" value={task.config.quality || "auto"} />
                    <InfoPill label="格式" value={task.config.outputFormat || "png"} />
                    <InfoPill label="超时" value={`${task.config.timeout || "600"}s`} />
                    <InfoPill label="流式" value={task.config.streamImages ? `${task.config.streamPartialImages || "1"} 张` : "关闭"} />
                </div>
                {Object.keys(task.inputs).length ? (
                    <div className="flex flex-wrap gap-1">
                        {Object.entries(task.inputs)
                            .filter(([, value]) => String(value).trim())
                            .slice(0, 6)
                            .map(([key, value]) => (
                                <Tag key={key} className="m-0 max-w-full text-[10px]">
                                    <span className="font-medium">{key}</span>: <span className="inline-block max-w-48 truncate align-bottom">{String(value)}</span>
                                </Tag>
                            ))}
                    </div>
                ) : null}
                {task.error ? <div className="rounded-md bg-red-100 px-2.5 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">{task.error}</div> : null}
                {task.images.length ? (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {task.images.map((image, index) => (
                            <div key={image.id} className="overflow-hidden rounded-md border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-950">
                                <Image src={image.imageUrl} alt={`${task.workflowName} ${index + 1}`} className="aspect-[4/3] object-cover" />
                                <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-stone-500">
                                    <span className="truncate">
                                        {image.width}x{image.height} · {formatBytes(image.bytes)}
                                    </span>
                                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : task.status === "running" ? (
                    <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-stone-300 text-sm text-stone-500 dark:border-stone-800">生成中 {formatDuration(elapsedMs)}</div>
                ) : null}
            </div>
        </article>
    );
}

function WorkflowEditorModal({
    open,
    workflow,
    modelConfig,
    theme,
    onChange,
    onCancel,
    onSave,
}: {
    open: boolean;
    workflow: CreativeWorkflow | null;
    modelConfig: AiConfig;
    theme: CanvasTheme;
    onChange: (workflow: CreativeWorkflow | null) => void;
    onCancel: () => void;
    onSave: (workflow: CreativeWorkflow) => void;
}) {
    if (!workflow) return null;
    const patch = (next: Partial<CreativeWorkflow>) => onChange({ ...workflow, ...next });
    const patchConfig = (next: Partial<WorkflowGenerationConfig>) => patch({ config: { ...workflow.config, ...next } });
    const patchVariable = (id: string, next: Partial<WorkflowVariable>) => patch({ variables: workflow.variables.map((item) => (item.id === id ? normalizeVariable({ ...item, ...next }) : item)) });
    const removeVariable = (id: string) => patch({ variables: workflow.variables.filter((item) => item.id !== id) });

    return (
        <Modal title={workflow.createdAt ? "编辑工作流" : "新建工作流"} open={open} width={1080} onCancel={onCancel} onOk={() => onSave(workflow)} okText="保存" cancelText="取消" destroyOnHidden>
            <div className="grid max-h-[72vh] gap-4 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                    <section className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="text-sm font-medium">基础信息</div>
                        <Input value={workflow.name} placeholder="工作流名称" onChange={(event) => patch({ name: event.target.value })} />
                        <Input value={workflow.category} placeholder="分类，例如 电商海报" onChange={(event) => patch({ category: event.target.value })} />
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={workflow.description} placeholder="适用场景说明" onChange={(event) => patch({ description: event.target.value })} />
                    </section>
                    <section className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">输入变量</span>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => patch({ variables: [...workflow.variables, createVariable()] })}>
                                添加变量
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {workflow.variables.map((variable) => (
                                <div key={variable.id} className="grid gap-2 rounded-md bg-stone-100 p-2 dark:bg-stone-950 lg:grid-cols-[1fr_1fr_120px_auto]">
                                    <Input value={variable.key} placeholder="变量名 product_name" onChange={(event) => patchVariable(variable.id, { key: event.target.value })} />
                                    <Input value={variable.label} placeholder="显示名称" onChange={(event) => patchVariable(variable.id, { label: event.target.value })} />
                                    <Select value={variable.type} options={variableTypeOptions} onChange={(value) => patchVariable(variable.id, { type: value })} />
                                    <div className="flex items-center gap-2">
                                        <Checkbox checked={variable.required} onChange={(event) => patchVariable(variable.id, { required: event.target.checked })}>
                                            必填
                                        </Checkbox>
                                        <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => removeVariable(variable.id)} />
                                    </div>
                                    <Input className="lg:col-span-2" value={variable.defaultValue} placeholder="默认值" onChange={(event) => patchVariable(variable.id, { defaultValue: event.target.value })} />
                                    <Input
                                        className="lg:col-span-2"
                                        value={variable.options.join("\n")}
                                        placeholder="选项，每行一个，仅选项类型使用"
                                        onChange={(event) =>
                                            patchVariable(variable.id, {
                                                options: event.target.value
                                                    .split("\n")
                                                    .map((item) => item.trim())
                                                    .filter(Boolean),
                                            })
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="text-sm font-medium">提示词模板</div>
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={workflow.config.systemPrompt} placeholder="系统提示词，可选" onChange={(event) => patchConfig({ systemPrompt: event.target.value })} />
                        <Input.TextArea autoSize={{ minRows: 7, maxRows: 14 }} value={workflow.config.promptTemplate} placeholder="用户提示词模板，使用 {{变量名}} 插入变量" onChange={(event) => patchConfig({ promptTemplate: event.target.value })} />
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={workflow.config.negativePrompt} placeholder="负面约束，可选" onChange={(event) => patchConfig({ negativePrompt: event.target.value })} />
                    </section>
                </div>
                <aside className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                    <div className="text-sm font-medium">生成配置</div>
                    <ModelPicker config={modelConfig} fullWidth value={workflow.config.imageModel || workflow.config.model} onChange={(value) => patchConfig({ imageModel: value, model: value })} />
                    <Select
                        className="w-full"
                        value={workflow.config.apiMode}
                        options={[
                            { value: "images", label: "Images API" },
                            { value: "responses", label: "Responses API" },
                        ]}
                        onChange={(value) => patchConfig({ apiMode: value })}
                    />
                    <ImageSettingsPanel
                        config={{ ...defaultConfig, ...workflow.config, model: workflow.config.model || defaultConfig.model, imageModel: workflow.config.imageModel || workflow.config.model || defaultConfig.imageModel }}
                        onConfigChange={(key, value) => patchConfig({ [key]: value } as Partial<WorkflowGenerationConfig>)}
                        theme={theme}
                        showTitle={false}
                        className="space-y-4"
                        maxCount={10}
                        quickCount={6}
                        collapsible
                    />
                    <div className="space-y-2 rounded-md bg-stone-100 p-3 text-sm dark:bg-stone-950">
                        <ToggleRow label="流式传输" checked={workflow.config.streamImages} onChange={(checked) => patchConfig({ streamImages: checked })} />
                        <ToggleRow label="返回 Base64" checked={workflow.config.responseFormatB64Json} onChange={(checked) => patchConfig({ responseFormatB64Json: checked })} />
                        <ToggleRow label="Codex CLI 兼容" checked={workflow.config.codexCli} onChange={(checked) => patchConfig({ codexCli: checked })} />
                        <Space.Compact className="w-full">
                            <span className="inline-flex h-8 shrink-0 items-center rounded-l-md border border-r-0 border-stone-300 bg-stone-50 px-3 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">超时(秒)</span>
                            <Input value={workflow.config.timeout} onChange={(event) => patchConfig({ timeout: event.target.value })} />
                        </Space.Compact>
                    </div>
                </aside>
            </div>
        </Modal>
    );
}

function WorkflowVariableInput({ variable, value, onChange }: { variable: WorkflowVariable; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block space-y-1.5 text-sm">
            <span className="flex items-center gap-1 font-medium">
                {variable.label || variable.key}
                {variable.required ? <span className="text-red-500">*</span> : null}
            </span>
            {variable.type === "textarea" ? (
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={value} placeholder={variable.placeholder || variable.defaultValue} onChange={(event) => onChange(event.target.value)} />
            ) : variable.type === "select" ? (
                <Select className="w-full" value={value || undefined} placeholder={variable.placeholder || "请选择"} options={variable.options.map((item) => ({ value: item, label: item }))} onChange={onChange} />
            ) : variable.type === "boolean" ? (
                <Switch checked={value === "true"} onChange={(checked) => onChange(String(checked))} />
            ) : (
                <Input type={variable.type === "number" ? "number" : "text"} value={value} placeholder={variable.placeholder || variable.defaultValue} onChange={(event) => onChange(event.target.value)} />
            )}
        </label>
    );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span>{label}</span>
            <Switch size="small" checked={checked} onChange={onChange} />
        </div>
    );
}

function InfoPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-stone-100 px-3 py-2 dark:bg-stone-950">
            <div>{label}</div>
            <div className="mt-1 truncate text-stone-900 dark:text-stone-100">{value}</div>
        </div>
    );
}

function createBlankWorkflow(config: AiConfig): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        id: nanoid(),
        name: "",
        category: "",
        description: "",
        variables: [createVariable("product_name", "产品名称"), createVariable("selling_points", "产品卖点", "textarea")],
        config: createWorkflowConfig(config),
        createdAt: now,
        updatedAt: now,
    });
}

function createStarterWorkflow(config: AiConfig): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        id: nanoid(),
        name: "电商海报生成",
        category: "电商海报",
        description: "固定海报构图、商业摄影质感和营销文案结构，只替换产品与卖点。",
        variables: [createVariable("product_name", "产品名称"), createVariable("selling_points", "核心卖点", "textarea"), createVariable("campaign", "活动信息")],
        config: {
            ...createWorkflowConfig(config),
            promptTemplate: "为 {{product_name}} 生成一张高端电商海报。\n核心卖点：{{selling_points}}\n活动信息：{{campaign}}\n要求：主体清晰、构图高级、商品有强烈质感，画面适合社交媒体和电商首图。",
        },
        createdAt: now,
        updatedAt: now,
    });
}

function createWorkflowConfig(config: AiConfig): WorkflowGenerationConfig {
    return {
        model: config.model || defaultConfig.model,
        imageModel: config.imageModel || config.model || defaultConfig.imageModel,
        quality: config.quality || defaultConfig.quality,
        size: config.size || defaultConfig.size,
        count: config.count || "1",
        apiMode: config.apiMode || "images",
        outputFormat: config.outputFormat || "png",
        outputCompression: config.outputCompression || "100",
        moderation: config.moderation || "auto",
        timeout: config.timeout || "600",
        streamImages: Boolean(config.streamImages),
        streamPartialImages: config.streamPartialImages || "1",
        responseFormatB64Json: config.responseFormatB64Json !== false,
        codexCli: Boolean(config.codexCli),
        systemPrompt: config.systemPrompt || "",
        promptTemplate: "",
        negativePrompt: "",
    };
}

function createVariable(key = "", label = "", type: WorkflowVariableType = "text"): WorkflowVariable {
    return normalizeVariable({ id: nanoid(), key, label, type, required: true, defaultValue: "", options: [] });
}

function normalizeVariable(variable: WorkflowVariable): WorkflowVariable {
    const key = variable.key.replace(/[^\w.-]/g, "_");
    return { ...variable, key, label: variable.label || key, defaultValue: String(variable.defaultValue || ""), options: Array.isArray(variable.options) ? variable.options : [] };
}

function normalizeWorkflow(workflow: CreativeWorkflow): CreativeWorkflow {
    return {
        ...workflow,
        variables: (workflow.variables || []).map(normalizeVariable),
        config: { ...createWorkflowConfig(defaultConfig), ...(workflow.config || {}) },
        createdAt: workflow.createdAt || Date.now(),
        updatedAt: workflow.updatedAt || Date.now(),
    };
}

function createDefaultInputValues(workflow: CreativeWorkflow) {
    return Object.fromEntries(workflow.variables.map((variable) => [variable.key, variable.defaultValue || (variable.type === "boolean" ? "false" : "")]));
}

function renderPromptTemplate(template: string, values: Record<string, string>) {
    return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key: string) => values[key] || "");
}

function renderWorkflowPrompt(workflow: CreativeWorkflow, values: Record<string, string>) {
    const prompt = renderPromptTemplate(workflow.config.promptTemplate, values).trim();
    const negativePrompt = workflow.config.negativePrompt.trim();
    return negativePrompt ? `${prompt}\n\n避免：${negativePrompt}` : prompt;
}

function resolveWorkflowRuntime(workflow: CreativeWorkflow, baseConfig: AiConfig) {
    const workflowModel = workflow.config.imageModel || workflow.config.model;
    const fallbackModel = baseConfig.imageModel || baseConfig.model;
    if (!workflowModel) return { model: fallbackModel, apiMode: baseConfig.apiMode };
    if (baseConfig.channelMode === "remote" && workflowModel !== fallbackModel && (!baseConfig.models.length || !baseConfig.models.includes(workflowModel))) {
        return { model: fallbackModel, apiMode: baseConfig.apiMode };
    }
    return { model: workflowModel, apiMode: workflow.config.apiMode || baseConfig.apiMode };
}

function buildRunConfig(baseConfig: AiConfig, workflowConfig: WorkflowGenerationConfig, runtime: { model: string; apiMode: AiConfig["apiMode"] }): AiConfig {
    return {
        ...baseConfig,
        ...workflowConfig,
        model: runtime.model,
        imageModel: runtime.model,
        apiMode: runtime.apiMode,
        systemPrompt: workflowConfig.systemPrompt || baseConfig.systemPrompt,
        count: workflowConfig.count || "1",
    };
}

function buildImageHistoryLog({
    workflow,
    prompt,
    config,
    model,
    images,
    durationMs,
    inputs,
}: {
    workflow: CreativeWorkflow;
    prompt: string;
    config: WorkflowGenerationConfig;
    model: string;
    images: ImageHistoryLog["images"];
    durationMs: number;
    inputs: Record<string, unknown>;
}): ImageHistoryLog {
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: workflow.name,
        prompt,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        model,
        config,
        references: [],
        durationMs,
        successCount: images.length,
        failCount: 0,
        imageCount: images.length,
        size: config.size,
        quality: config.quality,
        status: "成功",
        images,
        thumbnails: images.map((image) => image.dataUrl),
        errors: [],
        categoryIds: [],
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowInputs: inputs,
    };
}

function serializeHistoryLog(log: ImageHistoryLog): ImageHistoryLog {
    return {
        ...log,
        images: log.images.map((image) => ({ ...image, dataUrl: "" })),
        thumbnails: [],
    };
}

function formatDate(value: number) {
    return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
