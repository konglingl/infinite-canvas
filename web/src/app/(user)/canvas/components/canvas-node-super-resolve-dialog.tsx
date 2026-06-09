"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Segmented, Typography } from "antd";
import { ImagePlus, Sparkles } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";

export type CanvasImageSuperResolveParams = {
    prompt: string;
    size: string;
    targetLabel: string;
};

type ImageMeta = Awaited<ReturnType<typeof readImageMeta>>;

const AI_IMAGE_MAX_PIXELS = 8294400;
const AI_IMAGE_MAX_EDGE = 3840;
const AI_IMAGE_STEP = 16;
const targetOptions = [
    { label: "1K", value: 1024 },
    { label: "2K", value: 2048 },
    { label: "4K", value: 3840 },
];

const text = {
    title: "AI \u8d85\u5206",
    subtitle: "\u4f7f\u7528\u5f53\u524d\u56fe\u7247\u6a21\u578b\u5bf9\u539f\u56fe\u8fdb\u884c\u6e05\u6670\u5ea6\u3001\u7ec6\u8282\u548c\u5206\u8fa8\u7387\u589e\u5f3a\uff0c\u751f\u6210\u7ed3\u679c\u4f1a\u653e\u5728\u539f\u56fe\u53f3\u4fa7\u3002",
    source: "\u6e90\u56fe",
    reading: "\u8bfb\u53d6\u4e2d",
    target: "\u76ee\u6807\u5c3a\u5bf8",
    prompt: "\u8d85\u5206\u8981\u6c42",
    output: "\u8f93\u51fa\u5c3a\u5bf8",
    autoSize: "\u7531\u6a21\u578b\u81ea\u52a8\u51b3\u5b9a",
    generate: "\u751f\u6210 AI \u8d85\u5206\u56fe",
};

const defaultPrompt = "\u5728\u4fdd\u6301\u539f\u56fe\u6784\u56fe\u3001\u4e3b\u4f53\u3001\u98ce\u683c\u3001\u989c\u8272\u548c\u6587\u5b57\u5185\u5bb9\u4e0d\u53d8\u7684\u524d\u63d0\u4e0b\uff0c\u63d0\u5347\u56fe\u7247\u6e05\u6670\u5ea6\u3001\u7ec6\u8282\u3001\u8fb9\u7f18\u8d28\u91cf\u548c\u6574\u4f53\u5206\u8fa8\u7387\uff0c\u53bb\u9664\u538b\u7f29\u566a\u70b9\u3001\u6a21\u7cca\u548c\u9500\u9f7f\uff0c\u4e0d\u65b0\u589e\u65e0\u5173\u5143\u7d20\u3002";

export function CanvasNodeSuperResolveDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageSuperResolveParams) => void }) {
    const [image, setImage] = useState<ImageMeta | null>(null);
    const [targetLongEdge, setTargetLongEdge] = useState(2048);
    const [prompt, setPrompt] = useState(defaultPrompt);

    const sourceLongEdge = image ? Math.max(image.width, image.height) : 0;
    const output = useMemo(() => (image ? resolveAISuperResolveSize(image.width, image.height, targetLongEdge) : null), [image, targetLongEdge]);

    useEffect(() => {
        if (!open) return;
        setImage(null);
        setPrompt(defaultPrompt);
        void readImageMeta(dataUrl).then((meta) => {
            setImage(meta);
            const nextTarget = targetOptions.find((option) => Math.max(meta.width, meta.height) < option.value)?.value || AI_IMAGE_MAX_EDGE;
            setTargetLongEdge(nextTarget);
        });
    }, [dataUrl, open]);

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <div className="flex items-center gap-2 text-xl font-semibold">
                        <Sparkles className="size-5 text-[#8b5cf6]" />
                        {text.title}
                    </div>
                    <Typography.Paragraph type="secondary" className="!mb-0 !mt-2">
                        {text.subtitle}
                    </Typography.Paragraph>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5">
                            <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">{text.source}</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : text.reading}</span>
                        </div>
                    </div>
                    <div className="space-y-5 py-2">
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">{text.target}</div>
                            <Segmented block value={targetLongEdge} options={targetOptions.map((option) => ({ label: `${option.label} - ${option.value}px`, value: option.value }))} onChange={(value) => setTargetLongEdge(Number(value))} />
                        </div>
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">{text.prompt}</div>
                            <Input.TextArea value={prompt} rows={5} onChange={(event) => setPrompt(event.target.value)} />
                        </div>
                        <div className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">{text.output}</span>
                                <span className="font-semibold">{output?.size && output.size !== "auto" ? `${output.width} x ${output.height} px` : text.autoSize}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<ImagePlus className="size-4" />} disabled={!image} onClick={() => output && onConfirm({ prompt: prompt.trim() || defaultPrompt, size: output.size, targetLabel: targetOptions.find((option) => option.value === targetLongEdge)?.label || "AI" })}>
                        {text.generate}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function resolveAISuperResolveSize(width: number, height: number, targetLongEdge: number) {
    const sourceWidth = Math.max(1, width);
    const sourceHeight = Math.max(1, height);
    const ratio = Math.max(sourceWidth, sourceHeight) / Math.max(1, Math.min(sourceWidth, sourceHeight));
    if (ratio > 3) return { width: sourceWidth, height: sourceHeight, size: "auto" };

    const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
    const target = Math.min(AI_IMAGE_MAX_EDGE, Math.max(targetLongEdge, sourceLongEdge));
    let scale = target / sourceLongEdge;
    let nextWidth = roundDownStep(sourceWidth * scale);
    let nextHeight = roundDownStep(sourceHeight * scale);
    if (nextWidth * nextHeight > AI_IMAGE_MAX_PIXELS) {
        scale *= Math.sqrt(AI_IMAGE_MAX_PIXELS / (nextWidth * nextHeight));
        nextWidth = roundDownStep(sourceWidth * scale);
        nextHeight = roundDownStep(sourceHeight * scale);
    }
    if (!nextWidth || !nextHeight) return { width: sourceWidth, height: sourceHeight, size: "auto" };
    return { width: nextWidth, height: nextHeight, size: `${nextWidth}x${nextHeight}` };
}

function roundDownStep(value: number) {
    return Math.max(AI_IMAGE_STEP, Math.floor(value / AI_IMAGE_STEP) * AI_IMAGE_STEP);
}
