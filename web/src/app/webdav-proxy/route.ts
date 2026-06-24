import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBDAV_PROXY_TIMEOUT_MS = 120000;

export async function POST(request: NextRequest) {
    const target = request.headers.get("x-webdav-target") || "";
    const method = (request.headers.get("x-webdav-method") || "GET").toUpperCase();
    if (!target) return new Response("Missing x-webdav-target", { status: 400 });
    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return new Response("Invalid x-webdav-target", { status: 400 });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return new Response("Unsupported WebDAV target", { status: 400 });

    const headers = new Headers();
    copyHeader(request, headers, "x-webdav-authorization", "Authorization");
    copyHeader(request, headers, "content-type", "Content-Type");
    copyHeader(request, headers, "depth", "Depth");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBDAV_PROXY_TIMEOUT_MS);
    try {
        const body = method === "GET" || method === "HEAD" || method === "PROPFIND" || method === "MKCOL" ? await request.arrayBuffer().catch(() => undefined) : await request.arrayBuffer();
        const response = await fetch(url, { method, headers, body: body && body.byteLength ? body : undefined, signal: controller.signal });
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders(response.headers) });
    } catch (error) {
        return new Response(error instanceof Error ? error.message : "WebDAV proxy failed", { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}

function copyHeader(request: NextRequest, headers: Headers, from: string, to: string) {
    const value = request.headers.get(from);
    if (value) headers.set(to, value);
}

function responseHeaders(headers: Headers) {
    const result = new Headers();
    ["content-type", "etag", "last-modified"].forEach((key) => {
        const value = headers.get(key);
        if (value) result.set(key, value);
    });
    return result;
}
