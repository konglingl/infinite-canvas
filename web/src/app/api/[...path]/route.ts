import http from "node:http";
import https from "node:https";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 900;

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

const imageKeepAlivePaths = new Set(["v1/images/generations", "v1/images/edits"]);
const keepAliveIntervalMs = 25_000;

function proxyHeaders(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("connection");
    headers.set("x-forwarded-host", request.nextUrl.host);
    headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
    return headers;
}

function responseHeaders(response: Response) {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    return headers;
}

function shouldKeepAliveImageRequest(method: string, path: string[]) {
    return method === "POST" && imageKeepAlivePaths.has(path.join("/"));
}

function errorJSON(message: string) {
    return JSON.stringify({ code: 1, data: null, msg: message });
}

function nodeProxyHeaders(request: NextRequest, bodyBytes: Uint8Array | null) {
    const headers: Record<string, string> = {};
    proxyHeaders(request).forEach((value, key) => {
        headers[key] = value;
    });
    if (bodyBytes) headers["content-length"] = String(bodyBytes.byteLength);
    return headers;
}

async function proxyWithKeepAlive(request: NextRequest, target: string, hasBody: boolean) {
    const encoder = new TextEncoder();
    const bodyBytes = hasBody ? new Uint8Array(await request.arrayBuffer()) : null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let upstreamRequest: http.ClientRequest | null = null;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const clearKeepAlive = () => {
                if (!timer) return;
                clearInterval(timer);
                timer = null;
            };
            const enqueue = (value: Uint8Array) => {
                if (closed) return;
                try {
                    controller.enqueue(value);
                } catch {
                    closed = true;
                    clearKeepAlive();
                    upstreamRequest?.destroy();
                }
            };
            const close = () => {
                if (closed) return;
                closed = true;
                clearKeepAlive();
                try {
                    controller.close();
                } catch {}
            };
            const fail = (error: unknown) => {
                clearKeepAlive();
                console.error("Failed to proxy long image request", target, error);
                enqueue(encoder.encode(errorJSON("API connection failed, please try again later")));
                close();
            };
            const writeKeepAlive = () => enqueue(encoder.encode("\n"));

            writeKeepAlive();
            timer = setInterval(writeKeepAlive, keepAliveIntervalMs);

            const targetUrl = new URL(target);
            const client = targetUrl.protocol === "https:" ? https : http;
            upstreamRequest = client.request(
                targetUrl,
                {
                    method: request.method,
                    headers: nodeProxyHeaders(request, bodyBytes),
                    timeout: 0,
                },
                (response) => {
                    clearKeepAlive();
                    response.on("data", (chunk: Buffer) => enqueue(new Uint8Array(chunk)));
                    response.on("end", close);
                    response.on("error", fail);
                },
            );
            upstreamRequest.setTimeout(0);
            upstreamRequest.on("error", fail);
            if (bodyBytes) upstreamRequest.write(bodyBytes);
            upstreamRequest.end();
        },
        cancel() {
            closed = true;
            if (timer) clearInterval(timer);
            upstreamRequest?.destroy();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Shengtu-Long-Proxy": "node-http",
        },
    });
}

async function proxy(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:18080";
    const target = `${apiBaseUrl.replace(/\/$/, "")}/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    if (shouldKeepAliveImageRequest(request.method, path)) {
        return proxyWithKeepAlive(request, target, hasBody);
    }

    try {
        const response = await fetch(target, {
            method: request.method,
            headers: proxyHeaders(request),
            body: hasBody ? request.body : undefined,
            duplex: hasBody ? "half" : undefined,
            redirect: "manual",
        } as RequestInit & { duplex?: "half" });

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders(response),
        });
    } catch (error) {
        console.error("Failed to proxy", target, error);
        return Response.json({ code: 1, data: null, msg: "API connection failed, please check backend service" }, { status: 502 });
    }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
