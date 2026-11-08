import { Stack } from "expo-router";
import { StudioProvider } from "../src/StudioContext";
import { StatusBar } from "expo-status-bar";
export default function Layout() {
  return (
    <StudioProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </StudioProvider>
  );
}
