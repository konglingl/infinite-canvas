"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Copy, FileText, FolderPlus, Grid2x2, ImageIcon, Plus, Sparkles, Trash2, Video } from "lucide-react";

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
    onCopyWorkflowPrompts: () => void;
    onCopyWorkflowStagePrompts: () => void;
    onExportWorkflowMarkdown: () => void;
    onCreateImageConfig: () => void;
    onCreateVideoConfig: () => void;
    onSelectWorkflow: () => void;
    onRelayoutWorkflow: () => void;
    onSelectWorkflowStage: () => void;
    onRelayoutWorkflowStage: () => void;
    onToggleWorkflowStageCollapse: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onRelayout: () => void;
    onAutoLayout: () => void;
};

export function CanvasNodeContextMenu({ menu, node, onClose, onSaveAsset, onCopyImage, onCopyPrompt, onCopyWorkflowPrompts, onCopyWorkflowStagePrompts, onExportWorkflowMarkdown, onCreateImageConfig, onCreateVideoConfig, onSelectWorkflow, onRelayoutWorkflow, onSelectWorkflowStage, onRelayoutWorkflowStage, onToggleWorkflowStageCollapse, onDuplicate, onDelete, onRelayout, onAutoLayout }: CanvasNodeContextMenuProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isNodeMenu = menu.type === "node" && Boolean(node);
    const canSaveAsset = Boolean(node && ((node.type === CanvasNodeType.Text && node.metadata?.content?.trim()) || ((node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && node.metadata?.content)));
    const canCopyImage = Boolean(node?.type === CanvasNodeType.Image && node.metadata?.content);
    const canCopyPrompt = Boolean(node && getNodePromptText(node));
    const canCreateConfigFromText = Boolean(node?.type === CanvasNodeType.Text && node.metadata?.content?.trim());
    const canSelectWorkflow = Boolean(node?.metadata?.workflowTitle);
    const canSelectWorkflowStage = Boolean(node?.metadata?.workflowStage && node.metadata?.workflowTitle);
    const workflowStageCollapseLabel = node?.metadata?.workflowStageCollapsed ? "展开同阶段节点" : "折叠同阶段节点";

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
            className="fixed z-[80] min-w-48 overflow-visible rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {isNodeMenu ? (
                <>
                    <MenuButton icon={<FolderPlus className="size-4" />} label="保存到素材" onClick={onSaveAsset} disabled={!canSaveAsset} />
                    <MenuGroup icon={<FileText className="size-4" />} label="复制 / 导出">
                        <MenuButton icon={<Copy className="size-4" />} label="复制图片" onClick={onCopyImage} disabled={!canCopyImage} />
                        <MenuButton icon={<FileText className="size-4" />} label="复制提示词" onClick={onCopyPrompt} disabled={!canCopyPrompt} />
                        <MenuButton icon={<FileText className="size-4" />} label="复制同工作流提示词" onClick={onCopyWorkflowPrompts} disabled={!canSelectWorkflow} />
                        <MenuButton icon={<FileText className="size-4" />} label="复制同阶段提示词" onClick={onCopyWorkflowStagePrompts} disabled={!canSelectWorkflowStage} />
                        <MenuButton icon={<FileText className="size-4" />} label="导出工作流 Markdown" onClick={onExportWorkflowMarkdown} disabled={!canSelectWorkflow} />
                    </MenuGroup>
                    <MenuGroup icon={<ImageIcon className="size-4" />} label="转配置">
                        <MenuButton icon={<ImageIcon className="size-4" />} label="转生图配置" onClick={onCreateImageConfig} disabled={!canCreateConfigFromText} />
                        <MenuButton icon={<Video className="size-4" />} label="转视频配置" onClick={onCreateVideoConfig} disabled={!canCreateConfigFromText} />
                    </MenuGroup>
                    <MenuGroup icon={<Grid2x2 className="size-4" />} label="工作流">
                        <MenuButton icon={<Grid2x2 className="size-4" />} label="选择同工作流节点" onClick={onSelectWorkflow} disabled={!canSelectWorkflow} />
                        <MenuButton icon={<Grid2x2 className="size-4" />} label="整理同工作流节点" onClick={onRelayoutWorkflow} disabled={!canSelectWorkflow} />
                        <MenuButton icon={<Grid2x2 className="size-4" />} label="选择同阶段节点" onClick={onSelectWorkflowStage} disabled={!canSelectWorkflowStage} />
                        <MenuButton icon={<Grid2x2 className="size-4" />} label="整理同阶段节点" onClick={onRelayoutWorkflowStage} disabled={!canSelectWorkflowStage} />
                        <MenuButton icon={<Grid2x2 className="size-4" />} label={workflowStageCollapseLabel} onClick={onToggleWorkflowStageCollapse} disabled={!canSelectWorkflowStage} />
                    </MenuGroup>
                    <MenuGroup icon={<Sparkles className="size-4" />} label="整理">
                        <MenuButton icon={<Grid2x2 className="size-4" />} label="重新布局 / 整理画布" onClick={onRelayout} />
                        <MenuButton icon={<Sparkles className="size-4" />} label="一键整理画布" onClick={onAutoLayout} />
                    </MenuGroup>
                    <MenuButton icon={<Plus className="size-4" />} label="创建副本" onClick={onDuplicate} />
                    <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
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

function MenuGroup({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="group/menu relative">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: theme.node.text }}>
                {icon}
                <span className="flex-1 whitespace-nowrap">{label}</span>
                <ChevronRight className="size-3 opacity-60" />
            </button>
            <div className="invisible absolute left-full top-0 min-w-56 rounded-xl border py-1 opacity-0 shadow-2xl transition-opacity group-hover/menu:visible group-hover/menu:opacity-100 group-focus-within/menu:visible group-focus-within/menu:opacity-100" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                {children}
            </div>
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false, disabled = false }: { icon: ReactNode; label: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
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
            <span className="whitespace-nowrap">{label}</span>
        </button>
    );
}
