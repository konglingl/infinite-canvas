"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { saveAs } from "file-saver";
import { App, Button, Input, Modal, Switch } from "antd";
import { Archive, Database, Download, FileUp, FolderOpen, Trash2, X } from "lucide-react";

import { createCanvasProjectsBackup, exportCanvasProjects, readCanvasProjectPackage } from "@/app/(user)/canvas/utils/canvas-export";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { createAssetBackupPackage, exportAssets, readAssetPackage } from "@/app/(user)/assets/asset-transfer";
import { clearDefaultBrowserCache } from "@/services/browser-cache-cleanup";
import { createFullLocalDataBackup, restoreFullLocalDataBackup, type FullLocalBackupExtraFile } from "@/services/local-full-backup";
import { chooseLocalBackupFolder, forgetLocalBackupFolder, getLocalAutoBackupSettings, getLocalBackupFolderInfo, isLocalBackupFolderSupported, saveBlobToLocalBackupFolder, saveLocalAutoBackupSettings, type AutoBackupMediaKind, type LocalAutoBackupSettings, type LocalBackupFolderInfo } from "@/services/local-backup-folder";
import { useAssetStore } from "@/stores/use-asset-store";

type LocalDataSettingsModalProps = {
    open: boolean;
    onClose: () => void;
};

type LoadingAction = "chooseFolder" | "forgetFolder" | "backupAll" | "downloadAll" | "importAll" | "backupCanvas" | "downloadCanvas" | "importCanvas" | "backupAssets" | "downloadAssets" | "importAssets" | "clearCache" | null;

export function LocalDataSettingsModal({ open, onClose }: LocalDataSettingsModalProps) {
    const { message, modal } = App.useApp();
    const fullInputRef = useRef<HTMLInputElement>(null);
    const canvasInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
    const [backupFolder, setBackupFolder] = useState<LocalBackupFolderInfo | null>(null);
    const [folderSupported, setFolderSupported] = useState(false);
    const [autoBackupSettings, setAutoBackupSettings] = useState<LocalAutoBackupSettings | null>(null);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const importProject = useCanvasStore((state) => state.importProject);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const validAssets = assets.filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video");

    useEffect(() => {
        if (!open) return;
        const supported = isLocalBackupFolderSupported();
        void getLocalAutoBackupSettings().then(setAutoBackupSettings).catch(() => setAutoBackupSettings(null));
        setFolderSupported(supported);
        if (!supported) {
            setBackupFolder(null);
            return;
        }
        void getLocalBackupFolderInfo().then(setBackupFolder).catch(() => setBackupFolder(null));
    }, [open]);

    const runAction = async (action: Exclude<LoadingAction, null>, task: () => Promise<void>) => {
        setLoadingAction(action);
        try {
            await task();
        } finally {
            setLoadingAction(null);
        }
    };

    const selectBackupFolder = () =>
        runAction("chooseFolder", async () => {
            try {
                const info = await chooseLocalBackupFolder();
                setBackupFolder(info);
                message.success(`已选择备份文件夹：${info.name}`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "选择备份文件夹失败");
            }
        });

    const clearBackupFolder = () =>
        runAction("forgetFolder", async () => {
            await forgetLocalBackupFolder();
            setBackupFolder(null);
            message.success("已取消记住的备份文件夹");
        });

    const updateAutoBackupSettings = async (settings: LocalAutoBackupSettings) => {
        setAutoBackupSettings(settings);
        try {
            setAutoBackupSettings(await saveLocalAutoBackupSettings(settings));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存自动保存设置失败");
        }
    };

    const updateAutoBackupEnabled = (enabled: boolean) => {
        if (!autoBackupSettings) return;
        void updateAutoBackupSettings({ ...autoBackupSettings, enabled });
    };

    const updateAutoBackupItem = (kind: AutoBackupMediaKind | "canvas", patch: Partial<LocalAutoBackupSettings["canvas"]>) => {
        if (!autoBackupSettings) return;
        void updateAutoBackupSettings({ ...autoBackupSettings, [kind]: { ...autoBackupSettings[kind], ...patch } } as LocalAutoBackupSettings);
    };

    const createStructuredBackupFiles = async (timestamp: string) => {
        const files: FullLocalBackupExtraFile[] = [];
        if (canvasProjects.length) {
            const canvasBackup = await createCanvasProjectsBackup(canvasProjects, `画布-${canvasProjects.length}个项目-${timestamp}`);
            files.push({ name: `canvas/${canvasBackup.fileName}`, data: canvasBackup.blob });
        }
        if (validAssets.length) {
            const assetBackup = await createAssetBackupPackage(validAssets, `素材-${validAssets.length}个-${timestamp}`);
            files.push({ name: `assets/${assetBackup.fileName}`, data: assetBackup.blob });
        }
        return files;
    };

    const createCompleteBackup = async () => {
        const timestamp = backupTimestamp();
        return createFullLocalDataBackup(`全部本地业务数据-${timestamp}`, await createStructuredBackupFiles(timestamp));
    };

    const backupAllToFolder = () =>
        runAction("backupAll", async () => {
            if (!backupFolder) {
                message.warning("请先选择本地备份文件夹");
                return;
            }
            const backup = await createCompleteBackup();
            const saved = await saveBlobToLocalBackupFolder(backup.blob, backup.fileName);
            setBackupFolder({ name: saved.folderName, writable: true });
            message.success(`全部本地业务数据已写入：${saved.folderName}/${saved.fileName}`);
        });

    const downloadAllBackup = () =>
        runAction("downloadAll", async () => {
            const backup = await createCompleteBackup();
            saveAs(backup.blob, backup.fileName);
            message.success("全部本地业务数据备份已开始下载");
        });

    const importAllZip = (file?: File) => {
        if (!file) return;
        modal.confirm({
            title: "恢复全部本地业务数据？",
            content: "将把备份包里的画布、素材、生图/视频工作台记录、工作流以及图片/视频/音频文件写回当前浏览器。恢复后会刷新页面；不会恢复登录状态、API Key、主题和基础配置。",
            okText: "恢复",
            cancelText: "取消",
            onOk: async () =>
                runAction("importAll", async () => {
                    try {
                        const result = await restoreFullLocalDataBackup(file);
                        message.success(`已恢复 ${result.restoredEntries} 条本地数据，其中媒体文件 ${result.restoredBlobs} 个，即将刷新页面`);
                        window.setTimeout(() => window.location.reload(), 900);
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "恢复全部备份失败");
                        throw error;
                    } finally {
                        if (fullInputRef.current) fullInputRef.current.value = "";
                    }
                }),
        });
    };

    const backupCanvasToFolder = () =>
        runAction("backupCanvas", async () => {
            if (!canvasProjects.length) {
                message.warning("暂无画布可备份");
                return;
            }
            if (!backupFolder) {
                message.warning("请先选择本地备份文件夹");
                return;
            }
            const backup = await createCanvasProjectsBackup(canvasProjects, `无限画布-${canvasProjects.length}个项目-${backupTimestamp()}`);
            const saved = await saveBlobToLocalBackupFolder(backup.blob, backup.fileName);
            setBackupFolder({ name: saved.folderName, writable: true });
            message.success(`画布备份已写入：${saved.folderName}/${saved.fileName}`);
        });

    const downloadCanvasBackup = () =>
        runAction("downloadCanvas", async () => {
            if (!canvasProjects.length) {
                message.warning("暂无画布可备份");
                return;
            }
            await exportCanvasProjects(canvasProjects, `无限画布-${canvasProjects.length}个项目-${backupTimestamp()}`);
            message.success("画布备份已开始下载");
        });

    const importCanvasZip = (file?: File) =>
        runAction("importCanvas", async () => {
            if (!file) return;
            try {
                const projects = await readCanvasProjectPackage(file);
                projects.forEach((project) => importProject(project));
                message.success(`已恢复 ${projects.length} 个画布`);
            } catch {
                message.error("恢复失败，请选择有效的画布备份包");
            } finally {
                if (canvasInputRef.current) canvasInputRef.current.value = "";
            }
        });

    const backupAssetsToFolder = () =>
        runAction("backupAssets", async () => {
            if (!validAssets.length) {
                message.warning("暂无素材可备份");
                return;
            }
            if (!backupFolder) {
                message.warning("请先选择本地备份文件夹");
                return;
            }
            const backup = await createAssetBackupPackage(validAssets, `我的素材-${validAssets.length}个-${backupTimestamp()}`);
            const saved = await saveBlobToLocalBackupFolder(backup.blob, backup.fileName);
            setBackupFolder({ name: saved.folderName, writable: true });
            message.success(`素材备份已写入：${saved.folderName}/${saved.fileName}`);
        });

    const downloadAssetBackup = () =>
        runAction("downloadAssets", async () => {
            if (!validAssets.length) {
                message.warning("暂无素材可备份");
                return;
            }
            await exportAssets(validAssets, `我的素材-${validAssets.length}个-${backupTimestamp()}`);
            message.success("素材备份已开始下载");
        });

    const importAssetZip = (file?: File) =>
        runAction("importAssets", async () => {
            if (!file) return;
            try {
                const importedAssets = await readAssetPackage(file);
                importedAssets.forEach((asset) => {
                    const payload = { ...asset } as Record<string, unknown>;
                    delete payload.id;
                    delete payload.createdAt;
                    delete payload.updatedAt;
                    addAsset(payload as Parameters<typeof addAsset>[0]);
                });
                message.success(`已恢复 ${importedAssets.length} 个素材`);
            } catch {
                message.error("恢复失败，请选择有效的素材备份包");
            } finally {
                if (assetInputRef.current) assetInputRef.current.value = "";
            }
        });

    const confirmClearBrowserCache = () => {
        modal.confirm({
            title: "清除本站浏览器缓存",
            content: (
                <div className="space-y-2 text-sm">
                    <div>建议先备份到本地文件夹或下载备份包，否则清除后历史内容可能无法恢复。</div>
                    <div>将清除：画布 IndexedDB、图片 IndexedDB、视频/音频 IndexedDB、CacheStorage。</div>
                    <div>不会清除：登录状态、API Key、主题和基础配置。</div>
                </div>
            ),
            okText: "确认清除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setLoadingAction("clearCache");
                try {
                    await clearDefaultBrowserCache();
                    message.success("本站浏览器缓存已清除，即将刷新页面");
                    window.setTimeout(() => window.location.reload(), 800);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "清除缓存失败");
                    throw error;
                } finally {
                    setLoadingAction(null);
                }
            },
        });
    };

    const folderText = !folderSupported ? "当前浏览器不支持直接写入文件夹" : backupFolder ? `已选择：${backupFolder.name}${backupFolder.writable ? "" : "（点击备份时会再请求权限）"}` : "尚未选择备份文件夹";

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">本地数据设置</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">选择备份文件夹、备份恢复和浏览器缓存管理</div>
                </div>
            }
            open={open}
            width={820}
            centered
            footer={null}
            onCancel={onClose}
        >
            <div className="space-y-4 pt-1">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                    画布、素材、生图/视频工作台记录和图片/视频/音频文件主要保存在当前浏览器的本站数据中。换设备、换浏览器或清缓存前，建议优先使用“一键备份全部内容”。
                </div>


                <section className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                        <FolderOpen className="size-4" />
                        <span>本地备份文件夹</span>
                    </div>
                    <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900/60 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{folderText}</div>
                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                                {folderSupported ? "浏览器只会记住文件夹授权，需要时会再向你确认写入权限。" : "可继续使用“下载备份包”，由浏览器保存到下载目录或你指定的位置。"}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button icon={<FolderOpen className="size-4" />} disabled={!folderSupported} loading={loadingAction === "chooseFolder"} onClick={selectBackupFolder}>
                                {backupFolder ? "更换备份文件夹" : "选择备份文件夹"}
                            </Button>
                            {backupFolder ? (
                                <Button icon={<X className="size-4" />} loading={loadingAction === "forgetFolder"} onClick={clearBackupFolder}>
                                    取消记住
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900/60 dark:bg-sky-950/20">
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-medium text-sky-800 dark:text-sky-100">
                                <Archive className="size-4" />
                                <span>{"生成内容自动保存"}</span>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-sky-700/80 dark:text-sky-100/75">
                                {"选择备份文件夹并保持浏览器授权后，生成成功的图片、视频、音频会自动写入对应子文件夹；画布每 30 分钟自动归档一次，只保留 3 个轮转存档。"}
                            </div>
                        </div>
                        <Switch checked={autoBackupSettings?.enabled ?? false} disabled={!autoBackupSettings || !backupFolder} onChange={updateAutoBackupEnabled} checkedChildren={"开启"} unCheckedChildren={"关闭"} />
                    </div>
                    {!backupFolder ? <div className="mb-3 rounded-lg border border-sky-200 bg-white/70 px-3 py-2 text-xs text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100/75">{"请先选择本地备份文件夹。自动保存不会弹出下载框，浏览器未授权写入时会自动跳过。"}</div> : null}
                    {autoBackupSettings ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            <AutoBackupSettingRow title={"图片"} description={"生图工作台、画布图片节点和画布助手生成结果"} enabled={autoBackupSettings.image.enabled} subfolder={autoBackupSettings.image.subfolder} disabled={!autoBackupSettings.enabled} onEnabledChange={(enabled) => updateAutoBackupItem("image", { enabled })} onSubfolderChange={(subfolder) => updateAutoBackupItem("image", { subfolder })} />
                            <AutoBackupSettingRow title={"视频"} description={"视频工作台和画布视频节点生成结果"} enabled={autoBackupSettings.video.enabled} subfolder={autoBackupSettings.video.subfolder} disabled={!autoBackupSettings.enabled} onEnabledChange={(enabled) => updateAutoBackupItem("video", { enabled })} onSubfolderChange={(subfolder) => updateAutoBackupItem("video", { subfolder })} />
                            <AutoBackupSettingRow title={"音频"} description={"画布音频节点生成结果"} enabled={autoBackupSettings.audio.enabled} subfolder={autoBackupSettings.audio.subfolder} disabled={!autoBackupSettings.enabled} onEnabledChange={(enabled) => updateAutoBackupItem("audio", { enabled })} onSubfolderChange={(subfolder) => updateAutoBackupItem("audio", { subfolder })} />
                            <AutoBackupSettingRow title={"画布"} description={`每 ${autoBackupSettings.canvas.intervalMinutes} 分钟自动归档，轮转保留 ${autoBackupSettings.canvas.keepArchives} 个 zip`} enabled={autoBackupSettings.canvas.enabled} subfolder={autoBackupSettings.canvas.subfolder} disabled={!autoBackupSettings.enabled} onEnabledChange={(enabled) => updateAutoBackupItem("canvas", { enabled })} onSubfolderChange={(subfolder) => updateAutoBackupItem("canvas", { subfolder })} />
                        </div>
                    ) : null}
                </section>

                <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-100">
                                <Archive className="size-4" />
                                <span>一键备份全部内容</span>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-emerald-700/80 dark:text-emerald-100/75">
                                会导出完整本地业务数据快照：画布项目、我的素材、生图工作台记录、视频工作台记录、工作流记录，以及图片、视频和音频文件；不包含登录状态、API Key、主题和基础配置。
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button type="primary" icon={<FolderOpen className="size-4" />} loading={loadingAction === "backupAll"} disabled={!backupFolder} onClick={backupAllToFolder}>
                                备份全部到文件夹
                            </Button>
                            <Button icon={<Download className="size-4" />} loading={loadingAction === "downloadAll"} onClick={downloadAllBackup}>
                                下载全部备份包
                            </Button>
                            <Button icon={<FileUp className="size-4" />} loading={loadingAction === "importAll"} onClick={() => fullInputRef.current?.click()}>
                                恢复全部备份包
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                        <Archive className="size-4" />
                        <span>单项备份与恢复</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <DataActionCard
                            icon={<Database className="size-4" />}
                            title="画布备份"
                            description={`当前 ${canvasProjects.length} 个画布，写入文件夹或下载 zip 后包含画布结构和节点媒体文件。`}
                            primaryText="备份画布到文件夹"
                            secondaryText="下载画布备份包"
                            tertiaryText="恢复画布备份"
                            primaryLoading={loadingAction === "backupCanvas"}
                            secondaryLoading={loadingAction === "downloadCanvas"}
                            tertiaryLoading={loadingAction === "importCanvas"}
                            primaryDisabled={!backupFolder}
                            onPrimary={backupCanvasToFolder}
                            onSecondary={downloadCanvasBackup}
                            onTertiary={() => canvasInputRef.current?.click()}
                        />
                        <DataActionCard
                            icon={<Archive className="size-4" />}
                            title="素材备份"
                            description={`当前 ${validAssets.length} 个素材，写入文件夹或下载 zip 后包含文本、图片和视频文件。`}
                            primaryText="备份素材到文件夹"
                            secondaryText="下载素材备份包"
                            tertiaryText="恢复素材备份"
                            primaryLoading={loadingAction === "backupAssets"}
                            secondaryLoading={loadingAction === "downloadAssets"}
                            tertiaryLoading={loadingAction === "importAssets"}
                            primaryDisabled={!backupFolder}
                            onPrimary={backupAssetsToFolder}
                            onSecondary={downloadAssetBackup}
                            onTertiary={() => assetInputRef.current?.click()}
                        />
                    </div>
                </section>

                <section className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/60 dark:bg-red-950/20">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-200">
                                <Trash2 className="size-4" />
                                <span>清除本站浏览器缓存</span>
                            </div>
                            <div className="mt-1 text-xs text-red-600/80 dark:text-red-100/70">
                                只清除画布、图片、视频/音频 IndexedDB 和 CacheStorage，不会清除登录状态、API Key、主题和基础配置。
                            </div>
                        </div>
                        <Button danger loading={loadingAction === "clearCache"} onClick={confirmClearBrowserCache}>
                            清除缓存
                        </Button>
                    </div>
                </section>
            </div>

            <input ref={fullInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAllZip(event.target.files?.[0])} />
            <input ref={canvasInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvasZip(event.target.files?.[0])} />
            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />
        </Modal>
    );
}

function AutoBackupSettingRow({ title, description, enabled, subfolder, disabled, onEnabledChange, onSubfolderChange }: { title: string; description: string; enabled: boolean; subfolder: string; disabled?: boolean; onEnabledChange: (enabled: boolean) => void; onSubfolderChange: (subfolder: string) => void }) {
    return (
        <div className="rounded-lg border border-sky-200 bg-white/75 p-3 dark:border-sky-900/60 dark:bg-sky-950/40">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</div>
                </div>
                <Switch size="small" checked={enabled} disabled={disabled} onChange={onEnabledChange} />
            </div>
            <Input size="small" className="mt-3" value={subfolder} disabled={disabled || !enabled} addonBefore={"子文件夹"} onChange={(event) => onSubfolderChange(event.target.value)} />
        </div>
    );
}

function DataActionCard({
    icon,
    title,
    description,
    primaryText,
    secondaryText,
    tertiaryText,
    primaryLoading,
    secondaryLoading,
    tertiaryLoading,
    primaryDisabled,
    onPrimary,
    onSecondary,
    onTertiary,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    primaryText: string;
    secondaryText: string;
    tertiaryText: string;
    primaryLoading?: boolean;
    secondaryLoading?: boolean;
    tertiaryLoading?: boolean;
    primaryDisabled?: boolean;
    onPrimary: () => void;
    onSecondary: () => void;
    onTertiary: () => void;
}) {
    return (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900/60">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                {icon}
                <span>{title}</span>
            </div>
            <div className="mt-2 min-h-10 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</div>
            <div className="mt-3 flex flex-wrap gap-2">
                <Button size="small" type="primary" icon={<FolderOpen className="size-3.5" />} loading={primaryLoading} disabled={primaryDisabled} onClick={onPrimary}>
                    {primaryText}
                </Button>
                <Button size="small" icon={<Download className="size-3.5" />} loading={secondaryLoading} onClick={onSecondary}>
                    {secondaryText}
                </Button>
                <Button size="small" icon={<FileUp className="size-3.5" />} loading={tertiaryLoading} onClick={onTertiary}>
                    {tertiaryText}
                </Button>
            </div>
        </div>
    );
}

function backupTimestamp() {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
