import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StoryApiProvider } from "../api/api-context.tsx";
import { colours } from "../components/theme.ts";

export default function RootLayout() {
  return (
    <StoryApiProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colours.background }, title: "Storytime" }} />
    </StoryApiProvider>
  );
}
