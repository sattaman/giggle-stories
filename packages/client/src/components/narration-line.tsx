import type { NarrationKey } from "@storytime/domain";
import { useIsFocused } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { currentClip, narrationClipKey } from "../story/clip-sequence.ts";
import { useNarration, useNarrationLine } from "../story/narration.tsx";
import { colours, radius, TOUCH } from "./theme.ts";

/**
 * A screen's narrator line: said once when the screen appears (if the browser
 * lets us), plus a small 🔊 button to hear it again, since browsers may block
 * the first try. Renders nothing when there's no narration or it's muted.
 */
export function NarrationLine({ line }: { readonly line: NarrationKey }) {
  useNarrationLine(line, useIsFocused());
  return <NarrationReplay line={line} />;
}

/** Just the 🔊 button, for lines that play on their own schedule. */
export function NarrationReplay({ line }: { readonly line: NarrationKey }) {
  const narration = useNarration();
  if (!narration.has(line)) return null;
  const speaking = currentClip(narration.state)?.key === narrationClipKey(line);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hear the storyteller"
      onPress={() => {
        narration.say(line);
      }}
      style={({ pressed }) => [styles.button, speaking && styles.speaking, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.icon}>{speaking ? "🔊" : "🔈"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.pill,
    backgroundColor: colours.soft,
    borderWidth: 3,
    borderColor: colours.softDark,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    cursor: "pointer",
  },
  speaking: { borderColor: colours.primary, backgroundColor: colours.card },
  icon: { fontSize: 30, lineHeight: 36 },
});
