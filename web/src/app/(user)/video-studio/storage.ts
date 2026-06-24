import localforage from "localforage";

import type { VideoStudioProject } from "./types";

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "video_studio_projects" });
const PROJECT_INDEX_KEY = "video-studio:project-index";

export async function listVideoStudioProjects() {
    const ids = (await store.getItem<string[]>(PROJECT_INDEX_KEY)) || [];
    const projects = await Promise.all(ids.map((id) => store.getItem<VideoStudioProject>(projectKey(id))));
    return projects.filter((project): project is VideoStudioProject => Boolean(project)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveVideoStudioProject(project: VideoStudioProject) {
    const next = { ...project, updatedAt: Date.now() };
    await store.setItem(projectKey(next.id), next);
    const ids = (await store.getItem<string[]>(PROJECT_INDEX_KEY)) || [];
    await store.setItem(PROJECT_INDEX_KEY, [next.id, ...ids.filter((id) => id !== next.id)].slice(0, 100));
    return next;
}

export async function deleteVideoStudioProject(projectId: string) {
    await store.removeItem(projectKey(projectId));
    const ids = (await store.getItem<string[]>(PROJECT_INDEX_KEY)) || [];
    await store.setItem(PROJECT_INDEX_KEY, ids.filter((id) => id !== projectId));
}

function projectKey(projectId: string) {
    return `video-studio:project:${projectId}`;
}
