"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Tag } from "antd";
import { ArrowLeft, Film, Layers3, Library, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";

import { defaultVideoStudioProject, type VideoStudioAssetRef, type VideoStudioProject } from "./types";
import { listVideoStudioProjects, saveVideoStudioProject } from "./storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export default function VideoStudioPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const [project, setProject] = useState<VideoStudioProject>(() => defaultVideoStudioProject(nanoid(), "视频编辑器迁移预览"));
    const [projects, setProjects] = useState<VideoStudioProject[]>([]);
    const assets = useAssetStore((state) => state.assets);
    const mediaAssets = assets.filter((asset) => asset.kind === "image" || asset.kind === "video");

    const refreshProjects = async () => setProjects(await listVideoStudioProjects());

    useEffect(() => {
        void refreshProjects();
    }, []);

    const saveProject = async () => {
        const saved = await saveVideoStudioProject(project);
        setProject(saved);
        await refreshProjects();
        message.success("视频工程已保存到本地");
    };

    const createProject = () => {
        setProject(defaultVideoStudioProject(nanoid(), "未命名视频工程"));
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

    const addAssetToTimeline = (asset: VideoStudioAssetRef) => {
        const targetKind = asset.kind === "video" ? "video" : "image";
        setProject((value) => {
            const trackIndex = value.tracks.findIndex((track) => track.kind === targetKind);
            if (trackIndex < 0) return value;
            const track = value.tracks[trackIndex];
            const startMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
            const clip = { id: nanoid(), trackId: track.id, assetId: asset.id, kind: targetKind, title: asset.title, startMs, durationMs: asset.kind === "video" && asset.durationMs ? asset.durationMs : 3000 };
            const tracks = value.tracks.map((item, index) => (index === trackIndex ? { ...item, clips: [...item.clips, clip] } : item));
            return { ...value, tracks, durationMs: Math.max(value.durationMs, startMs + clip.durationMs), updatedAt: Date.now() };
        });
        message.success("已加入时间线");
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100">
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                <div className="flex items-center gap-3">
                    <Button size="small" icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/video")}>返回视频生成</Button>
                    <div>
                        <div className="flex items-center gap-2 text-lg font-semibold"><Film className="size-5 text-purple-300" /><Input variant="borderless" className="!px-0 !text-lg !font-semibold !text-slate-100" value={project.title} onChange={(event) => setProject((value) => ({ ...value, title: event.target.value, updatedAt: Date.now() }))} /></div>
                        <div className="mt-0.5 text-xs text-slate-400">MagicalCanvas 视频/音频编辑模块迁移壳 · 暂不替换现有 /video</div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Tag color="purple">{project.aspectRatio}</Tag>
                    <Tag color="blue">{project.width}×{project.height}</Tag>
                    <Tag color="default">{Math.round(project.durationMs / 1000)}s</Tag>
                    <Button size="small" onClick={createProject}>新建</Button>
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
                                <button key={item.id} type="button" className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm hover:bg-white/[0.06]" onClick={() => setProject(item)}>
                                    <div className="truncate text-slate-100">{item.title}</div>
                                    <div className="mt-1 text-xs text-slate-500">{new Date(item.updatedAt).toLocaleString()}</div>
                                </button>
                            )) : <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">暂无本地视频工程，点击右上角保存当前工程。</div>}
                        </div>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-col">
                    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4 p-4">
                        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-black/50 shadow-inner">
                            <div className="text-center">
                                <Sparkles className="mx-auto mb-3 size-10 text-purple-300" />
                                <div className="text-lg font-semibold">预览画布</div>
                                <p className="mt-2 max-w-md text-sm text-slate-400">下一阶段会迁移 MagicalCanvas 的时间线预览、画中画、字幕气泡和多轨音频控制；当前只落地 UI 壳和数据结构。</p>
                            </div>
                        </div>
                        <aside className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                            <div className="mb-3 flex items-center gap-2 font-medium"><Layers3 className="size-4" />工程结构</div>
                            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="mb-2 text-sm font-medium">工程素材</div>
                                {project.assets.length ? <div className="flex flex-wrap gap-2">{project.assets.map((asset) => <button key={asset.id} type="button" className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs hover:bg-white/[0.08]" onClick={() => addAssetToTimeline(asset)}><span className={asset.kind === "video" ? "text-sky-300" : "text-purple-300"}>{asset.kind === "video" ? "视频" : "图片"}</span><span className="ml-1 text-slate-100">{asset.title}</span><span className="ml-1 text-slate-500">+时间线</span></button>)}</div> : <div className="text-xs text-slate-500">尚未加入素材</div>}
                            </div>
                            <div className="space-y-2">
                                {project.tracks.map((track) => (
                                    <div key={track.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span>{track.name}</span>
                                            <Tag className="m-0" color="geekblue">{track.kind}</Tag>
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
                            <span className="text-slate-500">多轨视频 / 旁白 / 音乐 / 字幕</span>
                        </div>
                        <div className="space-y-2">
                            {project.tracks.map((track) => (
                                <div key={track.id} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
                                    <div className="truncate text-xs text-slate-400">{track.name}</div>
                                    <div className="flex h-10 items-center gap-1 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-1">{track.clips.map((clip) => <div key={clip.id} className="flex h-7 min-w-20 items-center rounded bg-purple-500/30 px-2 text-xs text-purple-50" style={{ width: `${Math.max(80, clip.durationMs / 40)}px` }} title={clip.title}>{clip.title || clip.kind}</div>)}</div>
                                </div>
                            ))}
                        </div>
                    </footer>
                </div>
            </section>
        </main>
    );
}
