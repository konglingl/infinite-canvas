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
    useAiSplit: boolean;
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

type StoryWorkflowTemplate = {
    title: string;
    tag: string;
    description: string;
    story: string;
    style: string;
    shotCount: number;
    createVideoNodes: boolean;
};

const WORKFLOW_TEMPLATES: StoryWorkflowTemplate[] = [
    {
        title: "萌宠舞蹈短视频",
        tag: "竖屏爆款",
        description: "参考 MagicalCanvas 的动物跳舞案例，快速生成角色图、动作递进图和视频节点。",
        style: "可爱写实短视频，竖屏构图，明亮室内光线，夸张但自然的动作，适合社媒传播",
        shotCount: 5,
        createVideoNodes: true,
        story: "一只拟人化的小猫站在餐桌中央，周围是被轻轻挪开的餐具。它先好奇地观察镜头，然后伴随轻快节奏做出左右摆手、转身、踢腿和定格 pose。画面要保留猫咪可爱表情、干净桌面和连续舞蹈动作，最后生成适合竖屏短视频的图生视频镜头。",
    },
    {
        title: "电影片场探访",
        tag: "角色一致",
        description: "把角色参考扩展成片场自拍、正面设定、环境照和连续剧情镜头。",
        style: "电影感写实，真实摄影质感，柔和片场灯光，角色面部一致，背景有轻微景深",
        shotCount: 6,
        createVideoNodes: true,
        story: "主角收到一张神秘通行证，进入一座复古电影片场。先生成主角正面设定照，再生成主角在片场门口自拍、与工作人员交流、穿过布景街道、站在聚光灯下回望镜头的连续画面。整体像真实幕后花絮，氛围温暖、怀旧、有故事感。",
    },
    {
        title: "第一视角竞速",
        tag: "运动镜头",
        description: "围绕高速运动主体拆出 POV、跟拍、特写和冲刺视频配置。",
        style: "高速运动摄影，第一视角，强动态模糊，低机位广角，电影级色彩和速度感",
        shotCount: 6,
        createVideoNodes: true,
        story: "一名骑手驾驶未来感摩托穿越海岸公路。镜头从头盔第一视角出发，依次展示仪表盘特写、轮胎贴地过弯、道路两侧风景高速掠过、无人机俯拍跟随、隧道光影穿梭和冲出终点的瞬间。需要把每个镜头拆成可生图的画面提示，并附带适合图生视频的运动描述。",
    },
    {
        title: "产品广告分镜",
        tag: "商业广告",
        description: "把产品卖点拆成主视觉、材质特写、使用场景和收尾海报。",
        style: "高端产品广告摄影，干净背景，商业布光，微距材质细节，简洁高级",
        shotCount: 5,
        createVideoNodes: false,
        story: "为一款极简智能香薰音箱制作广告分镜。先展示产品悬浮在柔和渐变背景中的主视觉，再展示金属旋钮、织物网面和雾化光效细节，随后进入卧室、书桌、瑜伽空间三个使用场景，最后生成带品牌感的收尾海报画面。重点突出安静、治愈、智能和高级质感。",
    },
];

export function StoryWorkflowModal({ open, onCancel, onCreate }: StoryWorkflowModalProps) {
    const [title, setTitle] = useState("故事工作流");
    const [story, setStory] = useState("");
    const [style, setStyle] = useState(STYLE_OPTIONS[0].value);
    const [shotCount, setShotCount] = useState(6);
    const [createVideoNodes, setCreateVideoNodes] = useState(true);
    const [useAiSplit, setUseAiSplit] = useState(true);
    const wordCount = useMemo(() => story.trim().length, [story]);

    const applyTemplate = (template: StoryWorkflowTemplate) => {
        setTitle(template.title);
        setStory(template.story);
        setStyle(template.style);
        setShotCount(template.shotCount);
        setCreateVideoNodes(template.createVideoNodes);
        setUseAiSplit(true);
    };

    const submit = () => {
        const trimmed = story.trim();
        if (!trimmed) return;
        onCreate({ title: title.trim() || "故事工作流", story: trimmed, style, shotCount, createVideoNodes, useAiSplit });
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
            width={860}
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
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-foreground">MagicalCanvas 灵感模板</div>
                        <div className="text-xs text-muted-foreground">点击后自动填入标题、故事、风格和分镜数量</div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                        {WORKFLOW_TEMPLATES.map((template) => (
                            <button
                                key={template.title}
                                type="button"
                                onClick={() => applyTemplate(template)}
                                className="rounded-xl border border-border bg-background p-3 text-left transition hover:border-purple-300 hover:bg-purple-50/70"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground">{template.title}</span>
                                    <Tag color="purple">{template.tag}</Tag>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</p>
                                <div className="mt-2 text-xs text-purple-700">
                                    {template.shotCount} 个分镜 · {template.createVideoNodes ? "含视频节点" : "仅生图节点"}
                                </div>
                            </button>
                        ))}
                    </div>
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
                    <div className="grid gap-3 md:grid-cols-3">
                        <Form.Item label="分镜数量">
                            <InputNumber className="w-full" min={3} max={12} value={shotCount} onChange={(value) => setShotCount(Number(value) || 6)} />
                        </Form.Item>
                        <Form.Item label="AI 拆分">
                            <Checkbox checked={useAiSplit} onChange={(event) => setUseAiSplit(event.target.checked)}>
                                调用文本模型拆角色/场景/分镜
                            </Checkbox>
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
