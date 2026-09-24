import { StyleSheet, Text, View } from "react-native";
import { BigButton } from "./big-button.tsx";
import { text } from "./text-styles.ts";
import { cardShadow, colours, radius } from "./theme.ts";

/** A friendly dead end with a way out. Technical details stay out of sight. */
export function OopsCard({ title, message, onRetry }: { readonly title: string; readonly message: string; readonly onRetry: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>🙈</Text>
      <Text style={text.heading}>{title}</Text>
      <Text style={text.body}>{message}</Text>
      <BigButton variant="primary" size="huge" label="Try again" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colours.card,
    borderRadius: radius.card,
    padding: 32,
    alignItems: "center",
    gap: 16,
    ...cardShadow,
  },
  emoji: { fontSize: 80, lineHeight: 96 },
});
