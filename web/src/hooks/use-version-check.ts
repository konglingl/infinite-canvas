import { useCallback, useMemo, useState } from "react";
import { App } from "antd";
import { APP_VERSION } from "@/constant/env";
import { type ReleaseInfo } from "@/lib/release";

function readLocalReleases(): ReleaseInfo[] {
    try {
        return JSON.parse(process.env.NEXT_PUBLIC_APP_RELEASES || "[]");
    } catch {
        return [];
    }
}

export function useVersionCheck() {
    const currentVersion = APP_VERSION;
    const { message } = App.useApp();
    const localReleases = useMemo(readLocalReleases, []);
    const [latestVersion] = useState(currentVersion);
    const [releases] = useState<ReleaseInfo[]>(localReleases);
    const [checking, setChecking] = useState(false);
    const [open, setOpen] = useState(false);
    const hasNewVersion = false;

    const checkLatestRelease = useCallback(
        async (showMessage = false) => {
            setChecking(true);
            try {
                if (showMessage) message.info("\u5f53\u524d\u9879\u76ee\u4f7f\u7528\u672c\u5730\u65e5\u671f\u7248\u672c\uff0c\u4e0d\u518d\u8ddf\u968f\u539f\u5f00\u6e90\u4ed3\u5e93\u7248\u672c\u53f7\u3002");
                return true;
            } finally {
                setChecking(false);
            }
        },
        [message],
    );

    const openReleaseModal = useCallback(() => {
        setOpen(true);
    }, []);

    return {
        open,
        setOpen,
        openReleaseModal,
        latestVersion,
        releases,
        checking,
        hasNewVersion,
        checkLatestRelease,
    };
}
