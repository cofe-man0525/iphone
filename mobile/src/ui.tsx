import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle, Rect, Line } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { clock } from "./domain";
import { useStudio } from "./StudioContext";
const palettes = {
  light: {
    bg: "#F6F5F8",
    card: "#FFFFFF",
    text: "#23202B",
    muted: "#696271",
    line: "#E6E1EB",
    accent: "#6750A4",
    soft: "#EEE7F8",
    onAccent: "#FFFFFF",
    red: "#B63149",
    success: "#24664D",
  },
  dark: {
    bg: "#131217",
    card: "#211F27",
    text: "#F4F0F8",
    muted: "#BDB5C8",
    line: "#39343F",
    accent: "#C8B1F5",
    soft: "#352B46",
    onAccent: "#2A1D3D",
    red: "#FF9DAA",
    success: "#A6DABD",
  },
};
export function useColors() {
  const { settings } = useStudio();
  const system = useColorScheme();
  return palettes[
    settings.theme === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : settings.theme
  ];
}
export function Icon({
  name,
  color = "#6750A4",
  size = 24,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const props = {
    stroke: color,
    strokeWidth: 1.8,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <>
        {name === "mic" ? (
          <>
            <Rect x="9" y="3" width="6" height="11" rx="3" {...props} />
            <Path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M8 21h8" {...props} />
          </>
        ) : name === "library" ? (
          <>
            <Rect x="4" y="4" width="6" height="7" rx="2" {...props} />
            <Rect x="14" y="4" width="6" height="7" rx="2" {...props} />
            <Rect x="4" y="15" width="6" height="5" rx="2" {...props} />
            <Rect x="14" y="15" width="6" height="5" rx="2" {...props} />
          </>
        ) : name === "history" ? (
          <>
            <Path d="M4 7a9 9 0 1 1-1 8M4 3v5h5M12 7v5l3 2" {...props} />
          </>
        ) : name === "settings" ? (
          <>
            <Circle cx="12" cy="12" r="8" {...props} />
            <Circle cx="12" cy="12" r="3" {...props} />
            <Path d="M12 2v2M12 20v2M2 12h2M20 12h2" {...props} />
          </>
        ) : name === "play" ? (
          <Path d="m9 5 11 7-11 7Z" fill={color} />
        ) : name === "pause" ? (
          <>
            <Rect x="6" y="5" width="4" height="14" rx="1" fill={color} />
            <Rect x="14" y="5" width="4" height="14" rx="1" fill={color} />
          </>
        ) : name === "stop" ? (
          <Rect x="5" y="5" width="14" height="14" rx="3" fill={color} />
        ) : name === "plus" ? (
          <Path d="M12 4v16M4 12h16" {...props} />
        ) : name === "check" ? (
          <Path d="m5 12 4 4L19 6" {...props} />
        ) : name === "share" ? (
          <>
            <Path d="M12 15V2m-4 4 4-4 4 4M5 10H3v11h18V10h-2" {...props} />
          </>
        ) : name === "trash" ? (
          <>
            <Path
              d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v6M14 10v6"
              {...props}
            />
          </>
        ) : name === "arrow" ? (
          <Path d="m9 5 7 7-7 7" {...props} />
        ) : name === "close" ? (
          <Path d="m6 6 12 12M18 6 6 18" {...props} />
        ) : (
          <>
            <Line x1="4" y1="9" x2="4" y2="15" {...props} />
            <Line x1="8" y1="5" x2="8" y2="19" {...props} />
            <Line x1="12" y1="2" x2="12" y2="22" {...props} />
            <Line x1="16" y1="7" x2="16" y2="17" {...props} />
            <Line x1="20" y1="10" x2="20" y2="14" {...props} />
          </>
        )}
      </>
    </Svg>
  );
}
export function Copy({
  children,
  muted = false,
  style,
  ...props
}: TextProps & { children: React.ReactNode; muted?: boolean }) {
  const c = useColors();
  return (
    <Text
      {...props}
      style={[
        { color: muted ? c.muted : c.text, fontSize: 15, lineHeight: 23 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        padding: 14,
        borderRadius: 16,
        backgroundColor: secondary ? c.soft : c.accent,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        flexDirection: "row",
        gap: 9,
        justifyContent: "center",
        alignItems: "center",
      })}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? c.accent : c.onAccent} />
      ) : (
        icon && (
          <Icon
            name={icon}
            color={secondary ? c.accent : c.onAccent}
            size={20}
          />
        )
      )}
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          color: secondary ? c.accent : c.onAccent,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: c.line,
        gap: 14,
      }}
    >
      {children}
    </View>
  );
}
export function Page({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const c = useColors();
  const { error, clearError, ready } = useStudio();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 36,
          gap: 24,
          width: "100%",
          maxWidth: 650,
          alignSelf: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 30,
                fontWeight: "700",
                lineHeight: 40,
                color: c.text,
              }}
            >
              {title}
            </Text>
            {subtitle && (
              <Copy muted style={{ fontSize: 14, marginTop: 5 }}>
                {subtitle}
              </Copy>
            )}
          </View>
          {action}
        </View>
        {error && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭错误提示"
            onPress={clearError}
            style={{ padding: 16, borderRadius: 16, backgroundColor: c.soft }}
          >
            <Text
              accessibilityRole="alert"
              style={{ color: c.red, lineHeight: 22 }}
            >
              {error}　×
            </Text>
          </Pressable>
        )}
        {!ready ? <ActivityIndicator color={c.accent} /> : children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Player({ uri, title }: { uri: string; title: string }) {
  const c = useColors();
  const { play, playingUri, playStatus, player } = useStudio();
  const current = playingUri === uri;
  const duration = current ? playStatus.duration : 0;
  const position = current ? playStatus.currentTime : 0;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            (current && playStatus.playing ? "暂停" : "播放") + title
          }
          onPress={() => void play(uri).catch((e) => alert(e.message))}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: c.soft,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Icon
            name={current && playStatus.playing ? "pause" : "play"}
            color={c.accent}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Copy style={{ fontWeight: "600" }}>{title}</Copy>
          <Copy muted style={{ fontSize: 12 }}>
            {current ? `${clock(position)} / ${clock(duration)}` : "轻点试听"}
          </Copy>
        </View>
      </View>
      <Slider
        accessibilityLabel={title + "播放进度"}
        minimumValue={0}
        maximumValue={duration || 1}
        value={position}
        disabled={!current || !duration}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.line}
        thumbTintColor={c.accent}
        onSlidingStart={() => player.pause()}
        onSlidingComplete={(value) => void player.seekTo(value)}
      />
    </View>
  );
}
