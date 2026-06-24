import localforage from "localforage";

export type WebdavBackupConfig = {
    enabled: boolean;
    url: string;
    username: string;
    password: string;
    directory: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "webdav_backup" });
const WEBDAV_BACKUP_CONFIG_KEY = "infinite-canvas:webdav_backup_config";

export const defaultWebdavBackupConfig: WebdavBackupConfig = { enabled: false, url: "", username: "", password: "", directory: "infinite-canvas-backups" };

export async function getWebdavBackupConfig() {
    const saved = await store.getItem<Partial<WebdavBackupConfig>>(WEBDAV_BACKUP_CONFIG_KEY);
    return normalizeWebdavBackupConfig(saved);
}

export async function saveWebdavBackupConfig(config: WebdavBackupConfig) {
    const normalized = normalizeWebdavBackupConfig(config);
    await store.setItem(WEBDAV_BACKUP_CONFIG_KEY, normalized);
    return normalized;
}

export async function testWebdavBackupConnection(config: WebdavBackupConfig) {
    assertConfig(config);
    await ensureDirectory(config);
}

export async function downloadWebdavBackupFile(config: WebdavBackupConfig, path: string) {
    assertConfig(config);
    const response = await webdavFetch(config, path, { method: "GET" });
    if (!response.ok) throw new Error(await readWebdavError(response, "WebDAV 下载失败"));
    return await response.blob();
}

export async function uploadWebdavBackupFile(config: WebdavBackupConfig, fileName: string, blob: Blob) {
    assertConfig(config);
    await ensureDirectory(config);
    const relativeName = safeRelativeFileName(fileName);
    const path = `${normalizePath(config.directory)}/${relativeName}`;
    const parent = path.split("/").slice(0, -1).join("/");
    if (parent) await ensureWebdavDirectoryPath(config, parent);
    const response = await webdavFetch(config, path, { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    if (!response.ok) throw new Error(await readWebdavError(response, "WebDAV 上传失败"));
    return { path, url: buildWebdavUrl(config, path) };
}

function normalizeWebdavBackupConfig(config?: Partial<WebdavBackupConfig> | null): WebdavBackupConfig {
    return {
        enabled: Boolean(config?.enabled),
        url: String(config?.url || "").trim(),
        username: String(config?.username || ""),
        password: String(config?.password || ""),
        directory: normalizePath(config?.directory || defaultWebdavBackupConfig.directory),
    };
}

function assertConfig(config: WebdavBackupConfig) {
    if (!config.url.trim()) throw new Error("请填写 WebDAV 地址");
    if (!config.username.trim()) throw new Error("请填写 WebDAV 用户名");
    if (!config.password) throw new Error("请填写 WebDAV 密码或应用密码");
}

async function ensureDirectory(config: WebdavBackupConfig) {
    return ensureWebdavDirectoryPath(config, config.directory);
}

async function ensureWebdavDirectoryPath(config: WebdavBackupConfig, directory: string) {
    const parts = normalizePath(directory).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const exists = await webdavFetch(config, current, { method: "PROPFIND", headers: { Depth: "0" } });
        if (exists.ok || exists.status === 207) continue;
        const created = await webdavFetch(config, current, { method: "MKCOL" });
        if (!created.ok && created.status !== 405) throw new Error(await readWebdavError(created, "创建 WebDAV 目录失败"));
    }
}

async function webdavFetch(config: WebdavBackupConfig, path: string, init: RequestInit) {
    const target = buildWebdavUrl(config, path);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Basic ${btoa(`${config.username}:${config.password}`)}`);
    headers.set("x-webdav-target", target);
    headers.set("x-webdav-method", init.method || "GET");
    headers.set("x-webdav-authorization", headers.get("Authorization") || "");
    headers.delete("Authorization");
    return fetch("/webdav-proxy", { method: "POST", headers, body: init.body });
}

function buildWebdavUrl(config: WebdavBackupConfig, path: string) {
    const base = config.url.replace(/\/+$/, "");
    const suffix = normalizePath(path);
    return suffix ? `${base}/${suffix}` : base;
}

function normalizePath(path: string) {
    return path.replace(/\\/g, "/").split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function safeRelativeFileName(name: string) {
    const parts = name.replace(/\\/g, "/").split("/").map((part) => safeName(part)).filter(Boolean);
    return parts.join("/") || `backup-${Date.now()}.zip`;
}

function safeName(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || `backup-${Date.now()}.zip`;
}

async function readWebdavError(response: Response, fallback: string) {
    const text = await response.text().catch(() => "");
    return text ? `${fallback}（${response.status}）：${text.slice(0, 160)}` : `${fallback}（${response.status}）`;
}
