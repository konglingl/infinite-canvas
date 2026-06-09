"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { createCanvasProjectsBackup } from "@/app/(user)/canvas/utils/canvas-export";
import { useCanvasStore, type CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import { autoSaveCanvasArchiveToLocalBackupFolder, CANVAS_AUTO_ARCHIVE_INTERVAL_MS } from "@/services/local-backup-folder";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const canvasProjectsRef = useRef<CanvasProject[]>([]);
    const pathname = usePathname();
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canUseCustomChannel = useUserStore((state) => state.user?.canUseCustomChannel === true);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const isLoginPage = pathname === "/login" || pathname === "/admin/login";

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (!isLoginPage) void hydrateUser();
    }, [hydrateUser, isLoginPage]);


    useEffect(() => {
        canvasProjectsRef.current = canvasProjects;
    }, [canvasProjects]);

    useEffect(() => {
        if (!canvasHydrated || isLoginPage) return;
        const archive = async () => {
            const projects = canvasProjectsRef.current;
            if (!projects.length) return;
            try {
                const backup = await createCanvasProjectsBackup(projects, "canvas-auto");
                await autoSaveCanvasArchiveToLocalBackupFolder(backup.blob);
            } catch {
                // 自动归档失败时保持静默，避免打断用户当前操作。
            }
        };
        const timer = window.setInterval(() => void archive(), CANVAS_AUTO_ARCHIVE_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [canvasHydrated, isLoginPage]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        if (!publicSettings) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        if (!publicSettings.modelChannel.allowCustomChannel || !canUseCustomChannel) {
            openConfigDialog(false);
            message.error("后台未允许用户自定义渠道，请联系管理员进行配置");
            return;
        }
        updateConfig("channelMode", "local");
        updateConfig("baseUrl", "https://kongsubapi.959298.xyz");
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
    }, [message, openConfigDialog, publicSettings, updateConfig]);

    return <>{children}</>;
}
