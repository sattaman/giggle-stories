import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StoryApiProvider } from "../api/api-context.tsx";
import { NarratorSwitch } from "../components/narrator-switch.tsx";
import { colours } from "../components/theme.ts";
import { NarrationProvider } from "../story/narration.tsx";

export default function RootLayout() {
  return (
    <StoryApiProvider>
      <NarrationProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colours.background }, title: "Storytime" }} />
        <NarratorSwitch />
      </NarrationProvider>
    </StoryApiProvider>
  );
}
