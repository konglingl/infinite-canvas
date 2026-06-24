export type VideoStudioTrackKind = "video" | "image" | "audio" | "voice" | "subtitle" | "overlay";

export type VideoStudioAssetKind = "image" | "video" | "audio";

export type VideoStudioAssetRef = {
    id: string;
    kind: VideoStudioAssetKind;
    title: string;
    url?: string;
    storageKey?: string;
    durationMs?: number;
    width?: number;
    height?: number;
    mimeType?: string;
};

export type VideoStudioClip = {
    id: string;
    trackId: string;
    assetId?: string;
    kind: VideoStudioTrackKind;
    title?: string;
    startMs: number;
    durationMs: number;
    trimStartMs?: number;
    trimEndMs?: number;
    text?: string;
    volume?: number;
    muted?: boolean;
};

export type VideoStudioTrack = {
    id: string;
    kind: VideoStudioTrackKind;
    name: string;
    muted?: boolean;
    locked?: boolean;
    clips: VideoStudioClip[];
};

export type VideoStudioProject = {
    id: string;
    title: string;
    aspectRatio: "16:9" | "9:16" | "1:1";
    width: number;
    height: number;
    durationMs: number;
    assets: VideoStudioAssetRef[];
    tracks: VideoStudioTrack[];
    updatedAt: number;
};

export const defaultVideoStudioProject = (id: string, title = "未命名视频工程"): VideoStudioProject => ({
    id,
    title,
    aspectRatio: "16:9",
    width: 1280,
    height: 720,
    durationMs: 30000,
    assets: [],
    tracks: [
        { id: `${id}-video`, kind: "video", name: "主视频", clips: [] },
        { id: `${id}-voice`, kind: "voice", name: "旁白", clips: [] },
        { id: `${id}-audio`, kind: "audio", name: "音乐/音效", clips: [] },
        { id: `${id}-subtitle`, kind: "subtitle", name: "字幕", clips: [] },
    ],
    updatedAt: Date.now(),
});

