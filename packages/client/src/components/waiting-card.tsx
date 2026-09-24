import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Bouncy } from "./bouncy.tsx";
import { cardShadow, colours, fonts, radius } from "./theme.ts";

const EMOJIS = ["✨", "📚", "🦄", "🎭", "🪄", "🐉"] as const;
const DOT_COLOURS = [colours.primary, colours.sun, colours.go] as const;

/** "Please wait" that's actually fun to look at. */
export function WaitingCard({ message, compact = false }: { readonly message: string; readonly compact?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1800);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const emoji = EMOJIS[tick % EMOJIS.length] ?? "✨";

  return (
    <View style={[styles.card, compact && styles.compact]} accessibilityLiveRegion="polite">
      <Bouncy height={compact ? 10 : 22} periodMs={800}>
        <Text style={[styles.emoji, compact && styles.compactEmoji]}>{emoji}</Text>
      </Bouncy>
      <Text style={[styles.message, compact && styles.compactMessage]}>{message}</Text>
      <View style={styles.dots}>
        {DOT_COLOURS.map((colour, i) => (
          <Bouncy key={colour} height={8} delayMs={i * 150} periodMs={700}>
            <View style={[styles.dot, { backgroundColor: colour }]} />
          </Bouncy>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colours.card,
    borderRadius: radius.card,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 16,
    ...cardShadow,
  },
  compact: { paddingVertical: 24, gap: 10 },
  emoji: { fontSize: 88, lineHeight: 104 },
  compactEmoji: { fontSize: 56, lineHeight: 68 },
  message: { fontFamily: fonts.heading, fontSize: 30, fontWeight: "800", color: colours.ink, textAlign: "center" },
  compactMessage: { fontSize: 24 },
  dots: { flexDirection: "row", gap: 12, height: 28, alignItems: "flex-end" },
  dot: { width: 16, height: 16, borderRadius: 8 },
});
