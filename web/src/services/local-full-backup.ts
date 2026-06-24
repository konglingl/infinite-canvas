"use client";

import localforage from "localforage";

import { createZip, readZip } from "@/lib/zip";

type SnapshotStoreConfig = {
    storeName: string;
    label: string;
    keys?: string[];
};

type SnapshotEntry = {
    key: string;
    type: "blob" | "json" | "string" | "null";
    path?: string;
    mimeType?: string;
    bytes?: number;
    value?: unknown;
};

export type FullLocalBackupExtraFile = {
    name: string;
    data: BlobPart;
};

const DB_NAME = "infinite-canvas";
const SNAPSHOT_STORES: SnapshotStoreConfig[] = [
    { storeName: "app_state", label: "canvas_asset_state", keys: ["infinite-canvas:canvas_store", "infinite-canvas:asset_store"] },
    { storeName: "image_generation_logs", label: "image_workspace_logs" },
    { storeName: "video_generation_logs", label: "video_workspace_logs" },
    { storeName: "image_generation_categories", label: "image_workspace_categories" },
    { storeName: "creative_workflows", label: "creative_workflows" },
    { storeName: "video_studio_projects", label: "video_studio_projects" },
    { storeName: "image_files", label: "image_blobs" },
    { storeName: "media_files", label: "video_audio_media_blobs" },
];


export async function restoreFullLocalDataBackup(file: File) {
    const zip = await readZip(file);
    const manifestFile = zip.get("manifest.json");
    if (!manifestFile) throw new Error("missing manifest.json");
    const manifest = JSON.parse(await manifestFile.text()) as { type?: string; stores?: { storeName: string }[] };
    if (manifest.type !== "full-local-business-data-backup") throw new Error("不是完整本地业务数据备份包");
    let restoredEntries = 0;
    let restoredBlobs = 0;

    for (const item of manifest.stores || []) {
        const storeName = item.storeName;
        if (!SNAPSHOT_STORES.some((store) => store.storeName === storeName)) continue;
        const entriesFile = zip.get(`snapshot/${storeName}/entries.json`);
        if (!entriesFile) continue;
        const data = JSON.parse(await entriesFile.text()) as { entries?: SnapshotEntry[] };
        const store = localforage.createInstance({ name: DB_NAME, storeName });
        for (const entry of data.entries || []) {
            if (entry.type === "blob") {
                if (!entry.path) continue;
                const blob = zip.get(entry.path);
                if (!blob) continue;
                const typedBlob = blob.type ? blob : blob.slice(0, blob.size, entry.mimeType || "application/octet-stream");
                await store.setItem(entry.key, typedBlob);
                restoredBlobs++;
            } else {
                await store.setItem(entry.key, entry.value ?? null);
            }
            restoredEntries++;
        }
    }

    return { restoredEntries, restoredBlobs };
}

export async function createFullLocalDataBackup(fileBaseName: string, extraFiles: FullLocalBackupExtraFile[] = []) {
    const files: { name: string; data: BlobPart }[] = [];
    const stores = [];
    let totalEntries = 0;
    let totalBlobBytes = 0;

    for (const config of SNAPSHOT_STORES) {
        const snapshot = await snapshotStore(config);
        stores.push({ storeName: config.storeName, label: config.label, entries: snapshot.entries.length, blobBytes: snapshot.blobBytes });
        totalEntries += snapshot.entries.length;
        totalBlobBytes += snapshot.blobBytes;
        files.push({ name: `snapshot/${config.storeName}/entries.json`, data: JSON.stringify({ storeName: config.storeName, label: config.label, entries: snapshot.entries }, null, 2) });
        files.push(...snapshot.files);
    }

    files.unshift({
        name: "manifest.json",
        data: JSON.stringify(
            {
                app: "infinite-canvas",
                type: "full-local-business-data-backup",
                version: 1,
                exportedAt: new Date().toISOString(),
                stores,
                totalEntries,
                totalBlobBytes,
                extraFiles: extraFiles.map((file) => file.name),
                excluded: ["auth token", "api key config", "theme", "local backup folder permission handle", "browser CacheStorage"],
                note: "Includes canvas/assets state, image workspace logs, video workspace logs, creative workflows, video studio projects, image blobs, video blobs and audio blobs. Excludes login state, API keys, theme and basic settings.",
            },
            null,
            2,
        ),
    });
    files.push(...extraFiles.map((file) => ({ name: `structured/${file.name}`, data: file.data })));

    const blob = await createZip(files);
    return { blob, fileName: `${safeFileName(fileBaseName)}.zip`, totalEntries, totalBlobBytes };
}

async function snapshotStore(config: SnapshotStoreConfig) {
    const store = localforage.createInstance({ name: DB_NAME, storeName: config.storeName });
    const keys = config.keys || (await store.keys());
    const entries: SnapshotEntry[] = [];
    const files: { name: string; data: BlobPart }[] = [];
    let blobBytes = 0;

    for (const [index, key] of keys.entries()) {
        const value = await store.getItem(key).catch(() => undefined);
        if (value === undefined) continue;
        if (isBlob(value)) {
            const path = `snapshot/${config.storeName}/files/${String(index + 1).padStart(4, "0")}-${safeFileName(key)}.${fileExtension(value.type, key)}`;
            entries.push({ key, type: "blob", path, mimeType: value.type || "application/octet-stream", bytes: value.size });
            files.push({ name: path, data: value });
            blobBytes += value.size;
            continue;
        }
        entries.push(serializedEntry(key, value));
    }

    return { entries, files, blobBytes };
}

function serializedEntry(key: string, value: unknown): SnapshotEntry {
    if (value === null) return { key, type: "null", value: null };
    if (typeof value === "string") return { key, type: "string", value };
    return { key, type: "json", value: toJSONValue(value) };
}

function toJSONValue(value: unknown) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function isBlob(value: unknown): value is Blob {
    return typeof Blob !== "undefined" && value instanceof Blob;
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_").replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, "_").slice(0, 140) || "backup";
}

function fileExtension(mimeType: string, key: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    if (key.startsWith("image:")) return "png";
    if (key.startsWith("video:")) return "mp4";
    if (key.startsWith("audio:")) return "mp3";
    return "bin";
}
