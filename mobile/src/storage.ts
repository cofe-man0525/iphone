import * as FS from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  Entry,
  Settings,
  ownedFile,
  storedFilename,
  restorePath,
} from "./domain";
export const ROOT = (FS.documentDirectory || "") + "aivoice/";
const manifest = ROOT + "library.json";
const backup = ROOT + "library.backup.json";
let queue = Promise.resolve();
export const defaults: Settings = { url: "", format: "m4a", theme: "system" };
export async function initialize() {
  if (Platform.OS === "web")
    return { entries: [] as Entry[], settings: defaults, token: "" }; // Layout QA only, not an H5 product.
  if (!FS.documentDirectory) throw new Error("需要原生应用的文件系统。");
  await FS.makeDirectoryAsync(ROOT, { intermediates: true });
  let data: { entries: Entry[]; settings: Settings } = {
    entries: [],
    settings: defaults,
  };
  let found = false,
    existing = false;
  for (const uri of [manifest, backup]) {
    try {
      if ((await FS.getInfoAsync(uri)).exists) existing = true;
      const parsed = JSON.parse(await FS.readAsStringAsync(uri));
      if (parsed.version !== 1 || !Array.isArray(parsed.entries))
        throw new Error();
      data = {
        entries: parsed.entries.map((entry: Entry) => ({
          ...entry,
          sourceUri: restorePath(entry.sourceUri, ROOT),
          outputUri: entry.outputUri
            ? restorePath(entry.outputUri, ROOT)
            : undefined,
        })),
        settings: { ...defaults, ...parsed.settings },
      };
      found = true;
      break;
    } catch {}
  }
  if (existing && !found)
    throw new Error(
      "历史索引及备份无法读取，已保留原文件，请先备份应用文稿目录。",
    );
  // An interrupted upload may have no server task; keep its original recording for retry.
  data.entries = data.entries.map((e) =>
    e.status === "UPLOADING" || e.status === "DOWNLOADING"
      ? {
          ...e,
          status: "FAILED",
          error: "上次操作被中断，原声仍在，可以重试。",
        }
      : e,
  );
  const token = (await SecureStore.getItemAsync("aivoice-token")) || "";
  return { ...data, token };
}
export function persist(entries: Entry[], settings: Settings) {
  const saved = entries.map((entry) => ({
    ...entry,
    sourceUri: storedFilename(entry.sourceUri),
    outputUri: entry.outputUri ? storedFilename(entry.outputUri) : undefined,
  }));
  const content = JSON.stringify({ version: 1, entries: saved, settings });
  queue = queue
    .catch(() => {})
    .then(async () => {
      const tmp = ROOT + "library.next.json";
      await FS.writeAsStringAsync(tmp, content);
      if ((await FS.getInfoAsync(manifest)).exists)
        await FS.copyAsync({ from: manifest, to: backup });
      await FS.deleteAsync(manifest, { idempotent: true });
      await FS.moveAsync({ from: tmp, to: manifest });
      // Backup reflects the committed state so deleted entries cannot reappear.
      await FS.copyAsync({ from: manifest, to: backup });
    });
  return queue;
}
export async function saveToken(token: string) {
  if (token)
    await SecureStore.setItemAsync("aivoice-token", token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync("aivoice-token");
}
export async function copySource(uri: string, id: string, extension = "m4a") {
  const target =
    ROOT + id + "-original." + extension.replace(/[^a-z0-9]/gi, "");
  await FS.copyAsync({ from: uri, to: target });
  return target;
}
export async function removeFiles(entry: Entry) {
  for (const uri of [
    entry.sourceUri,
    entry.outputUri,
    ROOT + entry.id + "-converted.m4a",
    ROOT + entry.id + "-converted.wav",
  ])
    if (uri && ownedFile(uri, ROOT))
      await FS.deleteAsync(uri, { idempotent: true });
}
