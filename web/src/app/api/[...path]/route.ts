import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

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

function proxyWithKeepAlive(request: NextRequest, target: string, hasBody: boolean) {
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const writeKeepAlive = () => {
                try {
                    controller.enqueue(encoder.encode("\n"));
                } catch {
                    if (timer) clearInterval(timer);
                }
            };

            writeKeepAlive();
            timer = setInterval(writeKeepAlive, keepAliveIntervalMs);

            try {
                const response = await fetch(target, {
                    method: request.method,
                    headers: proxyHeaders(request),
                    body: hasBody ? request.body : undefined,
                    duplex: hasBody ? "half" : undefined,
                    redirect: "manual",
                    signal: abortController.signal,
                } as RequestInit & { duplex?: "half" });

                if (timer) {
                    clearInterval(timer);
                    timer = null;
                }

                if (response.body) {
                    const reader = response.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) controller.enqueue(value);
                    }
                } else {
                    controller.enqueue(encoder.encode(await response.text()));
                }
            } catch (error) {
                if (!abortController.signal.aborted) {
                    console.error("Failed to proxy long image request", target, error);
                    controller.enqueue(encoder.encode(errorJSON("API connection failed, please try again later")));
                }
            } finally {
                if (timer) clearInterval(timer);
                try {
                    controller.close();
                } catch {}
            }
        },
        cancel() {
            if (timer) clearInterval(timer);
            abortController.abort();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
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
