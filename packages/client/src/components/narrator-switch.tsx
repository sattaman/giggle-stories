import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNarration } from "../story/narration.tsx";
import { colours, fonts, radius } from "./theme.ts";

/** For grown-ups: a small corner switch that turns the storyteller's voice off (for this session). */
export function NarratorSwitch() {
  const narration = useNarration();
  const insets = useSafeAreaInsets();
  // Nothing to switch off.
  if (narration.loaded && narration.clips === null && !narration.muted) return null;
  const { muted } = narration;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: !muted }}
      accessibilityLabel="Storyteller voice"
      onPress={() => {
        narration.setMuted(!muted);
      }}
      style={({ pressed }) => [styles.switch, { top: insets.top + 12, right: insets.right + 12, opacity: pressed ? 0.6 : 0.85 }]}
    >
      <Text style={styles.label}>{muted ? "🔇 Storyteller off" : "🔈 Storyteller on"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: {
    position: "absolute",
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colours.card,
    borderWidth: 2,
    borderColor: colours.line,
    cursor: "pointer",
  },
  label: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colours.inkSoft },
});
