"use client";

import { useMemo, useState } from "react";
import { Button, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Tag } from "antd";
import { Sparkles } from "lucide-react";

export type StoryWorkflowOptions = {
    title: string;
    story: string;
    style: string;
    shotCount: number;
    createVideoNodes: boolean;
};

type StoryWorkflowModalProps = {
    open: boolean;
    onCancel: () => void;
    onCreate: (options: StoryWorkflowOptions) => void;
};

const STYLE_OPTIONS = [
    { label: "电影感写实", value: "电影感写实，真实摄影质感，统一角色外观，细腻光影，高级调色" },
    { label: "国风幻想", value: "国风幻想，东方美学，精致服饰，水墨与电影光影结合，史诗氛围" },
    { label: "赛博科幻", value: "赛博科幻，霓虹灯光，未来城市，高对比色彩，电影级构图" },
    { label: "动漫分镜", value: "高质量动漫分镜，清晰线条，角色一致，动态构图，鲜明色彩" },
    { label: "产品广告", value: "高端产品广告摄影，干净背景，商业布光，突出主体质感" },
];

export function StoryWorkflowModal({ open, onCancel, onCreate }: StoryWorkflowModalProps) {
    const [title, setTitle] = useState("故事工作流");
    const [story, setStory] = useState("");
    const [style, setStyle] = useState(STYLE_OPTIONS[0].value);
    const [shotCount, setShotCount] = useState(6);
    const [createVideoNodes, setCreateVideoNodes] = useState(true);
    const wordCount = useMemo(() => story.trim().length, [story]);

    const submit = () => {
        const trimmed = story.trim();
        if (!trimmed) return;
        onCreate({ title: title.trim() || "故事工作流", story: trimmed, style, shotCount, createVideoNodes });
        setStory("");
    };

    return (
        <Modal
            title={
                <span className="inline-flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-500" />
                    一键故事工作流
                </span>
            }
            open={open}
            onCancel={onCancel}
            width={760}
            destroyOnHidden
            footer={
                <Space>
                    <Button onClick={onCancel}>取消</Button>
                    <Button type="primary" disabled={!story.trim()} onClick={submit}>
                        生成画布节点
                    </Button>
                </Space>
            }
        >
            <div className="space-y-4">
                <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-900">
                    借鉴 MagicalCanvas 的“一键创作”思路：把小说、剧本或创意拆成总纲、角色资产、场景资产、分镜生图配置和视频配置节点，自动连线排版。生成后可继续手动微调并批量生图。
                </div>
                <Form layout="vertical">
                    <Form.Item label="工作流标题">
                        <Input value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)} placeholder="例如：短片《雨夜来客》" />
                    </Form.Item>
                    <Form.Item label="统一视觉风格">
                        <Select
                            value={style}
                            onChange={setStyle}
                            options={STYLE_OPTIONS}
                            dropdownRender={(menu) => (
                                <>
                                    {menu}
                                    <div className="border-t p-2">
                                        <Input.TextArea value={style} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => setStyle(event.target.value)} placeholder="也可以在这里直接自定义完整风格描述" />
                                    </div>
                                </>
                            )}
                        />
                    </Form.Item>
                    <Form.Item
                        label={
                            <span className="flex items-center gap-2">
                                故事 / 剧本 / 创意
                                <Tag color={wordCount > 0 ? "purple" : "default"}>{wordCount} 字</Tag>
                            </span>
                        }
                    >
                        <Input.TextArea
                            value={story}
                            onChange={(event) => setStory(event.target.value)}
                            autoSize={{ minRows: 8, maxRows: 14 }}
                            placeholder="粘贴小说片段、短视频脚本、产品广告创意或分镜大纲。系统会自动拆出角色、场景和分镜节点。"
                        />
                    </Form.Item>
                    <div className="grid gap-3 md:grid-cols-2">
                        <Form.Item label="分镜数量">
                            <InputNumber className="w-full" min={3} max={12} value={shotCount} onChange={(value) => setShotCount(Number(value) || 6)} />
                        </Form.Item>
                        <Form.Item label="后续视频节点">
                            <Checkbox checked={createVideoNodes} onChange={(event) => setCreateVideoNodes(event.target.checked)}>
                                同时创建图生视频配置节点
                            </Checkbox>
                        </Form.Item>
                    </div>
                </Form>
            </div>
        </Modal>
    );
}
