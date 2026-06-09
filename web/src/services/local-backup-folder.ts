"use client";

import localforage from "localforage";

type BackupPermissionMode = "read" | "readwrite";
type BackupPermissionState = "granted" | "denied" | "prompt";
type BackupFileHandle = { createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> };
type BackupDirectoryHandle = {
    name: string;
    kind: "directory";
    queryPermission?: (descriptor?: { mode?: BackupPermissionMode }) => Promise<BackupPermissionState>;
    requestPermission?: (descriptor?: { mode?: BackupPermissionMode }) => Promise<BackupPermissionState>;
    getFileHandle: (name: string, options?: { create?: boolean }) => Promise<BackupFileHandle>;
    getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<BackupDirectoryHandle>;
};

type BackupWindow = Window & {
    showDirectoryPicker?: (options?: { id?: string; mode?: BackupPermissionMode }) => Promise<BackupDirectoryHandle>;
};

export type LocalBackupFolderInfo = {
    name: string;
    writable: boolean;
};

export type AutoBackupMediaKind = "image" | "video" | "audio";
export type LocalAutoBackupItemSettings = {
    enabled: boolean;
    subfolder: string;
};
export type LocalAutoBackupSettings = {
    enabled: boolean;
    image: LocalAutoBackupItemSettings;
    video: LocalAutoBackupItemSettings;
    audio: LocalAutoBackupItemSettings;
    canvas: LocalAutoBackupItemSettings & { intervalMinutes: number; keepArchives: number };
};

export type GeneratedImageAutoBackupInput = {
    dataUrl: string;
    prompt?: string;
    model?: string;
    source?: string;
    createdAt?: Date;
};

export type GeneratedMediaAutoBackupInput = {
    kind: AutoBackupMediaKind;
    blob: Blob;
    prompt?: string;
    model?: string;
    source?: string;
    createdAt?: Date;
    extension?: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "local_backup" });
const BACKUP_DIRECTORY_HANDLE_KEY = "infinite-canvas:local_backup_directory";
const LOCAL_AUTO_BACKUP_SETTINGS_KEY = "infinite-canvas:local_auto_backup_settings";
const CANVAS_AUTO_ARCHIVE_SLOT_KEY = "infinite-canvas:canvas_auto_archive_slot";
const DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS: LocalAutoBackupSettings = {
    enabled: true,
    image: { enabled: true, subfolder: "generated-images" },
    video: { enabled: true, subfolder: "generated-videos" },
    audio: { enabled: true, subfolder: "generated-audio" },
    canvas: { enabled: true, subfolder: "canvas-auto-archives", intervalMinutes: 30, keepArchives: 3 },
};

export const CANVAS_AUTO_ARCHIVE_INTERVAL_MS = DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.canvas.intervalMinutes * 60 * 1000;

export function isLocalBackupFolderSupported() {
    return typeof window !== "undefined" && typeof (window as BackupWindow).showDirectoryPicker === "function";
}

export async function chooseLocalBackupFolder(): Promise<LocalBackupFolderInfo> {
    const picker = (window as BackupWindow).showDirectoryPicker;
    if (!picker) throw new Error("当前浏览器不支持选择本地文件夹，请使用下载备份。");
    const handle = await picker({ id: "infinite-canvas-backup", mode: "readwrite" });
    await requestWritablePermission(handle);
    await store.setItem(BACKUP_DIRECTORY_HANDLE_KEY, handle);
    return { name: handle.name, writable: true };
}

export async function getLocalBackupFolderInfo(): Promise<LocalBackupFolderInfo | null> {
    const handle = await loadBackupDirectoryHandle();
    if (!handle) return null;
    const writable = (await queryWritablePermission(handle)) === "granted";
    return { name: handle.name, writable };
}

export async function forgetLocalBackupFolder() {
    await store.removeItem(BACKUP_DIRECTORY_HANDLE_KEY);
}

export async function getLocalAutoBackupSettings(): Promise<LocalAutoBackupSettings> {
    const saved = await store.getItem<Partial<LocalAutoBackupSettings>>(LOCAL_AUTO_BACKUP_SETTINGS_KEY);
    return normalizeLocalAutoBackupSettings(saved);
}

export async function saveLocalAutoBackupSettings(settings: Partial<LocalAutoBackupSettings>) {
    const normalized = normalizeLocalAutoBackupSettings(settings);
    await store.setItem(LOCAL_AUTO_BACKUP_SETTINGS_KEY, normalized);
    return normalized;
}

export async function saveBlobToLocalBackupFolder(blob: Blob, fileName: string) {
    const handle = await loadBackupDirectoryHandle();
    if (!handle) throw new Error("请先选择本地备份文件夹");
    await requestWritablePermission(handle);
    const safeName = safeBackupFileName(fileName);
    const fileHandle = await handle.getFileHandle(safeName, { create: true });
    await writeBackupFile(fileHandle, blob);
    return { folderName: handle.name, fileName: safeName };
}

export async function autoSaveGeneratedImageToLocalBackupFolder(input: GeneratedImageAutoBackupInput) {
    return autoSaveGeneratedMediaToLocalBackupFolder({ ...input, kind: "image", blob: await dataUrlToBlob(input.dataUrl), extension: imageExtension(input.dataUrl) });
}

export async function autoSaveGeneratedMediaToLocalBackupFolder(input: GeneratedMediaAutoBackupInput) {
    const settings = await getLocalAutoBackupSettings();
    const item = settings[input.kind];
    if (!settings.enabled || !item.enabled) return null;
    const root = await loadWritableBackupDirectoryForAutoSave();
    if (!root) return null;

    const folder = await resolveBackupSubfolder(root, item.subfolder);
    const fileName = generatedMediaBackupFileName(input);
    const fileHandle = await folder.getFileHandle(fileName, { create: true });
    await writeBackupFile(fileHandle, input.blob);
    return { folderName: folder.name, fileName };
}

export async function autoSaveCanvasArchiveToLocalBackupFolder(blob: Blob) {
    const settings = await getLocalAutoBackupSettings();
    if (!settings.enabled || !settings.canvas.enabled) return null;
    const root = await loadWritableBackupDirectoryForAutoSave();
    if (!root) return null;

    const folder = await resolveBackupSubfolder(root, settings.canvas.subfolder);
    const keepArchives = Math.max(1, Math.min(9, Math.floor(settings.canvas.keepArchives || DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.canvas.keepArchives)));
    const slot = await nextCanvasArchiveSlot(keepArchives);
    const fileName = `canvas-auto-${slot}.zip`;
    const fileHandle = await folder.getFileHandle(fileName, { create: true });
    await writeBackupFile(fileHandle, blob);
    return { folderName: folder.name, fileName };
}

async function loadBackupDirectoryHandle() {
    if (!isLocalBackupFolderSupported()) return null;
    return (await store.getItem<BackupDirectoryHandle>(BACKUP_DIRECTORY_HANDLE_KEY)) || null;
}

async function loadWritableBackupDirectoryForAutoSave() {
    const handle = await loadBackupDirectoryHandle();
    if (!handle) return null;
    return (await queryWritablePermission(handle)) === "granted" ? handle : null;
}

async function queryWritablePermission(handle: BackupDirectoryHandle) {
    return (await handle.queryPermission?.({ mode: "readwrite" })) || "prompt";
}

async function requestWritablePermission(handle: BackupDirectoryHandle) {
    const current = await queryWritablePermission(handle);
    if (current === "granted") return;
    const next = (await handle.requestPermission?.({ mode: "readwrite" })) || "denied";
    if (next !== "granted") throw new Error("未获得备份文件夹写入权限");
}

async function writeBackupFile(fileHandle: BackupFileHandle, blob: Blob) {
    const writable = await fileHandle.createWritable();
    try {
        await writable.write(blob);
    } finally {
        await writable.close();
    }
}

async function resolveBackupSubfolder(root: BackupDirectoryHandle, subfolder: string) {
    const cleaned = safePathPart(subfolder);
    if (!cleaned || !root.getDirectoryHandle) return root;
    return root.getDirectoryHandle(cleaned, { create: true });
}

async function nextCanvasArchiveSlot(keepArchives: number) {
    const current = Number((await store.getItem<number>(CANVAS_AUTO_ARCHIVE_SLOT_KEY)) || 1);
    const slot = current >= 1 && current <= keepArchives ? Math.floor(current) : 1;
    await store.setItem(CANVAS_AUTO_ARCHIVE_SLOT_KEY, slot >= keepArchives ? 1 : slot + 1);
    return slot;
}

function normalizeLocalAutoBackupSettings(settings?: Partial<LocalAutoBackupSettings> | null): LocalAutoBackupSettings {
    return {
        enabled: settings?.enabled !== false,
        image: normalizeAutoBackupItem(settings?.image, DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.image),
        video: normalizeAutoBackupItem(settings?.video, DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.video),
        audio: normalizeAutoBackupItem(settings?.audio, DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.audio),
        canvas: {
            ...normalizeAutoBackupItem(settings?.canvas, DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.canvas),
            intervalMinutes: DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.canvas.intervalMinutes,
            keepArchives: DEFAULT_LOCAL_AUTO_BACKUP_SETTINGS.canvas.keepArchives,
        },
    };
}

function normalizeAutoBackupItem<T extends LocalAutoBackupItemSettings>(settings: Partial<T> | undefined, fallback: T): T {
    return {
        ...fallback,
        enabled: settings?.enabled !== false,
        subfolder: safePathPart(settings?.subfolder || fallback.subfolder) || fallback.subfolder,
    };
}

function generatedMediaBackupFileName(input: GeneratedMediaAutoBackupInput) {
    const stamp = dateStamp(input.createdAt || new Date());
    const model = safePathPart(input.model || input.kind);
    const source = safePathPart(input.source || "generated");
    const prompt = safePathPart(input.prompt || input.kind).slice(0, 48) || input.kind;
    const ext = safePathPart(input.extension || blobExtension(input.blob, input.kind));
    return safeBackupFileName(`${stamp}-${source}-${model}-${prompt}.${ext}`);
}

function dateStamp(value: Date) {
    const pad = (item: number) => String(item).padStart(2, "0");
    return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
}

function imageExtension(dataUrl: string) {
    const mime = dataUrl.match(/^data:image\/([^;]+)/)?.[1] || "png";
    return mime === "jpeg" ? "jpg" : safePathPart(mime) || "png";
}

function blobExtension(blob: Blob, kind: AutoBackupMediaKind) {
    const mimeType = blob.type.toLowerCase();
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3";
}

async function dataUrlToBlob(dataUrl: string) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("读取图片数据失败");
    return response.blob();
}

function safeBackupFileName(value: string) {
    const cleaned = value.replace(/[\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim();
    return cleaned.slice(0, 180) || `backup-${Date.now()}`;
}

function safePathPart(value: string) {
    return value.replace(/[\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim();
}
