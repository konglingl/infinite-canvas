"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Copy, FileText, FolderPlus, Grid2x2, ImageIcon, Plus, Sparkles, Trash2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type ContextMenuState } from "../types";

type CanvasNodeContextMenuProps = {
    menu: ContextMenuState;
    node?: CanvasNodeData | null;
    onClose: () => void;
    onSaveAsset: () => void;
    onCopyImage: () => void;
    onCopyPrompt: () => void;
    onCreateImageConfig: () => void;
    onCreateVideoConfig: () => void;
    onSelectWorkflowStage: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onRelayout: () => void;
    onAutoLayout: () => void;
};

export function CanvasNodeContextMenu({ menu, node, onClose, onSaveAsset, onCopyImage, onCopyPrompt, onCreateImageConfig, onCreateVideoConfig, onSelectWorkflowStage, onDuplicate, onDelete, onRelayout, onAutoLayout }: CanvasNodeContextMenuProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isNodeMenu = menu.type === "node" && Boolean(node);
    const canSaveAsset = Boolean(node && ((node.type === CanvasNodeType.Text && node.metadata?.content?.trim()) || ((node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && node.metadata?.content)));
    const canCopyImage = Boolean(node?.type === CanvasNodeType.Image && node.metadata?.content);
    const canCopyPrompt = Boolean(node && getNodePromptText(node));
    const canCreateConfigFromText = Boolean(node?.type === CanvasNodeType.Text && node.metadata?.content?.trim());
    const canSelectWorkflowStage = Boolean(node?.metadata?.workflowStage && node.metadata?.workflowTitle);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-48 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {isNodeMenu ? (
                <>
                    <MenuButton icon={<FolderPlus className="size-4" />} label="保存到素材" onClick={onSaveAsset} disabled={!canSaveAsset} />
                    <MenuButton icon={<Copy className="size-4" />} label="复制图片" onClick={onCopyImage} disabled={!canCopyImage} />
                    <MenuButton icon={<FileText className="size-4" />} label="复制提示词" onClick={onCopyPrompt} disabled={!canCopyPrompt} />
                    <MenuButton icon={<ImageIcon className="size-4" />} label="转生图配置" onClick={onCreateImageConfig} disabled={!canCreateConfigFromText} />
                    <MenuButton icon={<Video className="size-4" />} label="转视频配置" onClick={onCreateVideoConfig} disabled={!canCreateConfigFromText} />
                    <MenuButton icon={<Grid2x2 className="size-4" />} label="选择同阶段节点" onClick={onSelectWorkflowStage} disabled={!canSelectWorkflowStage} />
                    <MenuButton icon={<Plus className="size-4" />} label="创建副本" onClick={onDuplicate} />
                    <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
                    <MenuButton icon={<Grid2x2 className="size-4" />} label="重新布局 / 整理画布" onClick={onRelayout} />
                    <MenuButton icon={<Sparkles className="size-4" />} label="一键整理画布" onClick={onAutoLayout} />
                </>
            ) : (
                <MenuButton icon={<Trash2 className="size-4" />} label="删除连接" onClick={onDelete} danger />
            )}
        </div>
    );
}

function getNodePromptText(node: CanvasNodeData) {
    return node.metadata?.prompt?.trim() || (node.type === CanvasNodeType.Text ? node.metadata?.content?.trim() : "");
}

function MenuButton({ icon, label, onClick, danger = false, disabled = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
            style={{ color: danger ? "#f87171" : theme.node.text }}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
