import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { BigButton } from "../components/big-button.tsx";
import { Bouncy } from "../components/bouncy.tsx";
import { NarrationLine } from "../components/narration-line.tsx";
import { Screen } from "../components/screen.tsx";
import { text } from "../components/text-styles.ts";
import { colours, fonts } from "../components/theme.ts";

export default function HomeScreen() {
  const router = useRouter();
  return (
    <Screen centred>
      <View style={styles.hero}>
        <View style={styles.emojis}>
          {["🐉", "📚", "🦄"].map((emoji, i) => (
            <Bouncy key={emoji} height={18} delayMs={i * 200} periodMs={1000}>
              <Text style={styles.emoji}>{emoji}</Text>
            </Bouncy>
          ))}
        </View>
        <Text style={styles.title}>Storytime</Text>
        <NarrationLine line="welcome" />
        <Text style={text.body}>Tell me an idea and I'll turn it into a funny story, with voices!</Text>
        <BigButton size="huge" label="Make a story ✨" onPress={() => {
          router.push("/new");
        }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 28 },
  emojis: { flexDirection: "row", gap: 20 },
  emoji: { fontSize: 72, lineHeight: 88 },
  title: { fontFamily: fonts.heading, fontSize: 72, fontWeight: "900", color: colours.primary, textAlign: "center" },
});
