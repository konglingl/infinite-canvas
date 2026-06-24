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
    xPct?: number;
    yPct?: number;
    widthPct?: number;
    heightPct?: number;
    borderRadiusPct?: number;
    opacity?: number;
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

const VIDEO_STUDIO_DEFAULT_TRACKS: Array<{ suffix: string; kind: VideoStudioTrackKind; name: string }> = [
    { suffix: "video", kind: "video", name: "主视频" },
    { suffix: "image", kind: "image", name: "图片/画面" },
    { suffix: "overlay", kind: "overlay", name: "画中画/贴纸" },
    { suffix: "voice", kind: "voice", name: "旁白" },
    { suffix: "audio", kind: "audio", name: "音乐/音效" },
    { suffix: "subtitle", kind: "subtitle", name: "字幕" },
];

export function createDefaultVideoStudioTracks(projectId: string): VideoStudioTrack[] {
    return VIDEO_STUDIO_DEFAULT_TRACKS.map((track) => ({
        id: `${projectId}-${track.suffix}`,
        kind: track.kind,
        name: track.name,
        clips: [],
    }));
}

export function normalizeVideoStudioProject(project: VideoStudioProject): VideoStudioProject {
    const inputTracks = Array.isArray(project.tracks) ? project.tracks : [];
    const usedTrackIds = new Set<string>();
    const tracks = VIDEO_STUDIO_DEFAULT_TRACKS.map((preset) => {
        const existing = inputTracks.find((track) => track.kind === preset.kind);
        if (existing) {
            usedTrackIds.add(existing.id);
            return { ...existing, name: existing.name || preset.name, clips: Array.isArray(existing.clips) ? existing.clips : [] };
        }
        return { id: `${project.id}-${preset.suffix}`, kind: preset.kind, name: preset.name, clips: [] };
    });
    const extras = inputTracks.filter((track) => !usedTrackIds.has(track.id));
    const durationMs = Math.max(
        30000,
        project.durationMs || 0,
        ...tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)),
        ...extras.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)),
    );
    return { ...project, durationMs, tracks: [...tracks, ...extras] };
}

export const defaultVideoStudioProject = (id: string, title = "未命名视频工程"): VideoStudioProject => ({
    id,
    title,
    aspectRatio: "16:9",
    width: 1280,
    height: 720,
    durationMs: 30000,
    assets: [],
    tracks: createDefaultVideoStudioTracks(id),
    updatedAt: Date.now(),
});
