import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import * as Sharing from "expo-sharing";
import {
  Entry,
  Settings,
  Voice,
  active,
  mergeEntry,
  placeholders,
} from "./domain";
import * as storage from "./storage";
import * as api from "./api";

type Studio = {
  ready: boolean;
  error: string;
  clearError: () => void;
  entries: Entry[];
  settings: Settings;
  token: string;
  voice: Voice | null;
  voiceList: Voice[];
  selectVoice: (voice: Voice) => void;
  refreshVoices: () => Promise<void>;
  saveSettings: (settings: Settings, token: string) => Promise<void>;
  saveRecording: (uri: string, duration: number) => Promise<Entry>;
  convert: (entry: Entry) => Promise<void>;
  cancel: (entry: Entry) => Promise<void>;
  remove: (entry: Entry) => Promise<void>;
  clear: () => Promise<void>;
  share: (entry: Entry, original?: boolean) => Promise<void>;
  connection: api.Connection;
  player: ReturnType<typeof useAudioPlayer>;
  playStatus: ReturnType<typeof useAudioPlayerStatus>;
  playingUri: string | null;
  play: (uri: string) => Promise<void>;
};
const Context = createContext<Studio | null>(null);
export const useStudio = () => {
  const value = useContext(Context);
  if (!value) throw new Error("Studio provider missing");
  return value;
};
export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]),
    [settings, setSettings] = useState(storage.defaults),
    [token, setToken] = useState(""),
    [voice, setVoice] = useState<Voice | null>(null),
    [voiceList, setVoiceList] = useState<Voice[]>(placeholders),
    [playingUri, setPlayingUri] = useState<string | null>(null);
  const current = useRef<Entry[]>([]),
    preferences = useRef(settings),
    pending = useRef(new Map<string, AbortController>()),
    connectionRef = useRef<api.Connection>({ settings, token });
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const playStatus = useAudioPlayerStatus(player);
  const connection = { settings, token };
  connectionRef.current = connection;
  function report(e: unknown) {
    setError(e instanceof Error ? e.message : "操作未完成，请重试。");
  }
  async function commit(next: Entry[]) {
    current.current = next;
    setEntries(next);
    await storage.persist(next, preferences.current);
  }
  async function update(entry: Entry) {
    await commit(mergeEntry(current.current, entry));
  }
  useEffect(() => {
    storage
      .initialize()
      .then((data) => {
        current.current = data.entries;
        preferences.current = data.settings;
        setEntries(data.entries);
        setSettings(data.settings);
        setToken(data.token);
        setReady(true);
      })
      .catch(report);
    return () => {
      for (const abort of pending.current.values()) abort.abort();
    };
  }, []);
  useEffect(() => {
    if (ready && settings.url) void refreshVoices().catch(report);
  }, [ready, settings.url, token]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => sub.remove();
  }, [player]);
  // Resume real persisted server tasks after an application restart.
  useEffect(() => {
    if (ready && settings.url)
      for (const e of current.current)
        if (e.taskId && active(e.status) && !pending.current.has(e.id))
          void follow(e).catch(report);
  }, [ready, settings.url]);
  async function refreshVoices() {
    const list = await api.voices(connectionRef.current);
    setVoiceList(list);
    setVoice((old) =>
      old ? list.find((v) => v.id === old.id && v.available) || null : null,
    );
  }
  async function saveSettings(next: Settings, key: string) {
    await storage.saveToken(key);
    await storage.persist(current.current, next);
    preferences.current = next;
    setSettings(next);
    setToken(key);
  }
  async function saveRecording(uri: string, duration: number) {
    const id =
      String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
    const sourceUri = await storage.copySource(uri, id);
    const entry: Entry = {
      id,
      name: "录音 " + new Date().toLocaleString("zh-CN", { hour12: false }),
      created: new Date().toISOString(),
      sourceUri,
      sourceMime: "audio/mp4",
      duration,
      format: preferences.current.format,
      status: "RECORDED",
    };
    await update(entry);
    return entry;
  }
  async function follow(entry: Entry, existing?: AbortController) {
    const controller = existing || new AbortController();
    pending.current.set(entry.id, controller);
    let latest = entry;
    const c = connectionRef.current;
    const deadline = Date.now() + 15 * 60 * 1000;
    try {
      while (!controller.signal.aborted) {
        if (Date.now() > deadline)
          throw new Error("等待模型超时。原声已保留，可在历史记录中重试。");
        const result = await api.task(c, entry.taskId!, controller.signal);
        if (result.status === "FAILED")
          throw new Error(result.error || "AI转换失败。");
        if (result.status === "CANCELLED")
          throw Object.assign(new Error("任务已取消"), { name: "AbortError" });
        if (latest.status !== result.status) {
          latest = { ...latest, status: result.status };
          await update(latest);
        }
        if (result.status === "SUCCEEDED") {
          latest = { ...latest, status: "DOWNLOADING" };
          await update(latest);
          const outputUri = await api.download(
            c,
            result.id,
            entry.id,
            result.format,
            controller.signal,
          );
          await update({
            ...latest,
            status: "SUCCEEDED",
            outputUri,
            format: result.format,
            error: undefined,
          });
          return;
        }
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, 1500);
          controller.signal.addEventListener("abort", done, { once: true });
        });
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        await update({
          ...latest,
          status: "FAILED",
          error: e instanceof Error ? e.message : "转换失败",
        });
        throw e;
      }
    } finally {
      pending.current.delete(entry.id);
    }
  }
  async function convert(entry: Entry) {
    if (!voice?.available)
      throw new Error("请先在音色库导入并选择授权参考音色。");
    if (pending.current.has(entry.id)) return;
    // Keep previous conversions and their original files independently accessible.
    if (entry.taskId || entry.outputUri) {
      const id =
        String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
      entry = {
        ...entry,
        id,
        created: new Date().toISOString(),
        sourceUri: await storage.copySource(entry.sourceUri, id),
        taskId: undefined,
        outputUri: undefined,
        status: "RECORDED",
      };
    }
    player.pause();
    const controller = new AbortController();
    pending.current.set(entry.id, controller);
    let next: Entry = {
      ...entry,
      voiceId: voice.id,
      voiceName: voice.name,
      status: "UPLOADING",
      format: settings.format,
      error: undefined,
    };
    await update(next);
    try {
      const result = await api.submit(
        connectionRef.current,
        entry,
        voice.id,
        settings.format,
        controller.signal,
      );
      next = { ...next, taskId: result.id, status: result.status };
      await update(next);
      await follow(next, controller);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        await update({
          ...next,
          status: "FAILED",
          error: e instanceof Error ? e.message : "上传失败",
        });
        throw e;
      }
    } finally {
      pending.current.delete(entry.id);
    }
  }
  async function cancel(entry: Entry) {
    pending.current.get(entry.id)?.abort();
    try {
      if (entry.taskId)
        await api.deleteTask(connectionRef.current, entry.taskId);
      await update({
        ...entry,
        status: "CANCELLED",
        taskId: undefined,
        error: undefined,
      });
    } catch (error) {
      await update({
        ...entry,
        status: "CANCELLED",
        error: "本机已停止等待，服务器任务未能删除；可稍后重试删除。",
      });
      throw error;
    }
  }
  async function remove(entry: Entry) {
    if (active(entry.status)) throw new Error("请先取消正在处理的任务。");
    player.pause();
    let remoteError = false;
    try {
      if (entry.taskId)
        await api.deleteTask(connectionRef.current, entry.taskId);
    } catch {
      remoteError = true;
    }
    await commit(current.current.filter((e) => e.id !== entry.id));
    await storage.removeFiles(entry);
    if (remoteError)
      setError(
        "本机记录已删除，服务器暂时无法连接；远端文件会按服务器保留策略清理。",
      );
  }
  async function clear() {
    if (current.current.some((e) => active(e.status)))
      throw new Error("请先结束正在处理的任务。");
    for (const entry of [...current.current]) await remove(entry);
  }
  async function share(entry: Entry, original = false) {
    player.pause();
    const uri = original ? entry.sourceUri : entry.outputUri;
    if (!uri) throw new Error("还没有可分享的音频。");
    if (!(await Sharing.isAvailableAsync()))
      throw new Error("设备暂不支持系统文件分享。");
    const wav = !original && entry.format === "wav";
    await Sharing.shareAsync(uri, {
      mimeType: wav ? "audio/wav" : "audio/mp4",
      UTI: wav ? "com.microsoft.waveform-audio" : "public.mpeg-4-audio",
      dialogTitle: "保存到文件或分享音频",
    });
  }
  async function play(uri: string) {
    if (playingUri === uri && playStatus.playing) {
      player.pause();
      return;
    }
    player.pause();
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
    if (playingUri !== uri) {
      player.replace(uri);
      setPlayingUri(uri);
    } else if (playStatus.didJustFinish) await player.seekTo(0);
    player.play();
  }
  return (
    <Context.Provider
      value={{
        ready,
        error,
        clearError: () => setError(""),
        entries,
        settings,
        token,
        voice,
        voiceList,
        selectVoice: setVoice,
        refreshVoices,
        saveSettings,
        saveRecording,
        convert,
        cancel,
        remove,
        clear,
        share,
        connection,
        player,
        playStatus,
        playingUri,
        play,
      }}
    >
      {children}
    </Context.Provider>
  );
}
