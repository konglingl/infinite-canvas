"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Empty, Input, Segmented, Tag } from "antd";
import { ArrowLeft, Film, Layers3, Library, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

import { defaultVideoStudioProject, normalizeVideoStudioProject, type VideoStudioAssetRef, type VideoStudioClip, type VideoStudioProject, type VideoStudioTrackKind } from "./types";
import { deleteVideoStudioProject, listVideoStudioProjects, saveVideoStudioProject } from "./storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

const VIDEO_STUDIO_PROJECT_EXPORT_TYPE = "infinite-canvas-video-studio-project";
const VIDEO_STUDIO_PROJECT_SCHEMA_VERSION = 2;

type ClipInfo = {
    clip: VideoStudioClip;
    trackId: string;
    trackName: string;
};

const TRACK_COLORS: Record<VideoStudioTrackKind, string> = {
    video: "bg-sky-500/35 text-sky-50 ring-sky-300/30",
    image: "bg-purple-500/35 text-purple-50 ring-purple-300/30",
    overlay: "bg-fuchsia-500/35 text-fuchsia-50 ring-fuchsia-300/30",
    voice: "bg-amber-500/35 text-amber-50 ring-amber-300/30",
    audio: "bg-emerald-500/35 text-emerald-50 ring-emerald-300/30",
    subtitle: "bg-slate-500/45 text-slate-50 ring-slate-300/30",
};

function findClip(project: VideoStudioProject, clipId?: string | null): ClipInfo | null {
    if (!clipId) return null;
    for (const track of project.tracks) {
        const clip = track.clips.find((item) => item.id === clipId);
        if (clip) return { clip, trackId: track.id, trackName: track.name };
    }
    return null;
}

function findPreviewClip(project: VideoStudioProject, selectedClipId?: string | null): ClipInfo | null {
    const selected = findClip(project, selectedClipId);
    if (selected) return selected;
    const preferredKinds: VideoStudioTrackKind[] = ["video", "image", "overlay", "subtitle"];
    for (const kind of preferredKinds) {
        const track = project.tracks.find((item) => item.kind === kind && item.clips.length > 0);
        if (track?.clips[0]) return { clip: track.clips[0], trackId: track.id, trackName: track.name };
    }
    return null;
}

function calculateDuration(project: VideoStudioProject) {
    return Math.max(30000, ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)));
}

function formatMs(ms: number) {
    return `${Math.round(ms / 100) / 10}s`;
}

function previewBoxSize(aspectRatio: VideoStudioProject["aspectRatio"]) {
    if (aspectRatio === "9:16") return { width: 236, height: 420 };
    if (aspectRatio === "1:1") return { width: 360, height: 360 };
    return { width: 520, height: 292 };
}

function clampPercent(value: number, fallback: number) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(100, Math.max(0, value));
}

function percentInput(value: number | undefined, fallback: number, onChange: (value: number) => void) {
    return <Input size="small" type="number" min={0} max={100} value={value ?? fallback} onChange={(event) => onChange(clampPercent(Number(event.target.value), fallback))} />;
}

export default function VideoStudioPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const importProjectRef = useRef<HTMLInputElement>(null);
    const [project, setProject] = useState<VideoStudioProject>(() => defaultVideoStudioProject(nanoid(), "视频编辑器迁移预览"));
    const [projects, setProjects] = useState<VideoStudioProject[]>([]);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const assets = useAssetStore((state) => state.assets);
    const mediaAssets = assets.filter((asset) => asset.kind === "image" || asset.kind === "video");
    const selectedClipInfo = useMemo(() => findClip(project, selectedClipId), [project, selectedClipId]);
    const selectedAsset = selectedClipInfo?.clip.assetId ? project.assets.find((asset) => asset.id === selectedClipInfo.clip.assetId) : undefined;
    const previewClipInfo = useMemo(() => findPreviewClip(project, selectedClipId), [project, selectedClipId]);
    const previewAsset = previewClipInfo?.clip.assetId ? project.assets.find((asset) => asset.id === previewClipInfo.clip.assetId) : undefined;
    const overlayClips = useMemo(() => project.tracks.find((track) => track.kind === "overlay")?.clips || [], [project.tracks]);
    const subtitleClips = useMemo(() => project.tracks.find((track) => track.kind === "subtitle")?.clips || [], [project.tracks]);
    const projectStats = useMemo(() => {
        const clips = project.tracks.reduce((sum, track) => sum + track.clips.length, 0);
        const lockedTracks = project.tracks.filter((track) => track.locked).length;
        const mutedTracks = project.tracks.filter((track) => track.muted).length;
        return { clips, lockedTracks, mutedTracks };
    }, [project.tracks]);

    const refreshProjects = async () => setProjects((await listVideoStudioProjects()).map(normalizeVideoStudioProject));

    useEffect(() => {
        void refreshProjects();
    }, []);

    useEffect(() => {
        if (selectedClipId && !selectedClipInfo) setSelectedClipId(null);
    }, [selectedClipId, selectedClipInfo]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
            if (event.key === "Escape") {
                setSelectedClipId(null);
                return;
            }
            if ((event.key === "Delete" || event.key === "Backspace") && selectedClipInfo) {
                event.preventDefault();
                removeClip(selectedClipInfo.trackId, selectedClipInfo.clip.id);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectedClipInfo]);

    const saveProject = async () => {
        const saved = await saveVideoStudioProject(normalizeVideoStudioProject(project));
        setProject(saved);
        await refreshProjects();
        message.success("视频工程已保存到本地");
    };

    const exportProject = () => {
        const normalized = normalizeVideoStudioProject(project);
        const payload = {
            type: VIDEO_STUDIO_PROJECT_EXPORT_TYPE,
            schemaVersion: VIDEO_STUDIO_PROJECT_SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            project: normalized,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        saveAs(blob, `${project.title || "video-studio-project"}.json`);
    };

    const importProject = async (file?: File) => {
        if (!file) return;
        const payload = JSON.parse(await file.text()) as { type?: string; version?: number; schemaVersion?: number; project?: VideoStudioProject };
        if (payload.type !== "infinite-canvas-video-studio-project" || !payload.project?.id) throw new Error("不是有效的视频工程文件");
        const next = await saveVideoStudioProject(normalizeVideoStudioProject({ ...payload.project, id: payload.project.id || nanoid(), updatedAt: Date.now() }));
        setProject(next);
        setSelectedClipId(null);
        await refreshProjects();
        message.success("视频工程已导入");
    };

    const deleteProject = async (projectId: string) => {
        await deleteVideoStudioProject(projectId);
        if (project.id === projectId) {
            setProject(defaultVideoStudioProject(nanoid(), "未命名视频工程"));
            setSelectedClipId(null);
        }
        await refreshProjects();
        message.success("本地视频工程已删除");
    };

    const removeAssetFromProject = (assetId: string) => {
        if (selectedAsset?.id === assetId) setSelectedClipId(null);
        setProject((value) => ({
            ...value,
            assets: value.assets.filter((asset) => asset.id !== assetId),
            tracks: value.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.assetId !== assetId) })),
            updatedAt: Date.now(),
        }));
    };

    const createProject = () => {
        setProject(defaultVideoStudioProject(nanoid(), "未命名视频工程"));
        setSelectedClipId(null);
        message.info("已新建空白视频工程");
    };

    const addAssetToProject = (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video") return;
        const nextAsset: VideoStudioAssetRef = asset.kind === "image"
            ? { id: asset.id, kind: "image", title: asset.title, url: asset.data.dataUrl, storageKey: asset.data.storageKey, width: asset.data.width, height: asset.data.height, mimeType: asset.data.mimeType }
            : { id: asset.id, kind: "video", title: asset.title, url: asset.data.url, storageKey: asset.data.storageKey, width: asset.data.width, height: asset.data.height, mimeType: asset.data.mimeType };
        setProject((value) => ({ ...value, assets: [nextAsset, ...value.assets.filter((item) => item.id !== nextAsset.id)], updatedAt: Date.now() }));
        message.success("已加入当前视频工程");
    };

    const setProjectAspectRatio = (aspectRatio: VideoStudioProject["aspectRatio"]) => {
        const size = aspectRatio === "9:16" ? { width: 720, height: 1280 } : aspectRatio === "1:1" ? { width: 1080, height: 1080 } : { width: 1280, height: 720 };
        setProject((value) => ({ ...value, aspectRatio, ...size, updatedAt: Date.now() }));
    };

    const updateTrack = (trackId: string, patch: { muted?: boolean; locked?: boolean }) => {
        setProject((value) => ({ ...value, tracks: value.tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track)), updatedAt: Date.now() }));
    };

    const updateClip = (clipId: string, patch: Partial<VideoStudioClip>) => {
        setProject((value) => {
            const tracks = value.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)) }));
            return { ...value, tracks, durationMs: calculateDuration({ ...value, tracks }), updatedAt: Date.now() };
        });
    };

    const removeClip = (trackId: string, clipId: string) => {
        const track = project.tracks.find((item) => item.id === trackId);
        if (track?.locked) {
            message.warning("轨道已锁定，无法删除片段");
            return;
        }
        if (selectedClipId === clipId) setSelectedClipId(null);
        setProject((value) => ({ ...value, tracks: value.tracks.map((track) => (track.id === trackId ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) } : track)), updatedAt: Date.now() }));
    };

    const duplicateSelectedClip = () => {
        if (!selectedClipInfo) return;
        const nextId = nanoid();
        const copy: VideoStudioClip = { ...selectedClipInfo.clip, id: nextId, startMs: selectedClipInfo.clip.startMs + selectedClipInfo.clip.durationMs, title: `${selectedClipInfo.clip.title || selectedClipInfo.clip.kind} 副本` };
        setProject((value) => {
            const tracks = value.tracks.map((track) => (track.id === selectedClipInfo.trackId ? { ...track, clips: [...track.clips, copy] } : track));
            return { ...value, tracks, durationMs: calculateDuration({ ...value, tracks }), updatedAt: Date.now() };
        });
        setSelectedClipId(nextId);
    };

    const clearTimeline = () => {
        setSelectedClipId(null);
        setProject((value) => ({ ...value, tracks: value.tracks.map((track) => ({ ...track, clips: [] })), durationMs: 30000, updatedAt: Date.now() }));
        message.info("已清空时间线");
    };

    const sortTimelineClips = () => {
        setProject((value) => {
            const tracks = value.tracks.map((track) => ({ ...track, clips: [...track.clips].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)) }));
            return { ...value, tracks, durationMs: calculateDuration({ ...value, tracks }), updatedAt: Date.now() };
        });
        message.success("已按起始时间整理时间线");
    };

    const compactTimelineClips = () => {
        setProject((value) => {
            const tracks = value.tracks.map((track) => {
                if (track.locked) return track;
                let cursor = 0;
                const clips = [...track.clips]
                    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
                    .map((clip) => {
                        const next = { ...clip, startMs: cursor };
                        cursor += clip.durationMs;
                        return next;
                    });
                return { ...track, clips };
            });
            return { ...value, tracks, durationMs: calculateDuration({ ...value, tracks }), updatedAt: Date.now() };
        });
        message.success("已压紧未锁定轨道片段");
    };

    const addAllAssetsToTimeline = () => {
        setProject((value) => {
            const source = normalizeVideoStudioProject(value);
            const media = source.assets.filter((asset) => asset.kind === "image" || asset.kind === "video");
            let imageStart = source.tracks.find((track) => track.kind === "image")?.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0) || 0;
            let videoStart = source.tracks.find((track) => track.kind === "video")?.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0) || 0;
            const tracks = source.tracks.map((track) => {
                if (track.locked || (track.kind !== "image" && track.kind !== "video")) return track;
                const nextClips = [...track.clips];
                media.filter((asset) => asset.kind === track.kind).forEach((asset) => {
                    const startMs = track.kind === "video" ? videoStart : imageStart;
                    const durationMs = asset.kind === "video" && asset.durationMs ? asset.durationMs : 3000;
                    nextClips.push({ id: nanoid(), trackId: track.id, assetId: asset.id, kind: track.kind, title: asset.title, startMs, durationMs });
                    if (track.kind === "video") videoStart += durationMs;
                    else imageStart += durationMs;
                });
                return { ...track, clips: nextClips };
            });
            return { ...source, tracks, durationMs: Math.max(source.durationMs, imageStart, videoStart), updatedAt: Date.now() };
        });
        message.success("已将工程素材加入时间线");
    };

    const addAssetToTimeline = (asset: VideoStudioAssetRef) => {
        const targetKind = asset.kind === "video" ? "video" : "image";
        const clipId = nanoid();
        setProject((value) => {
            const source = normalizeVideoStudioProject(value);
            const trackIndex = source.tracks.findIndex((track) => track.kind === targetKind);
            if (trackIndex < 0) return source;
            const track = source.tracks[trackIndex];
            if (track.locked) return source;
            const startMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
            const clip = { id: clipId, trackId: track.id, assetId: asset.id, kind: targetKind, title: asset.title, startMs, durationMs: asset.kind === "video" && asset.durationMs ? asset.durationMs : 3000 };
            const tracks = source.tracks.map((item, index) => (index === trackIndex ? { ...item, clips: [...item.clips, clip] } : item));
            return { ...source, tracks, durationMs: Math.max(source.durationMs, startMs + clip.durationMs), updatedAt: Date.now() };
        });
        setSelectedClipId(clipId);
        message.success("已加入时间线");
    };

    const addAudioPlaceholderClip = (kind: "voice" | "audio") => {
        const clipId = nanoid();
        setProject((value) => {
            const source = normalizeVideoStudioProject(value);
            const trackIndex = source.tracks.findIndex((track) => track.kind === kind);
            if (trackIndex < 0) return source;
            const track = source.tracks[trackIndex];
            if (track.locked) return source;
            const startMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
            const clip: VideoStudioClip = { id: clipId, trackId: track.id, kind, title: kind === "voice" ? "旁白占位" : "音效占位", startMs, durationMs: 3000, volume: 100, muted: false };
            const tracks = source.tracks.map((item, index) => (index === trackIndex ? { ...item, clips: [...item.clips, clip] } : item));
            return { ...source, tracks, durationMs: Math.max(source.durationMs, startMs + clip.durationMs), updatedAt: Date.now() };
        });
        setSelectedClipId(clipId);
        message.success(kind === "voice" ? "已新增旁白占位" : "已新增音效占位");
    };

    const addSubtitleClip = () => {
        const clipId = nanoid();
        setProject((value) => {
            const source = normalizeVideoStudioProject(value);
            const trackIndex = source.tracks.findIndex((track) => track.kind === "subtitle");
            if (trackIndex < 0) return source;
            const track = source.tracks[trackIndex];
            if (track.locked) return source;
            const startMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
            const clip: VideoStudioClip = { id: clipId, trackId: track.id, kind: "subtitle", title: "字幕片段", text: "输入字幕文本", startMs, durationMs: 3000, xPct: 50, yPct: 84, widthPct: 78, borderRadiusPct: 10, opacity: 100 };
            const tracks = source.tracks.map((item, index) => (index === trackIndex ? { ...item, clips: [...item.clips, clip] } : item));
            return { ...source, tracks, durationMs: Math.max(source.durationMs, startMs + clip.durationMs), updatedAt: Date.now() };
        });
        setSelectedClipId(clipId);
        message.success("已新增字幕片段");
    };

    const addAssetToOverlayTrack = (asset: VideoStudioAssetRef) => {
        const clipId = nanoid();
        setProject((value) => {
            const source = normalizeVideoStudioProject(value);
            const trackIndex = source.tracks.findIndex((track) => track.kind === "overlay");
            if (trackIndex < 0) return source;
            const track = source.tracks[trackIndex];
            if (track.locked) return source;
            const startMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
            const clip: VideoStudioClip = { id: clipId, trackId: track.id, assetId: asset.id, kind: "overlay", title: asset.title, startMs, durationMs: 3000, xPct: 64, yPct: 58, widthPct: 28, heightPct: 28, borderRadiusPct: 8, opacity: 100 };
            const tracks = source.tracks.map((item, index) => (index === trackIndex ? { ...item, clips: [...item.clips, clip] } : item));
            return { ...source, tracks, durationMs: Math.max(source.durationMs, startMs + clip.durationMs), updatedAt: Date.now() };
        });
        setSelectedClipId(clipId);
        message.success("已加入画中画轨道");
    };

    const previewSize = previewBoxSize(project.aspectRatio);

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100">
            <input ref={importProjectRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importProject(event.target.files?.[0]).finally(() => { event.currentTarget.value = ""; })} />
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                <div className="flex items-center gap-3">
                    <Button size="small" icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/video")}>返回视频生成</Button>
                    <div>
                        <div className="flex items-center gap-2 text-lg font-semibold"><Film className="size-5 text-purple-300" /><Input variant="borderless" className="!px-0 !text-lg !font-semibold !text-slate-100" value={project.title} onChange={(event) => setProject((value) => ({ ...value, title: event.target.value, updatedAt: Date.now() }))} /></div>
                        <div className="mt-0.5 text-xs text-slate-400">MagicalCanvas 视频/音频编辑模块迁移壳 · 暂不替换现有 /video</div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Segmented size="small" value={project.aspectRatio} options={["16:9", "9:16", "1:1"]} onChange={(value) => setProjectAspectRatio(value as VideoStudioProject["aspectRatio"])} />
                    <Tag color="blue">{project.width}×{project.height}</Tag>
                    <Tag color="default">{Math.round(project.durationMs / 1000)}s</Tag>
                    <Button size="small" onClick={createProject}>新建</Button>
                    <Button size="small" onClick={exportProject}>导出</Button>
                    <Button size="small" onClick={() => importProjectRef.current?.click()}>导入</Button>
                    <Button size="small" type="primary" onClick={() => void saveProject()}>保存工程</Button>
                </div>
            </header>

            <section className="grid min-h-[calc(100vh-65px)] grid-cols-[280px_minmax(0,1fr)]">
                <aside className="border-r border-white/10 bg-slate-900/70 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 font-medium"><Library className="size-4" />素材库</div>
                        <Button size="small" icon={<Plus className="size-3.5" />} disabled>导入</Button>
                    </div>
                    {mediaAssets.length ? (
                        <div className="space-y-2">
                            {mediaAssets.slice(0, 24).map((asset) => (
                                <div key={asset.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm text-slate-100">{asset.title}</div>
                                            <div className="mt-0.5 text-xs text-slate-500">{asset.kind === "image" ? "图片" : "视频"}</div>
                                        </div>
                                        <Button size="small" onClick={() => addAssetToProject(asset)}>加入</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-slate-400">暂无图片/视频素材；后续会接入更多素材来源</span>} />
                    )}
                    <div className="mt-6">
                        <div className="mb-2 text-sm font-medium text-slate-300">本地工程</div>
                        <div className="space-y-2">
                            {projects.length ? projects.map((item) => (
                                <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm">
                                    <button type="button" className="w-full text-left hover:bg-white/[0.04]" onClick={() => setProject(normalizeVideoStudioProject(item))}>
                                        <div className="truncate text-slate-100">{item.title}</div>
                                        <div className="mt-1 text-xs text-slate-500">{new Date(item.updatedAt).toLocaleString()}</div>
                                    </button>
                                    <Button className="mt-2" size="small" danger onClick={() => void deleteProject(item.id)}>删除</Button>
                                </div>
                            )) : <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">暂无本地视频工程，点击右上角保存当前工程。</div>}
                        </div>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-col">
                    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4 p-4">
                        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-black/50 p-6 shadow-inner">
                            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl" style={{ width: previewSize.width, height: previewSize.height }}>
                                {previewAsset?.kind === "image" && previewAsset.url ? (
                                    <img src={previewAsset.url} alt={previewAsset.title} className="size-full object-contain" />
                                ) : previewAsset?.kind === "video" && previewAsset.url ? (
                                    <video key={previewAsset.id} src={previewAsset.url} className="size-full object-contain" controls muted playsInline />
                                ) : (
                                    <div className="grid size-full place-items-center p-8 text-center">
                                        <div>
                                            <Sparkles className="mx-auto mb-3 size-10 text-purple-300" />
                                            <div className="text-lg font-semibold">预览画布</div>
                                            <p className="mt-2 max-w-md text-sm text-slate-400">先选择时间线片段或加入素材，即可在此预览图片/视频片段。</p>
                                        </div>
                                    </div>
                                )}
                                {overlayClips.map((clip) => {
                                    const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
                                    if (!asset?.url) return null;
                                    const style = { left: `${clip.xPct ?? 64}%`, top: `${clip.yPct ?? 58}%`, width: `${clip.widthPct ?? 28}%`, height: `${clip.heightPct ?? 28}%`, borderRadius: `${clip.borderRadiusPct ?? 8}%`, opacity: (clip.opacity ?? 100) / 100 };
                                    return <button key={clip.id} type="button" className={`absolute overflow-hidden border border-white/40 bg-black/20 shadow-xl ${selectedClipId === clip.id ? "ring-2 ring-fuchsia-300" : ""}`} style={style} onClick={() => setSelectedClipId(clip.id)} title="画中画/贴纸片段">
                                        {asset.kind === "video" ? <video src={asset.url} className="size-full object-cover" muted playsInline /> : <img src={asset.url} alt={asset.title} className="size-full object-cover" />}
                                    </button>;
                                })}
                                {subtitleClips.map((clip) => (
                                    <button key={clip.id} type="button" className={`absolute -translate-x-1/2 rounded-lg bg-black/70 px-3 py-2 text-center text-sm font-medium leading-relaxed text-white shadow-lg backdrop-blur ${selectedClipId === clip.id ? "ring-2 ring-slate-100" : ""}`} style={{ left: `${clip.xPct ?? 50}%`, top: `${clip.yPct ?? 84}%`, width: `${clip.widthPct ?? 78}%`, borderRadius: `${clip.borderRadiusPct ?? 10}px`, opacity: (clip.opacity ?? 100) / 100 }} onClick={() => setSelectedClipId(clip.id)} title="字幕片段">
                                        {clip.text || clip.title || "字幕"}
                                    </button>
                                ))}
                                {previewClipInfo ? (
                                    <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/65 px-3 py-2 text-xs text-white backdrop-blur">
                                        <div className="truncate font-medium">{previewClipInfo.clip.title || previewClipInfo.clip.kind}</div>
                                        <div className="mt-1 text-white/70">{previewClipInfo.trackName} · {formatMs(previewClipInfo.clip.startMs)} - {formatMs(previewClipInfo.clip.startMs + previewClipInfo.clip.durationMs)}</div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <aside className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                            <div className="mb-3 flex items-center gap-2 font-medium"><Layers3 className="size-4" />工程结构</div>
                            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="mb-2 text-sm font-medium">工程素材</div>
                                {project.assets.length ? (
                                    <>
                                        <div className="mb-2 flex flex-wrap gap-2">
                                            <Button size="small" onClick={addAllAssetsToTimeline}>全部加入时间线</Button>
                                            <Button size="small" onClick={addSubtitleClip}>新增字幕</Button>
                                            <Button size="small" danger onClick={clearTimeline}>清空时间线</Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">{project.assets.map((asset) => <span key={asset.id} className="inline-flex items-center rounded border border-white/10 bg-white/[0.04] text-xs"><button type="button" className="px-2 py-1 hover:bg-white/[0.08]" onClick={() => addAssetToTimeline(asset)}><span className={asset.kind === "video" ? "text-sky-300" : "text-purple-300"}>{asset.kind === "video" ? "视频" : "图片"}</span><span className="ml-1 text-slate-100">{asset.title}</span><span className="ml-1 text-slate-500">+时间线</span></button><button type="button" className="border-l border-white/10 px-2 py-1 text-fuchsia-300 hover:bg-white/[0.08]" title="加入画中画/贴纸轨道" onClick={() => addAssetToOverlayTrack(asset)}>PiP</button><button type="button" className="border-l border-white/10 px-1.5 py-1 text-slate-500 hover:text-red-300" title="移除素材" onClick={() => removeAssetFromProject(asset.id)}>×</button></span>)}</div>
                                    </>
                                ) : <div className="text-xs text-slate-500">尚未加入素材</div>}
                            </div>
                            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="mb-2 text-sm font-medium">选中片段</div>
                                {selectedClipInfo ? (
                                    <div className="space-y-2 text-xs text-slate-300">
                                        <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">轨道</span><span>{selectedClipInfo.trackName}</span></div>
                                        <Input size="small" value={selectedClipInfo.clip.title || ""} placeholder="片段名称" onChange={(event) => updateClip(selectedClipInfo.clip.id, { title: event.target.value })} />
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="space-y-1"><span className="text-slate-500">起始(s)</span><Input size="small" type="number" min={0} value={Math.round(selectedClipInfo.clip.startMs / 100) / 10} onChange={(event) => updateClip(selectedClipInfo.clip.id, { startMs: Math.max(0, Number(event.target.value || 0) * 1000) })} /></label>
                                            <label className="space-y-1"><span className="text-slate-500">时长(s)</span><Input size="small" type="number" min={0.1} value={Math.round(selectedClipInfo.clip.durationMs / 100) / 10} onChange={(event) => updateClip(selectedClipInfo.clip.id, { durationMs: Math.max(100, Number(event.target.value || 0.1) * 1000) })} /></label>
                                        </div>
                                        {selectedClipInfo.clip.kind === "subtitle" ? (
                                            <div className="rounded-lg border border-slate-300/20 bg-slate-500/5 p-2">
                                                <div className="mb-2 text-slate-300">字幕文本</div>
                                                <Input.TextArea size="small" autoSize={{ minRows: 2, maxRows: 4 }} value={selectedClipInfo.clip.text || ""} placeholder="输入字幕文本" onChange={(event) => updateClip(selectedClipInfo.clip.id, { text: event.target.value, title: event.target.value.slice(0, 24) || "字幕片段" })} />
                                                <div className="mt-2 grid grid-cols-3 gap-2">
                                                    <label className="space-y-1"><span className="text-slate-500">X%</span>{percentInput(selectedClipInfo.clip.xPct, 50, (value) => updateClip(selectedClipInfo.clip.id, { xPct: value }))}</label>
                                                    <label className="space-y-1"><span className="text-slate-500">Y%</span>{percentInput(selectedClipInfo.clip.yPct, 84, (value) => updateClip(selectedClipInfo.clip.id, { yPct: value }))}</label>
                                                    <label className="space-y-1"><span className="text-slate-500">?%</span>{percentInput(selectedClipInfo.clip.widthPct, 78, (value) => updateClip(selectedClipInfo.clip.id, { widthPct: Math.max(20, value) }))}</label>
                                                </div>
                                            </div>
                                        ) : null}
                                        {selectedAsset ? <div className="truncate text-slate-500">素材：{selectedAsset.title}</div> : null}
                                        <div className="flex gap-2"><Button size="small" onClick={duplicateSelectedClip}>复制</Button><Button size="small" danger onClick={() => removeClip(selectedClipInfo.trackId, selectedClipInfo.clip.id)}>删除</Button></div>
                                    </div>
                                ) : <div className="text-xs text-slate-500">点击时间线片段后，可以预览、修改起始时间/时长或复制片段。</div>}
                            </div>
                            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
                                <div className="mb-2 text-sm font-medium text-slate-200">工程统计</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>???{project.assets.length}</div>
                                    <div>???{projectStats.clips}</div>
                                    <div>???{project.tracks.length}</div>
                                    <div>???{formatMs(project.durationMs)}</div>
                                    <div>静音轨道?{projectStats.mutedTracks}</div>
                                    <div>锁定轨道?{projectStats.lockedTracks}</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {project.tracks.map((track) => (
                                    <div key={track.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                        <div className="flex items-center justify-between gap-2 text-sm">
                                            <span>{track.name}</span>
                                            <div className="flex items-center gap-1">
                                                <Button size="small" type={track.muted ? "primary" : "default"} onClick={() => updateTrack(track.id, { muted: !track.muted })}>{track.muted ? "已静音" : "静音"}</Button>
                                                <Button size="small" type={track.locked ? "primary" : "default"} onClick={() => updateTrack(track.id, { locked: !track.locked })}>{track.locked ? "已锁定" : "锁定"}</Button>
                                                <Tag className="m-0" color="geekblue">{track.kind}</Tag>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-xs text-slate-500">{track.clips.length ? `${track.clips.length} 个片段` : "暂无片段"}</div>
                                    </div>
                                ))}
                            </div>
                        </aside>
                    </div>

                    <footer className="border-t border-white/10 bg-slate-900/80 p-4">
                        <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="font-medium">时间线</span>
                            <span className="text-slate-500">单击选中 / 双击删除；已迁移多轨预览与本地片段管理</span>
                        </div>
                        <div className="space-y-2">
                            {project.tracks.map((track) => (
                                <div key={track.id} className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-3">
                                    <div className="truncate text-xs text-slate-400">{track.name}{track.muted ? " ? 静音" : ""}{track.locked ? " ? 锁定" : ""}</div>
                                    <div className={`flex h-12 items-center gap-1 overflow-x-auto rounded-lg border border-dashed border-white/10 px-1 ${track.locked ? "border-amber-300/30 bg-amber-500/5" : "bg-white/[0.03]"}`}>{track.clips.map((clip) => {
                                        const selected = selectedClipId === clip.id;
                                        return <button key={clip.id} type="button" className={`flex h-8 min-w-20 items-center rounded px-2 text-left text-xs ring-1 transition ${TRACK_COLORS[clip.kind]} ${selected ? "ring-2 ring-white shadow-[0_0_0_1px_rgba(255,255,255,0.35)]" : "ring-white/10 hover:ring-white/40"}`} style={{ width: `${Math.max(80, clip.durationMs / 40)}px` }} title="单击选中，双击删除片段" onClick={() => setSelectedClipId(clip.id)} onDoubleClick={() => removeClip(track.id, clip.id)}><span className="truncate">{clip.title || clip.kind}</span></button>;
                                    })}</div>
                                </div>
                            ))}
                        </div>
                    </footer>
                </div>
            </section>
        </main>
    );
}
