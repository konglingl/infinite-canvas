"use client";

import { App, Button, Form, Input, Modal, Segmented, Select, Switch } from "antd";
import { useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { fetchImageModels } from "@/services/api/image";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";

export function AppConfigModal() {
    const { message } = App.useApp();
    const [loadingModels, setLoadingModels] = useState(false);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const allowCustomChannel = modelChannel?.allowCustomChannel === true;
    const effectiveMode = allowCustomChannel ? config.channelMode : "remote";
    const modelConfig = effectiveMode === "remote" ? effectiveConfig : config;

    const finishConfig = () => {
        setConfigDialogOpen(false);
        if (effectiveMode === "local" && (!config.baseUrl.trim() || !config.apiKey.trim())) return;
        if (!modelConfig.imageModel.trim() || !modelConfig.videoModel.trim() || !modelConfig.textModel.trim()) return;
        if (!allowCustomChannel && config.channelMode !== "remote") updateConfig("channelMode", "remote");
        message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
        clearPromptContinue();
    };

    const refreshModels = async () => {
        if (effectiveMode === "remote") return;
        if (!config.baseUrl.trim() || !config.apiKey.trim()) {
            message.error("请先填写 Base URL 和 API Key");
            return;
        }
        setLoadingModels(true);
        try {
            const models = await fetchImageModels(config);
            updateConfig("models", models);
            if (models.length && !models.includes(config.imageModel)) updateConfig("imageModel", models[0]);
            if (models.length && !models.includes(config.videoModel)) updateConfig("videoModel", models[0]);
            if (models.length && !models.includes(config.textModel)) updateConfig("textModel", models[0]);
            message.success("模型列表已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingModels(false);
        }
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">配置</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">模型和密钥</div>
                </div>
            }
            open={isConfigOpen}
            width={760}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            footer={
                <Button type="primary" onClick={finishConfig}>
                    完成
                </Button>
            }
        >
            <div className="pt-1">
                <Form layout="vertical" requiredMark={false}>
                    {allowCustomChannel ? (
                        <Form.Item label="渠道模式" className="mb-4">
                            <Segmented
                                block
                                size="middle"
                                value={effectiveMode}
                                onChange={(value) => updateConfig("channelMode", value as AiConfig["channelMode"])}
                                options={[
                                    { label: "本地直连", value: "local" },
                                    { label: "云端渠道", value: "remote" },
                                ]}
                            />
                        </Form.Item>
                    ) : null}
                    {effectiveMode === "local" ? (
                        <>
                            <div className="grid gap-4 md:grid-cols-2">
                                <Form.Item label="Base URL" className="mb-4">
                                    <Input value={config.baseUrl} onChange={(event) => updateConfig("baseUrl", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="API Key" className="mb-4">
                                    <Input.Password value={config.apiKey} onChange={(event) => updateConfig("apiKey", event.target.value)} />
                                </Form.Item>
                            </div>
                            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium">模型列表</div>
                                    <div className="mt-1 text-xs text-stone-500">当前已保存 {config.models.length} 个模型</div>
                                </div>
                                <Button size="small" loading={loadingModels} onClick={() => void refreshModels()}>
                                    拉取模型列表
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="mb-4 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                            <div className="font-medium text-stone-900 dark:text-stone-100">云端渠道</div>
                            <div className="mt-1">由系统后台渠道转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。</div>
                            {modelChannel?.channels?.length ? (
                                <div className="mt-3 grid gap-2">
                                    {modelChannel.channels.slice(0, 4).map((channel, index) => (
                                        <div key={`${channel.name}-${channel.baseUrl}-${index}`} className="rounded-md bg-stone-50 px-2.5 py-2 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium">{channel.name || "未命名渠道"}</span>
                                                <span className="shrink-0">{channel.models.length} 个模型</span>
                                            </div>
                                            <div className="mt-1 truncate opacity-70">{channel.baseUrl}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-3">
                        <Form.Item label="默认生图模型" className="mb-4">
                            <ModelPicker config={modelConfig} value={modelConfig.imageModel} onChange={(model) => updateConfig("imageModel", model)} fullWidth />
                        </Form.Item>
                        <Form.Item label="默认视频模型" className="mb-4">
                            <ModelPicker config={modelConfig} value={modelConfig.videoModel} onChange={(model) => updateConfig("videoModel", model)} fullWidth />
                        </Form.Item>
                        <Form.Item label="默认文本模型" className="mb-4">
                            <ModelPicker config={modelConfig} value={modelConfig.textModel} onChange={(model) => updateConfig("textModel", model)} fullWidth />
                        </Form.Item>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Form.Item label="生图 API 接口" className="mb-4">
                            <Select
                                value={config.apiMode}
                                onChange={(value) => updateConfig("apiMode", value)}
                                options={[
                                    { label: "Image API (/v1/images)", value: "images" },
                                    { label: "Responses API (/v1/responses)", value: "responses" },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item label="请求超时（秒）" className="mb-4">
                            <Input value={config.timeout} inputMode="numeric" onChange={(event) => updateConfig("timeout", event.target.value)} />
                        </Form.Item>
                        <Form.Item label="请求中间步骤图像数" className="mb-4">
                            <Select
                                value={config.streamPartialImages}
                                disabled={!config.streamImages}
                                onChange={(value) => updateConfig("streamPartialImages", value)}
                                options={[
                                    { label: "0 张", value: "0" },
                                    { label: "1 张", value: "1" },
                                    { label: "2 张", value: "2" },
                                    { label: "3 张", value: "3" },
                                ]}
                            />
                        </Form.Item>
                    </div>
                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                        <FeatureSwitch title="流式传输" description="开启后请求中追加 stream，支持读取中间图片事件并避免长时间无数据。" checked={config.streamImages} onChange={(checked) => updateConfig("streamImages", checked)} />
                        <FeatureSwitch title="返回 Base64 图片数据" description="开启后 Image API 请求会追加 response_format: b64_json。" checked={config.responseFormatB64Json} onChange={(checked) => updateConfig("responseFormatB64Json", checked)} />
                        <FeatureSwitch title="Codex CLI 兼容模式" description="开启后减少不兼容参数，并追加防提示词改写前缀。" checked={config.codexCli} onChange={(checked) => updateConfig("codexCli", checked)} />
                    </div>
                    {effectiveMode === "local" ? (
                        <Form.Item label="系统提示词" className="mb-0">
                            <Input.TextArea rows={3} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                        </Form.Item>
                    ) : null}
                </Form>
            </div>
        </Modal>
    );
}

function FeatureSwitch({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{title}</div>
                <Switch checked={checked} onChange={onChange} />
            </div>
            <div className="mt-1 text-xs leading-5 text-stone-500">{description}</div>
        </div>
    );
}
