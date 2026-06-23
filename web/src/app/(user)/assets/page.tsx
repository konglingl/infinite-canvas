"use client";

import { CheckSquare, Copy, Download, PencilLine, Search, Trash2, Upload, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Card, Checkbox, Drawer, Empty, Form, Image, Input, Modal, Pagination, Select, Space, Tag, Typography } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes, readFileAsDataUrl } from "@/lib/image-utils";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { cn } from "@/lib/utils";
import { LocalStorageNotice } from "@/components/local-storage-notice";
import { useAssetStore, type Asset, type AssetKind, type ImageAsset } from "@/stores/use-asset-store";
import { exportAssets, readAssetPackage } from "./asset-transfer";

type AssetFormValues = {
    kind: AssetKind;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
};

type ImageDraft = ImageAsset["data"] | null;

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
];

export default function AssetsPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const batchFileInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
    const [formKind, setFormKind] = useState<AssetKind>("text");
    const [imageDraft, setImageDraft] = useState<ImageDraft>(null);
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    const [batchImporting, setBatchImporting] = useState(false);
    const [manageMode, setManageMode] = useState(false);
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => assets.filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video"), [assets]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);


    useEffect(() => {
        const validIds = new Set(validAssets.map((asset) => asset.id));
        setSelectedAssetIds((ids) => new Set(Array.from(ids).filter((id) => validIds.has(id))));
    }, [validAssets]);

    const openCreate = () => {
        setEditingAsset(null);
        setImageDraft(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", title: "", coverUrl: "", tags: [], source: "手动添加", note: "", content: "" });
        setIsAssetOpen(true);
    };

    const openEdit = (asset: Asset) => {
        setEditingAsset(asset);
        setFormKind(asset.kind);
        setImageDraft(asset.kind === "image" ? asset.data : null);
        form.setFieldsValue({
            kind: asset.kind,
            title: asset.title,
            coverUrl: asset.coverUrl,
            tags: asset.tags || [],
            source: asset.source,
            note: asset.note,
            content: asset.kind === "text" ? asset.data.content : "",
        });
        setIsAssetOpen(true);
    };

    const saveAsset = async () => {
        const values = await form.validateFields();
        const base = {
            title: values.title.trim(),
            coverUrl: values.coverUrl?.trim() || (values.kind === "image" && imageDraft ? imageDraft.dataUrl : ""),
            tags: values.tags || [],
            source: values.source?.trim(),
            note: values.note?.trim(),
            metadata: editingAsset?.metadata || { source: "manual" },
        };

        if (values.kind === "text") {
            const asset = { ...base, kind: "text" as const, data: { content: (values.content || "").trim() } };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else {
            if (!imageDraft) {
                message.error("请选择图片文件");
                return;
            }
            const asset = { ...base, kind: "image" as const, data: imageDraft };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        }

        message.success(editingAsset ? "素材已更新" : "素材已保存");
        setIsAssetOpen(false);
    };

    const readCoverFile = async (file?: File) => {
        if (!file) return;
        const dataUrl = await readFileAsDataUrl(file);
        form.setFieldValue("coverUrl", dataUrl);
    };

    const readImageFile = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        const hideLoading = message.loading("正在上传图片素材...", 0);
        try {
            const image = await uploadImage(file);
            const draft = { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
            setImageDraft(draft);
            if (!form.getFieldValue("coverUrl")) form.setFieldValue("coverUrl", draft.dataUrl);
            if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
            message.success("图片素材上传成功");
        } catch (error) {
            message.error(error instanceof Error ? `图片上传失败：${error.message}` : "图片上传失败");
        } finally {
            hideLoading();
        }
    };

    const copyAssetText = async (asset: Asset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadImage = async (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video") return;
        const url = asset.kind === "video" ? asset.data.url : asset.data.dataUrl;
        const filename = `${asset.title || "asset"}.${asset.data.mimeType.split("/")[1] || (asset.kind === "video" ? "mp4" : "png")}`;

        if (url.startsWith("data:") || url.startsWith("blob:")) {
            saveAs(url, filename);
        } else {
            const hideLoading = message.loading("正在下载媒体文件...", 0);
            try {
                const response = await fetch(url.startsWith("http") ? `/api/proxy-image?url=${encodeURIComponent(url)}` : url);
                const blob = await response.blob();
                saveAs(blob, filename);
            } catch (error) {
                console.error("Download error, falling back to open:", error);
                saveAs(url, filename);
            } finally {
                hideLoading();
            }
        }
    };

    const exportAllAssets = async () => {
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        await exportAssets(validAssets);
    };

    const importAssetZip = async (file?: File) => {
        if (!file) return;
        try {
            const importedAssets = await readAssetPackage(file);
            importedAssets.forEach((asset) => {
                const payload = { ...asset } as Record<string, unknown>;
                delete payload.id;
                delete payload.createdAt;
                delete payload.updatedAt;
                addAsset(payload as Parameters<typeof addAsset>[0]);
            });
            message.success(`已导入 ${importedAssets.length} 个素材`);
        } catch {
            message.error("导入失败，请选择有效的素材压缩包");
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const importLooseAssetFiles = async (filesLike?: FileList | File[]) => {
        const files = Array.from(filesLike || []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("text/") || /\.(txt|md|markdown|prompt)$/i.test(file.name));
        if (!files.length) {
            message.warning("请选择图片、视频或文本文件");
            return;
        }
        setBatchImporting(true);
        const hideLoading = message.loading(`正在导入 ${files.length} 个素材...`, 0);
        let imported = 0;
        let failed = 0;
        try {
            for (const file of files) {
                try {
                    if (file.type.startsWith("image/")) {
                        const image = await uploadImage(file);
                        addAsset({
                            kind: "image",
                            title: file.name.replace(/\.[^.]+$/, "") || file.name,
                            coverUrl: image.url,
                            tags: ["批量导入"],
                            source: "拖放/批量导入",
                            note: "",
                            data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
                        });
                        imported++;
                    } else if (file.type.startsWith("video/")) {
                        const media = await uploadMediaFile(file, "asset-video");
                        addAsset({
                            kind: "video",
                            title: file.name.replace(/\.[^.]+$/, "") || file.name,
                            coverUrl: "",
                            tags: ["批量导入"],
                            source: "拖放/批量导入",
                            note: "",
                            data: { url: media.url, storageKey: media.storageKey, width: media.width || 1280, height: media.height || 720, bytes: media.bytes, mimeType: media.mimeType },
                        });
                        imported++;
                    } else {
                        const content = await file.text();
                        addAsset({ kind: "text", title: file.name.replace(/\.[^.]+$/, "") || file.name, coverUrl: "", tags: ["批量导入"], source: "拖放/批量导入", note: "", data: { content } });
                        imported++;
                    }
                } catch (error) {
                    console.error("Import asset failed", file.name, error);
                    failed++;
                }
            }
            if (imported) message.success(`已导入 ${imported} 个素材${failed ? `，${failed} 个失败` : ""}`);
            else message.error("素材导入失败");
        } finally {
            hideLoading();
            setBatchImporting(false);
            setIsDraggingFiles(false);
            if (batchFileInputRef.current) batchFileInputRef.current.value = "";
        }
    };

    const toggleSelectAsset = (id: string, checked?: boolean) => {
        setSelectedAssetIds((ids) => {
            const next = new Set(ids);
            const shouldSelect = checked ?? !next.has(id);
            if (shouldSelect) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const selectVisibleAssets = () => setSelectedAssetIds((ids) => new Set([...ids, ...visibleAssets.map((asset) => asset.id)]));

    const clearSelectedAssets = () => setSelectedAssetIds(new Set());

    const deleteSelectedAssets = () => {
        if (!selectedAssetIds.size) return;
        Modal.confirm({
            title: "批量删除素材",
            content: `确定删除选中的 ${selectedAssetIds.size} 个素材吗？删除后会从我的素材中移除。`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                selectedAssetIds.forEach((id) => removeAsset(id));
                message.success(`已删除 ${selectedAssetIds.size} 个素材`);
                setSelectedAssetIds(new Set());
            },
        });
    };
    const confirmDelete = () => {
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success("素材已删除");
        setDeletingAsset(null);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main
                className="relative min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]"
                onDragOver={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer.types.includes("Files")) setIsDraggingFiles(true);
                }}
                onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingFiles(false);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    void importLooseAssetFiles(event.dataTransfer.files);
                }}
            >
                {isDraggingFiles ? (
                    <div className="pointer-events-none absolute inset-4 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-purple-400 bg-purple-500/10 text-purple-700 backdrop-blur-sm dark:text-purple-200">
                        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/90 px-8 py-6 text-center shadow-xl dark:bg-stone-950/90">
                            <UploadCloud className="size-10" />
                            <div className="text-base font-semibold">松开即可批量导入素材</div>
                            <div className="text-xs opacity-70">支持图片、视频、txt / md 文本文件</div>
                        </div>
                    </div>
                ) : null}
                <div className="pb-8">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">我的素材</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">收藏常用文本和图片，按类型、标题和标签快速查找。</p>
                    </div>

                    <LocalStorageNotice scope="assets" className="mx-auto mt-5 max-w-3xl" />

                    <div className="mx-auto mt-8 w-full max-w-2xl">
                        <Input.Search
                            className="w-full"
                            size="large"
                            allowClear
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            placeholder="搜索标题、内容、标签或来源"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                            onSearch={(value) => {
                                setPage(1);
                                setKeyword(value);
                            }}
                        />
                    </div>

                    <div className="mx-auto mt-6 grid max-w-6xl gap-3 text-left">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-center">
                                <div className="text-xs font-medium text-stone-500 dark:text-stone-400">类型</div>
                                <div className="flex flex-wrap gap-2">
                                    {kindOptions.map((option) => (
                                        <Tag.CheckableTag
                                            key={option.value}
                                            checked={kindFilter === option.value}
                                            className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")}
                                            onChange={() => {
                                                setPage(1);
                                                setKindFilter(option.value as AssetKind | "all");
                                            }}
                                        >
                                            {option.label}
                                        </Tag.CheckableTag>
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    onClick={() => void exportAllAssets()}
                                >
                                    导出素材
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    onClick={() => assetInputRef.current?.click()}
                                >
                                    导入备份包
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={batchImporting}
                                    onClick={() => batchFileInputRef.current?.click()}
                                >
                                    批量导入文件
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    onClick={() => {
                                        setManageMode((value) => !value);
                                        setSelectedAssetIds(new Set());
                                    }}
                                >
                                    {manageMode ? "退出管理" : "管理素材"}
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    onClick={openCreate}
                                >
                                    新增素材
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mx-auto flex max-w-7xl flex-col gap-5">
                    {manageMode ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-950/80">
                            <div className="inline-flex items-center gap-2 text-stone-600 dark:text-stone-300">
                                <CheckSquare className="size-4" />
                                已选 {selectedAssetIds.size} 个素材
                            </div>
                            <Space wrap>
                                <Button size="small" onClick={selectVisibleAssets} disabled={!visibleAssets.length}>
                                    选择本页
                                </Button>
                                <Button size="small" onClick={clearSelectedAssets} disabled={!selectedAssetIds.size}>
                                    取消选择
                                </Button>
                                <Button size="small" danger onClick={deleteSelectedAssets} disabled={!selectedAssetIds.size}>
                                    删除选中
                                </Button>
                            </Space>
                        </div>
                    ) : null}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleAssets.map((asset) => (
                            <AssetCard
                                key={asset.id}
                                asset={asset}
                                manageMode={manageMode}
                                selected={selectedAssetIds.has(asset.id)}
                                onSelect={(checked) => toggleSelectAsset(asset.id, checked)}
                                onOpen={() => setPreviewAsset(asset)}
                                onEdit={() => openEdit(asset)}
                                onCopy={copyAssetText}
                                onDownload={downloadImage}
                                onDelete={() => setDeletingAsset(asset)}
                                onPreviewImage={setPreviewImageUrl}
                                onPlayVideo={setPreviewVideoUrl}
                            />
                        ))}
                    </div>

                    {!visibleAssets.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材" className="py-20" /> : null}

                    <div className="flex justify-center">
                        <Pagination
                            current={page}
                            pageSize={pageSize}
                            total={filteredAssets.length}
                            showSizeChanger
                            pageSizeOptions={[10, 20, 50, 100]}
                            onChange={(nextPage, nextPageSize) => {
                                setPage(nextPage);
                                setPageSize(nextPageSize);
                            }}
                        />
                    </div>
                </div>
            </main>

            <Modal title={editingAsset ? "编辑素材" : "新增素材"} open={isAssetOpen} width={980} onCancel={() => setIsAssetOpen(false)} onOk={() => void saveAsset()} okText="保存" cancelText="取消" destroyOnHidden>
                <div className="grid gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: "text", tags: [] }}>
                        <Form.Item name="kind" label="类型">
                            <Select
                                options={[
                                    { label: "文本", value: "text" },
                                    { label: "图片", value: "image" },
                                ]}
                                onChange={(value) => setFormKind(value)}
                            />
                        </Form.Item>
                        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                            <Input size="large" placeholder="给素材起一个容易检索的名字" />
                        </Form.Item>
                        <Form.Item name="coverUrl" label="封面 URL">
                            <Space.Compact className="w-full">
                                <Input placeholder="可粘贴图片 URL，也可以上传本地封面" />
                                <Button icon={<Upload className="size-3.5" />} onClick={() => coverInputRef.current?.click()}>
                                    上传
                                </Button>
                            </Space.Compact>
                        </Form.Item>
                        <Form.Item name="tags" label="标签">
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
                        </Form.Item>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="source" label="来源">
                                <Input placeholder="手动添加 / 画布 / 提示词库" />
                            </Form.Item>
                            <Form.Item name="note" label="备注">
                                <Input placeholder="可选" />
                            </Form.Item>
                        </div>
                        {formKind === "text" ? (
                            <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                                <Input.TextArea rows={8} placeholder="保存提示词、说明文案、参考描述等文本素材" />
                            </Form.Item>
                        ) : (
                            <Form.Item label="图片内容" required>
                                <div className="rounded-lg border border-dashed border-stone-300 p-4 dark:border-stone-700">
                                    <Button icon={<Upload className="size-4" />} onClick={() => imageInputRef.current?.click()}>
                                        选择图片文件
                                    </Button>
                                    {imageDraft ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {imageDraft.width}x{imageDraft.height} · {formatBytes(imageDraft.bytes)}
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            未选择图片
                                        </Typography.Text>
                                    )}
                                </div>
                            </Form.Item>
                        )}
                    </Form>
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950">
                        <Typography.Text strong>预览</Typography.Text>
                        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
                            {coverUrl || imageDraft?.dataUrl ? (
                                <img src={coverUrl || imageDraft?.dataUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                            ) : (
                                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm text-stone-500 dark:bg-stone-900">{content || "暂无封面"}</div>
                            )}
                            <div className="p-4">
                                <Typography.Text strong ellipsis className="block">
                                    {title || "未命名素材"}
                                </Typography.Text>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {tags.length ? (
                                        tags.map((tag, index) => (
                                            <Tag key={`${tag}-${index}`} className="m-0">
                                                {tag}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Tag className="m-0">未打标签</Tag>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readImageFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </Modal>

            <AssetDrawer asset={previewAsset} onClose={() => setPreviewAsset(null)} onCopy={copyAssetText} onDownload={downloadImage} />

            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />
            <input ref={batchFileInputRef} type="file" multiple accept="image/*,video/*,text/*,.txt,.md,.markdown,.prompt" className="hidden" onChange={(event) => void importLooseAssetFiles(event.target.files || undefined)} />

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>

            {/* 隐藏的图片全屏预览器 */}
            <div className="hidden">
                <Image
                    src={previewImageUrl || undefined}
                    preview={{
                        open: Boolean(previewImageUrl),
                        onOpenChange: (open) => {
                            if (!open) setPreviewImageUrl(null);
                        },
                    }}
                />
            </div>

            {/* 视频 Modal 播放器 */}
            <Modal
                open={Boolean(previewVideoUrl)}
                onCancel={() => setPreviewVideoUrl(null)}
                footer={null}
                destroyOnHidden
                centered
                width={800}
                styles={{
                    body: {
                        padding: 0,
                        backgroundColor: "#000",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        minHeight: 300,
                    },
                }}
            >
                {previewVideoUrl && (
                    <video src={previewVideoUrl} controls autoPlay className="max-h-[70vh] max-w-full rounded" />
                )}
            </Modal>
        </div>
    );
}

function AssetCard({
    asset,
    manageMode,
    selected,
    onSelect,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    onPreviewImage,
    onPlayVideo,
}: {
    asset: Asset;
    manageMode?: boolean;
    selected?: boolean;
    onSelect?: (checked: boolean) => void;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: () => void;
    onPreviewImage: (url: string) => void;
    onPlayVideo: (url: string) => void;
}) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const summary = assetSummary(asset);

    const handleCardClick = () => {
        if (manageMode) {
            onSelect?.(!selected);
            return;
        }
        if (asset.kind === "text") {
            void onCopy(asset);
        } else if (asset.kind === "image") {
            onPreviewImage(asset.data.dataUrl || asset.coverUrl);
        } else if (asset.kind === "video") {
            onPlayVideo(asset.data.url);
        }
    };

    return (
        <Card
            hoverable
            className={cn("relative overflow-hidden", selected && "ring-2 ring-purple-500")}
            styles={{ body: { padding: 0 } }}
            cover={
                <button type="button" className="block w-full text-left" onClick={handleCardClick}>
                    {cover ? (
                        <img src={cover} alt={asset.title} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                            {asset.kind === "text" ? asset.data.content : "暂无封面"}
                        </div>
                    )}
                </button>
            }
        >
            {manageMode ? (
                <Checkbox
                    checked={selected}
                    className="absolute left-3 top-3 z-10 rounded bg-white/90 p-1 shadow dark:bg-stone-900/90"
                    onChange={(event) => onSelect?.(event.target.checked)}
                    onClick={(event) => event.stopPropagation()}
                />
            ) : null}
            <button type="button" className="block w-full text-left" onClick={handleCardClick}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{asset.title}</h2>
                            <Typography.Text type="secondary" className="mt-1 block text-xs">
                                {asset.source || "未标注来源"}
                            </Typography.Text>
                        </div>
                        <Tag className="m-0 shrink-0 text-[11px]">{asset.kind === "image" ? "图片" : asset.kind === "video" ? "视频" : "文本"}</Tag>
                    </div>
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 3 }} className="!mb-0 !mt-2 !text-xs !leading-5">
                        {summary}
                    </Typography.Paragraph>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {(asset.tags || []).slice(0, 3).map((tag, index) => (
                            <Tag key={`${tag}-${index}`} className="m-0 text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                        {!asset.tags?.length ? <Tag className="m-0 text-[11px]">无标签</Tag> : null}
                    </div>
                </div>
            </button>
            {!manageMode ? (
                <div className="flex items-center gap-2 px-4 pb-4">
                    <Button size="small" onClick={onOpen}>
                        查看
                    </Button>
                    {asset.kind !== "video" ? (
                        <Button size="small" icon={<PencilLine className="size-3.5" />} onClick={onEdit}>
                            编辑
                        </Button>
                    ) : null}
                    {asset.kind === "text" ? (
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => void onCopy(asset)}>
                            复制
                        </Button>
                    ) : null}
                    {asset.kind === "image" || asset.kind === "video" ? (
                        <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(asset)}>
                            下载
                        </Button>
                    ) : null}
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
                        删除
                    </Button>
                </div>
            ) : null}
        </Card>
    );
}

function AssetDrawer({ asset, onClose, onCopy, onDownload }: { asset: Asset | null; onClose: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void }) {
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    return (
        <Drawer title="素材详情" open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? (
                <div className="space-y-5">
                    {cover ? (
                        <Image src={cover} alt={asset.title} className="rounded-lg" />
                    ) : (
                        <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                    <div>
                        <Typography.Title level={4} className="!mb-2">
                            {asset.title}
                        </Typography.Title>
                        <Space size={[4, 4]} wrap>
                            <Tag>{asset.kind === "image" ? "图片" : asset.kind === "video" ? "视频" : "文本"}</Tag>
                            {(asset.tags || []).map((tag, index) => (
                                <Tag key={`${tag}-${index}`}>{tag}</Tag>
                            ))}
                        </Space>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <Typography.Text type="secondary" className="block text-xs">
                            内容
                        </Typography.Text>
                        {asset.kind === "text" ? (
                            <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{asset.data.content}</Typography.Paragraph>
                        ) : asset.kind === "video" ? (
                            <video src={asset.data.url} controls className="mt-2 aspect-video w-full rounded-lg bg-black" />
                        ) : (
                            <Typography.Text className="mt-2 block">
                                {asset.data.width}x{asset.data.height} · {formatBytes(asset.data.bytes)} · {asset.data.mimeType}
                            </Typography.Text>
                        )}
                    </div>
                    {asset.note ? (
                        <div>
                            <Typography.Text type="secondary">备注</Typography.Text>
                            <Typography.Paragraph className="mt-1">{asset.note}</Typography.Paragraph>
                        </div>
                    ) : null}
                    <Space>
                        {asset.kind === "text" ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(asset)}>
                                复制文本
                            </Button>
                        ) : null}
                        {asset.kind === "image" || asset.kind === "video" ? (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(asset)}>
                                {asset.kind === "video" ? "下载视频" : "下载图片"}
                            </Button>
                        ) : null}
                    </Space>
                </div>
            ) : null}
        </Drawer>
    );
}

function assetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}
