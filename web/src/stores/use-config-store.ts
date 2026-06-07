"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";

export type LocalModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    localChannels: LocalModelChannel[];
    imageChannelId: string;
    videoChannelId: string;
    textChannelId: string;
    activeChannelId: string;
    apiMode: "images" | "responses";
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    timeout: string;
    streamImages: boolean;
    streamPartialImages: string;
    responseFormatB64Json: boolean;
    codexCli: boolean;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    videoCount: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    systemPrompts: {
        image: string;
        video: string;
        text: string;
        workflow: string;
        workflowAgent: string;
    };
    syncModelConfig: boolean;
    syncStorageConfig: boolean;
    models: string[];
    publicChannels: AdminPublicSettings["modelChannel"]["channels"];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    outputFormat: "png" | "jpeg" | "webp";
    outputCompression: string;
    moderation: "auto" | "low";
    count: string;
    canvasImageCount: string;
    seed?: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export const FIXED_USER_API_BASE_URL = "https://kongsubapi.959298.xyz";
export type ModelCapability = "image" | "video" | "text" | "audio";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: FIXED_USER_API_BASE_URL,
    apiKey: "",
    localChannels: [],
    imageChannelId: "",
    videoChannelId: "",
    textChannelId: "",
    activeChannelId: "",
    apiMode: "images",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "grok-imagine-video",
    textModel: "gpt-5.5",
    timeout: "600",
    streamImages: false,
    streamPartialImages: "1",
    responseFormatB64Json: true,
    codexCli: false,
    audioModel: "gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    videoCount: "1",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    systemPrompts: { image: "", video: "", text: "", workflow: "", workflowAgent: "" },
    syncModelConfig: false,
    syncStorageConfig: false,
    models: [],
    publicChannels: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "auto",
    size: "1:1",
    outputFormat: "png",
    outputCompression: "100",
    moderation: "auto",
    count: "1",
    canvasImageCount: "3",
    seed: "",
};

type ConfigStore = {
    config: AiConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null) {
    const channelMode = modelChannel?.allowCustomChannel ? config.channelMode : "remote";
    if (channelMode === "local" || !modelChannel) return { ...normalizeLocalConfig(config), channelMode };
    const models = modelChannel.availableModels;
    const textModels = filterModelsByCapability(models, "text");
    const imageModels = filterModelsByCapability(models, "image");
    const videoModels = filterModelsByCapability(models, "video");
    const audioModels = filterModelsByCapability(models, "audio");
    const fallbackTextModel = validDefault(modelChannel.defaultTextModel, textModels) || preferredModel(textModels, isTextModelName);
    const fallbackModel = validDefault(modelChannel.defaultModel, textModels) || fallbackTextModel || models[0] || "";
    const fallbackImageModel = validDefault(modelChannel.defaultImageModel, imageModels) || preferredModel(imageModels, isImageModelName) || fallbackModel;
    const fallbackVideoModel = validDefault(modelChannel.defaultVideoModel, videoModels) || preferredModel(videoModels, isVideoModelName) || fallbackModel;
    const fallbackAudioModel = preferredModel(audioModels, isAudioModelName);
    const channels = modelChannel.channels || [];
    const imageChannelId = validChannelId(config.imageChannelId, channels, config.imageModel) || channelIdForModel(channels, modelChannel.defaultImageModel || fallbackImageModel);
    const videoChannelId = validChannelId(config.videoChannelId, channels, config.videoModel) || channelIdForModel(channels, modelChannel.defaultVideoModel || fallbackVideoModel);
    const textChannelId = validChannelId(config.textChannelId, channels, config.textModel) || channelIdForModel(channels, modelChannel.defaultTextModel || fallbackTextModel || fallbackModel);
    return {
        ...config,
        channelMode,
        models,
        publicChannels: channels,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        model: textModels.includes(config.model) ? config.model : fallbackModel,
        imageModel: imageModels.includes(config.imageModel) ? config.imageModel : fallbackImageModel,
        videoModel: videoModels.includes(config.videoModel) ? config.videoModel : fallbackVideoModel,
        textModel: textModels.includes(config.textModel) ? config.textModel : fallbackTextModel || fallbackModel,
        audioModel: audioModels.includes(config.audioModel) ? config.audioModel : fallbackAudioModel,
        imageChannelId,
        videoChannelId,
        textChannelId,
        systemPrompt: modelChannel.systemPrompts?.image || modelChannel.systemPrompt,
        systemPrompts: modelChannel.systemPrompts || defaultConfig.systemPrompts,
    };
}

function normalizeLocalConfig(config: AiConfig) {
    const localChannels = normalizeLocalChannels(config);
    const models = Array.from(new Set(localChannels.flatMap((channel) => channel.models)));
    return { ...config, localChannels, models };
}

export function normalizeLocalChannels(config: Partial<AiConfig>) {
    const channels = Array.isArray(config.localChannels) ? config.localChannels : [];
    const normalized = channels.map((channel, index) => ({
        id: channel.id || `local-${index + 1}`,
        name: typeof channel.name === "string" ? channel.name : `???? ${index + 1}`,
        baseUrl: FIXED_USER_API_BASE_URL,
        apiKey: channel.apiKey || "",
        models: Array.isArray(channel.models) ? channel.models.filter(Boolean) : [],
    }));
    if (!normalized.length) {
        normalized.push({ id: "local-default", name: "User API Key", baseUrl: FIXED_USER_API_BASE_URL, apiKey: config.apiKey || "", models: Array.isArray(config.models) ? config.models.filter(Boolean) : [] });
    }
    return normalized;
}

function validChannelId(channelId: string, channels: AdminPublicSettings["modelChannel"]["channels"], model: string) {
    return channels.some((channel) => channel.id === channelId && channel.models.includes(model)) ? channelId : "";
}

function channelIdForModel(channels: AdminPublicSettings["modelChannel"]["channels"], model: string) {
    return channels.find((channel) => channel.models.includes(model))?.id || channels[0]?.id || "";
}

function validDefault(model: string, models: string[]) {
    return models.includes(model) ? model : "";
}

function preferredModel(models: string[], predicate: (model: string) => boolean) {
    return models.find(predicate) || "";
}

function isVideoModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo");
}

function isImageModelName(model: string) {
    const value = model.toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = localChannelForActiveModel({ ...config, model });
    return Boolean(model.trim()) && (config.channelMode === "remote" || Boolean(channel?.baseUrl.trim() && channel?.apiKey.trim()));
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            publicSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config }),
            merge: (persisted, current) => {
                const persistedConfig = ((persisted as Partial<ConfigStore>).config || {}) as Partial<AiConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                return {
                    ...current,
                    config: {
                        ...config,
                        localChannels: normalizeLocalChannels(config),
                        baseUrl: FIXED_USER_API_BASE_URL,
                        apiKey: normalizeLocalChannels(config)[0]?.apiKey || config.apiKey,
                        imageChannelId: config.imageChannelId || normalizeLocalChannels(config)[0]?.id || "",
                        videoChannelId: config.videoChannelId || normalizeLocalChannels(config)[0]?.id || "",
                        textChannelId: config.textChannelId || normalizeLocalChannels(config)[0]?.id || "",
                        activeChannelId: config.activeChannelId || "",
                        channelMode: config.channelMode || "remote",
                        apiMode: config.apiMode === "responses" ? "responses" : "images",
                        imageModel: config.imageModel || config.model,
                        videoModel: config.videoModel || "grok-imagine-video",
                        textModel: config.textModel || config.model,
                        timeout: config.timeout || "600",
                        streamImages: config.streamImages === true,
                        streamPartialImages: config.streamPartialImages || "1",
                        responseFormatB64Json: config.responseFormatB64Json !== false,
                        codexCli: config.codexCli === true,
                        audioModel: config.audioModel || defaultConfig.audioModel,
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "6",
                        videoCount: config.videoCount || "1",
                        vquality: config.vquality || "720",
                        outputFormat: ["jpeg", "webp"].includes(config.outputFormat) ? config.outputFormat : "png",
                        outputCompression: config.outputCompression || "100",
                        moderation: config.moderation === "low" ? "low" : "auto",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: config.canvasImageCount || "3",
                        systemPrompts: { ...defaultConfig.systemPrompts, ...(config.systemPrompts || {}) },
                        syncModelConfig: config.syncModelConfig === true,
                        syncStorageConfig: config.syncStorageConfig === true,
                        seed: config.seed ?? "",
                        publicChannels: Array.isArray(config.publicChannels) ? config.publicChannels : [],
                        imageModels: Array.isArray(persistedConfig.imageModels) ? normalizeModelList(config.imageModels) : filterModelsByCapability(config.models, "image"),
                        videoModels: Array.isArray(persistedConfig.videoModels) ? normalizeModelList(config.videoModels) : filterModelsByCapability(config.models, "video"),
                        textModels: Array.isArray(persistedConfig.textModels) ? normalizeModelList(config.textModels) : filterModelsByCapability(config.models, "text"),
                        audioModels: Array.isArray(persistedConfig.audioModels) ? normalizeModelList(config.audioModels) : filterModelsByCapability(config.models, "audio"),
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    return useMemo(() => resolveEffectiveConfig(config, modelChannel), [config, modelChannel]);
}

export function channelIdForActiveModel(config: AiConfig) {
    if (config.activeChannelId) return config.activeChannelId;
    if (config.model === config.videoModel) return config.videoChannelId;
    if (config.model === config.textModel) return config.textChannelId;
    return config.imageChannelId;
}

export function localChannelForActiveModel(config: AiConfig) {
    const channels = normalizeLocalChannels(config);
    const preferredId = channelIdForActiveModel(config);
    return channels.find((channel) => channel.id === preferredId && channel.models.includes(config.model)) || channels.find((channel) => channel.models.includes(config.model)) || channels.find((channel) => channel.id === preferredId) || channels[0];
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
