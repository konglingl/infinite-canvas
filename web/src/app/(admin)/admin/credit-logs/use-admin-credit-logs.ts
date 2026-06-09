"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { deleteAdminCreditLog, fetchAdminCreditLogs, saveAdminCreditLog, type AdminCreditLog, type AdminLogQuery } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

type CreditLogFilters = {
    keyword: string;
    userId: string;
    type: string;
    startAt: string;
    endAt: string;
};

const defaultFilters: CreditLogFilters = { keyword: "", userId: "", type: "", startAt: "", endAt: "" };

export function useAdminCreditLogs() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [filters, setFilters] = useState<CreditLogFilters>(defaultFilters);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);

    const queryParams: AdminLogQuery = { ...filters, page, pageSize };
    const query = useQuery({
        queryKey: ["admin", "credit-logs", token, filters, page, pageSize],
        queryFn: () => fetchAdminCreditLogs(token, queryParams),
        enabled: Boolean(token),
        retry: false,
    });

    const saveMutation = useMutation({
        mutationFn: (log: Partial<AdminCreditLog>) => saveAdminCreditLog(token, log),
        onSuccess: async (_, log) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "credit-logs"] });
            message.success(log.id ? "日志已保存" : "日志已新增");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminCreditLog(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "credit-logs"] });
            message.success("日志已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });

    useEffect(() => {
        if (query.isError) {
            const errorMessage = query.error instanceof Error ? query.error.message : "读取日志失败";
            message.error(errorMessage);
            if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
        }
    }, [clearSession, message, query.error, query.isError]);

    const applyFilters = (next: Partial<CreditLogFilters>) => {
        setFilters((current) => ({ ...current, ...next }));
        setPage(1);
    };

    const data = query.data;

    return {
        logs: data?.items || [],
        filters,
        page,
        pageSize,
        total: data?.total || 0,
        isLoading: query.isFetching || saveMutation.isPending || deleteMutation.isPending,
        searchLogs: applyFilters,
        changePage: setPage,
        changePageSize: (value: number) => {
            setPageSize(value);
            setPage(1);
        },
        resetFilters: () => {
            setFilters(defaultFilters);
            setPage(1);
            setPageSize(defaultPageSize);
        },
        refreshLogs: () => query.refetch(),
        saveLog: (log: Partial<AdminCreditLog>) => saveMutation.mutateAsync(log),
        deleteLog: (id: string) => deleteMutation.mutateAsync(id),
    };
}
