import type { AgeBand } from "@storytime/domain";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colours, fonts, radius, TOUCH } from "./theme.ts";

const OPTIONS: readonly { readonly band: AgeBand; readonly label: string; readonly emoji: string }[] = [
  { band: "0-4", label: "0–4", emoji: "🧸" },
  { band: "5-8", label: "5–8", emoji: "🎈" },
  { band: "9-12", label: "9–12", emoji: "🚀" },
];

/** "Who's the story for?": big, tappable age choices. */
export function AgePicker({ value, onChange }: { readonly value: AgeBand; readonly onChange: (band: AgeBand) => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Who is the story for?">
      <Text style={styles.label}>Who's the story for?</Text>
      <View style={styles.row}>
        {OPTIONS.map((option) => {
          const selected = option.band === value;
          return (
            <Pressable
              key={option.band}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Ages ${option.label}`}
              onPress={() => {
                onChange(option.band);
              }}
              style={[styles.pill, selected && styles.selected]}
            >
              <Text style={[styles.pillText, selected && styles.selectedText]}>
                {option.emoji} {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, alignItems: "center" },
  label: { fontFamily: fonts.heading, fontSize: 20, fontWeight: "800", color: colours.ink },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 },
  pill: {
    minHeight: TOUCH,
    minWidth: 110,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colours.softDark,
    backgroundColor: colours.card,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colours.primary, borderColor: colours.primaryDark },
  pillText: { fontFamily: fonts.body, fontSize: 22, fontWeight: "800", color: colours.ink },
  selectedText: { color: "#FFFFFF" },
});
