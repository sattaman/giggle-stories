import { StyleSheet, Text, View } from "react-native";
import { colours, fonts, radius } from "./theme.ts";

export function ReconnectingNote() {
  return (
    <View style={styles.pill} accessibilityLiveRegion="polite">
      <Text style={styles.text}>📡 Reconnecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "center",
    backgroundColor: colours.soft,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: { fontFamily: fonts.body, fontSize: 16, fontWeight: "700", color: colours.inkSoft },
});
