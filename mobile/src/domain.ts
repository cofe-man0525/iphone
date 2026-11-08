export type Format = "m4a" | "wav";
export type TaskStatus =
  | "RECORDED"
  | "UPLOADING"
  | "QUEUED"
  | "RUNNING"
  | "DOWNLOADING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";
export type Settings = {
  url: string;
  format: Format;
  theme: "system" | "light" | "dark";
};
export type Voice = {
  id: string;
  name: string;
  category: string;
  description: string;
  available: boolean;
  custom: boolean;
  previewUrl?: string;
};
export type Entry = {
  id: string;
  name: string;
  created: string;
  sourceUri: string;
  sourceMime: string;
  duration: number;
  voiceId?: string;
  voiceName?: string;
  taskId?: string;
  outputUri?: string;
  format: Format;
  status: TaskStatus;
  error?: string;
};
export type RemoteTask = {
  id: string;
  status: TaskStatus;
  voiceId: string;
  voiceName: string;
  format: Format;
  error?: string;
  duration?: number;
};
export const categories = [
  "甜美女声",
  "少女音",
  "温柔女声",
  "御姐音",
  "磁性男声",
  "少年音",
  "中性音",
  "自定义音色",
];
export const placeholders: Voice[] = categories
  .slice(0, 7)
  .map((category, index) => ({
    id: `category-${index}`,
    name: category,
    category,
    description: "导入授权参考录音后可用",
    available: false,
    custom: false,
  }));
export const statusText: Record<TaskStatus, string> = {
  RECORDED: "原声已保存",
  UPLOADING: "正在上传",
  QUEUED: "等待处理",
  RUNNING: "AI 变声中",
  DOWNLOADING: "正在下载",
  SUCCEEDED: "转换成功",
  FAILED: "转换失败",
  CANCELLED: "已取消",
};
export const active = (status: TaskStatus) =>
  ["UPLOADING", "QUEUED", "RUNNING", "DOWNLOADING"].includes(status);
export function normalizeUrl(value: string, development = false) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash)
    throw new Error("服务地址不能含账号、查询参数或片段。");
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      url.hostname,
    );
  if (
    url.protocol !== "https:" &&
    !(development && local && url.protocol === "http:")
  )
    throw new Error("请使用HTTPS服务地址；开发模式可连接局域网HTTP。");
  return url
    .toString()
    .replace(/\/+$/, "")
    .replace(/\/api$/, "");
}
export function mergeEntry(entries: Entry[], entry: Entry) {
  return [entry, ...entries.filter((e) => e.id !== entry.id)].sort((a, b) =>
    b.created.localeCompare(a.created),
  );
}
export function ownedFile(uri: string, root: string) {
  try {
    const decoded = decodeURIComponent(uri);
    return (
      decoded.startsWith(root) &&
      !decoded.slice(root.length).includes("/") &&
      !decoded.includes("..")
    );
  } catch {
    return false;
  }
}
export function storedFilename(uri: string) {
  const filename = uri.split("/").pop() || "";
  if (!/^[a-z0-9-]+-(original|converted)\.(m4a|wav)$/i.test(filename))
    throw new Error("历史音频路径无效，已停止读取。");
  return filename;
}
export function restorePath(stored: string, root: string) {
  return root + storedFilename(stored);
}
export const clock = (seconds: number) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
