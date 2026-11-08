import * as FS from "expo-file-system/legacy";
import {
  Entry,
  Format,
  RemoteTask,
  Settings,
  Voice,
  normalizeUrl,
} from "./domain";
import { ROOT } from "./storage";
type Envelope<T> = { code: string; message: string; data: T };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export type Connection = { settings: Settings; token: string };
const server = (c: Connection) => normalizeUrl(c.settings.url, __DEV__);
export const headers = (c: Connection) => ({
  Authorization: `Bearer ${c.token}`,
});
export async function call<T>(
  c: Connection,
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!c.settings.url) throw new Error("请先在设置中连接你的服务器。");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.method === "POST" ? 90000 : 20000,
  );
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(server(c) + path, {
      ...init,
      headers: { ...headers(c), ...init.headers },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({
      code: "INVALID_RESPONSE",
      message: `服务返回了无效响应（${response.status}）`,
    }));
    if (!response.ok || body.code !== "OK")
      throw new ApiError(
        body.message || `请求失败（${response.status}）`,
        response.status,
        body.code,
      );
    return (body as Envelope<T>).data;
  } catch (e) {
    if (controller.signal.aborted && !signal?.aborted)
      throw new Error("连接超时，请检查网络与服务器地址。");
    throw e;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export const health = (c: Connection) =>
  call<{
    ai: { ready: boolean; error?: string; device?: string };
    version: string;
  }>(c, "/api/health");
export const voices = (c: Connection) => call<Voice[]>(c, "/api/voices");
export async function submit(
  c: Connection,
  entry: Entry,
  voiceId: string,
  format: Format,
  signal: AbortSignal,
) {
  const body = new FormData();
  body.append("audio", {
    uri: entry.sourceUri,
    name: entry.name + "." + entry.sourceUri.split(".").pop(),
    type: entry.sourceMime,
  } as unknown as Blob);
  body.append("voiceId", voiceId);
  body.append("format", format);
  return call<RemoteTask>(c, "/api/convert", { method: "POST", body }, signal);
}
export const task = (c: Connection, id: string, signal?: AbortSignal) =>
  call<RemoteTask>(c, `/api/tasks/${encodeURIComponent(id)}`, {}, signal);
export const deleteTask = (c: Connection, id: string) =>
  call(c, `/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
    (error) => {
      if (error instanceof ApiError && error.status === 404) return;
      throw error;
    },
  );
export const deleteVoice = (c: Connection, id: string) =>
  call(c, `/api/voices/${encodeURIComponent(id)}`, { method: "DELETE" });
export async function previewVoice(c: Connection, id: string) {
  if (!FS.cacheDirectory) throw new Error("当前设备无法访问音频缓存。");
  const result = await FS.downloadAsync(
    server(c) + `/api/voices/${encodeURIComponent(id)}/audio`,
    FS.cacheDirectory + "voice-" + encodeURIComponent(id) + ".wav",
    { headers: headers(c) },
  );
  if (result.status !== 200) throw new Error("参考录音试听下载失败。");
  return result.uri;
}
export async function addVoice(
  c: Connection,
  file: { uri: string; name: string; mime: string },
  name: string,
  category: string,
) {
  const body = new FormData();
  body.append("reference", {
    uri: file.uri,
    name: file.name,
    type: file.mime,
  } as unknown as Blob);
  body.append("name", name);
  body.append("category", category);
  body.append("authorized", "true");
  return call<Voice>(c, "/api/voices", { method: "POST", body });
}
export async function download(
  c: Connection,
  id: string,
  entryId: string,
  format: Format,
  signal?: AbortSignal,
) {
  const uri = ROOT + entryId + "-converted." + format;
  const operation = FS.createDownloadResumable(
    server(c) + `/api/tasks/${encodeURIComponent(id)}/audio`,
    uri,
    { headers: headers(c) },
  );
  const cancel = () => {
    void operation.pauseAsync().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const result = await operation.downloadAsync();
    if (signal?.aborted)
      throw Object.assign(new Error("已取消下载"), { name: "AbortError" });
    if (!result || result.status !== 200)
      throw new Error("结果下载失败，请稍后从历史记录重试。");
    return result.uri;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
