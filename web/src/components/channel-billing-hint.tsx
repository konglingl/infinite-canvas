"use client";

import type { ComponentProps } from "react";

import { CreditSymbol } from "@/constant/credits";
import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";

type BillingConfig = Pick<AiConfig, "channelMode">;

type ChannelBillingProps = {
    config: BillingConfig;
    credits?: number;
    compact?: boolean;
    className?: string;
    onChannelModeChange?: (mode: BillingConfig["channelMode"]) => void;
};

export function isUserKeyBillingMode(config: BillingConfig) {
    return config.channelMode === "local";
}

export function channelBillingTitle(config: BillingConfig, credits?: number) {
    if (isUserKeyBillingMode(config)) return "自带 Key：使用你自己的 API Key，不扣本站算力点";
    if (typeof credits === "number" && credits > 0) return `云端渠道：使用平台后台模型渠道，本次预计扣 ${credits.toLocaleString()} 算力点`;
    return "云端渠道：使用平台后台模型渠道，会扣本站算力点";
}

export function ChannelBillingBadge({ config, credits, compact = false, className }: ChannelBillingProps) {
    const local = isUserKeyBillingMode(config);
    return (
        <span
            title={channelBillingTitle(config, credits)}
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
                local ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                className,
            )}
        >
            {local ? (compact ? "自带Key·不扣点" : "自带 Key / 不扣点") : compact ? "云端·扣点" : "云端渠道 / 扣点"}
            {!local && typeof credits === "number" && credits > 0 ? (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                    <CreditSymbol />
                    {credits.toLocaleString()}
                </span>
            ) : null}
        </span>
    );
}

export function ChannelBillingHint({ config, credits, className, onChannelModeChange }: ChannelBillingProps) {
    const local = isUserKeyBillingMode(config);
    return (
        <div
            className={cn(
                "rounded-lg border px-3 py-2 text-xs leading-5",
                local ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
                className,
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <ChannelBillingBadge config={config} credits={credits} />
                    <span>{local ? "当前使用客户自己的 API Key，不扣本站算力点。" : "当前使用平台后台模型渠道，会按模型消耗本站算力点。"}</span>
                </div>
                {onChannelModeChange ? <ChannelModeSwitch mode={config.channelMode} onChange={onChannelModeChange} /> : null}
            </div>
            {!local && typeof credits === "number" && credits > 0 ? (
                <div className="mt-1 inline-flex items-center gap-1 font-medium">
                    本次预计消耗 <CreditSymbol /> {credits.toLocaleString()} 算力点
                </div>
            ) : null}
        </div>
    );
}

function ChannelModeSwitch({ mode, onChange }: { mode: BillingConfig["channelMode"]; onChange: (mode: BillingConfig["channelMode"]) => void }) {
    return (
        <span className="inline-flex shrink-0 rounded-full border border-current/20 bg-background/70 p-0.5 text-[11px] font-medium">
            {([
                ["local", "自带 Key"],
                ["remote", "云端渠道"],
            ] as const).map(([value, label]) => (
                <button
                    key={value}
                    type="button"
                    className={cn(
                        "rounded-full px-2 py-1 transition",
                        mode === value ? "bg-current/15 text-current" : "text-current/70 hover:bg-current/10 hover:text-current",
                    )}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onChange(value)}
                >
                    {label}
                </button>
            ))}
        </span>
    );
}

export function ChannelBillingCost({ config, credits, className, compact: _compact, onChannelModeChange: _onChannelModeChange, ...props }: ChannelBillingProps & ComponentProps<"span">) {
    const local = isUserKeyBillingMode(config);
    return (
        <span {...props} title={channelBillingTitle(config, credits)} className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", className)}>
            {local ? "不扣点" : (
                <>
                    <CreditSymbol />
                    {(credits || 0).toLocaleString()}
                </>
            )}
        </span>
    );
}
