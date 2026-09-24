import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import type { CastMember } from "../story/cast.ts";
import { cardShadow, colours, fonts, radius } from "./theme.ts";

/** The line being spoken right now, big and bold. `text` null means "waiting for it". */
export function SpeechBubble({ speaker, text, lineKey }: { readonly speaker: CastMember; readonly text: string | null; readonly lineKey: string }) {
  const pop = useSharedValue(0.9);
  useEffect(() => {
    pop.set(0.9);
    pop.set(withSpring(1, { damping: 10, stiffness: 200 }));
  }, [lineKey, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <Animated.View style={[styles.bubble, { borderColor: speaker.colour }, popStyle]} accessibilityLiveRegion="polite">
      <View style={[styles.tag, { backgroundColor: speaker.colour }]}>
        <Text style={styles.tagText}>
          {speaker.emoji} {speaker.name}
        </Text>
      </View>
      <Text style={[styles.line, text === null && styles.waiting]}>{text ?? "…"}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: colours.card,
    borderRadius: radius.card,
    borderWidth: 5,
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 28,
    minHeight: 160,
    justifyContent: "center",
    marginTop: 18,
    ...cardShadow,
  },
  tag: { position: "absolute", top: -20, left: 24, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  tagText: { fontFamily: fonts.heading, fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  line: { fontFamily: fonts.body, fontSize: 32, lineHeight: 44, fontWeight: "700", color: colours.ink, textAlign: "center" },
  waiting: { fontSize: 56, color: colours.inkSoft },
});
