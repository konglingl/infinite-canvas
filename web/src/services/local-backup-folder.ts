"use client";

import localforage from "localforage";

type BackupPermissionMode = "read" | "readwrite";
type BackupPermissionState = "granted" | "denied" | "prompt";
type BackupDirectoryHandle = {
    name: string;
    kind: "directory";
    queryPermission?: (descriptor?: { mode?: BackupPermissionMode }) => Promise<BackupPermissionState>;
    requestPermission?: (descriptor?: { mode?: BackupPermissionMode }) => Promise<BackupPermissionState>;
    getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

type BackupWindow = Window & {
    showDirectoryPicker?: (options?: { id?: string; mode?: BackupPermissionMode }) => Promise<BackupDirectoryHandle>;
};

export type LocalBackupFolderInfo = {
    name: string;
    writable: boolean;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "local_backup" });
const BACKUP_DIRECTORY_HANDLE_KEY = "infinite-canvas:local_backup_directory";

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

export async function saveBlobToLocalBackupFolder(blob: Blob, fileName: string) {
    const handle = await loadBackupDirectoryHandle();
    if (!handle) throw new Error("请先选择本地备份文件夹");
    await requestWritablePermission(handle);
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { folderName: handle.name, fileName };
}

async function loadBackupDirectoryHandle() {
    if (!isLocalBackupFolderSupported()) return null;
    return (await store.getItem<BackupDirectoryHandle>(BACKUP_DIRECTORY_HANDLE_KEY)) || null;
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
