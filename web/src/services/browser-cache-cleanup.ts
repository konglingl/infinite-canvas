"use client";

import localforage from "localforage";

const DB_NAME = "infinite-canvas";
const APP_STATE_STORE = "app_state";
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
const IMAGE_STORE = "image_files";
const MEDIA_STORE = "media_files";

export type BrowserCacheCleanupResult = {
    clearedIndexedDbStores: string[];
    deletedCacheStorageCount: number;
};

export async function clearDefaultBrowserCache(): Promise<BrowserCacheCleanupResult> {
    if (typeof window === "undefined") return { clearedIndexedDbStores: [], deletedCacheStorageCount: 0 };

    const appStateStore = localforage.createInstance({ name: DB_NAME, storeName: APP_STATE_STORE });
    const imageStore = localforage.createInstance({ name: DB_NAME, storeName: IMAGE_STORE });
    const mediaStore = localforage.createInstance({ name: DB_NAME, storeName: MEDIA_STORE });

    await appStateStore.removeItem(CANVAS_STORE_KEY);
    await Promise.all([imageStore.clear(), mediaStore.clear()]);

    let deletedCacheStorageCount = 0;
    if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        const deleted = await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
        deletedCacheStorageCount = deleted.filter(Boolean).length;
    }

    return { clearedIndexedDbStores: [APP_STATE_STORE, IMAGE_STORE, MEDIA_STORE], deletedCacheStorageCount };
}
