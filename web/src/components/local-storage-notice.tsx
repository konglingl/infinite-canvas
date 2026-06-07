"use client";

import { Database, Download, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type LocalStorageScope = "home" | "assets" | "image" | "video" | "canvas";

type LocalStorageNoticeProps = {
    scope?: LocalStorageScope;
    compact?: boolean;
    className?: string;
};

const scopeCopy: Record<LocalStorageScope, string> = {
    home: "素材、画布、生图结果等创作文件",
    assets: "我的素材里的图片、视频等文件",
    image: "参考图、生成图片和生图历史",
    video: "生成视频、普通参考素材和视频历史",
    canvas: "画布项目以及画布里的图片、视频、音频节点",
};

export function LocalStorageNotice({ scope = "home", compact = false, className }: LocalStorageNoticeProps) {
    return (
        <div
            className={cn(
                "rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-left text-xs leading-5 text-sky-900 shadow-sm dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-100",
                className,
            )}
        >
            <div className="flex gap-3">
                <Database className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" />
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="inline-flex items-center gap-1">
                            <Info className="size-3.5" />
                            本地保存提醒
                        </span>
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-white/10 dark:text-sky-200">浏览器站点数据 / IndexedDB / 当前站点</span>
                    </div>
                    <p>
                        {scopeCopy[scope]}主要保存在当前浏览器本地数据中，不是服务器文件夹，也不是电脑里的普通下载目录。请不要清理当前站点数据、浏览器缓存或卸载/重置浏览器。
                    </p>
                    {!compact ? (
                        <p className="inline-flex flex-wrap items-center gap-1 text-sky-800/90 dark:text-sky-100/85">
                            <Download className="size-3.5" />
                            换设备、换浏览器或清理站点数据前，请先使用“导出素材 / 导出画布”或下载结果文件做备份。
                        </p>
                    ) : null}
                    {scope === "video" ? <p className="text-sky-800/90 dark:text-sky-100/85">使用 Seedance / 火山等需要公网参考素材的模型时，参考图、视频或音频可能会临时上传到服务器；普通素材和生成历史仍以浏览器本地保存为主。</p> : null}
                </div>
            </div>
        </div>
    );
}
