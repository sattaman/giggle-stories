import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useStoryApi } from "../api/api-context.tsx";
import { BigButton } from "../components/big-button.tsx";
import { Screen } from "../components/screen.tsx";
import { SpeechInput } from "../components/speech-input.tsx";
import { text } from "../components/text-styles.ts";

export default function IdeaScreen() {
  const api = useStoryApi();
  const router = useRouter();

  async function startStory(idea: string): Promise<boolean> {
    try {
      const view = await api.start(idea);
      router.replace({ pathname: "/story/[id]", params: { id: view.id } });
      return true;
    } catch {
      return false;
    }
  }

  return (
    <Screen>
      <BigButton variant="ghost" size="small" label="← Home" onPress={() => {
        router.replace("/");
      }} style={styles.back} />
      <View style={styles.header}>
        <Text style={text.title}>Tell me your story idea!</Text>
        <Text style={text.body}>Who's in it? Where are they? What silly thing happens?</Text>
      </View>
      <SpeechInput submitLabel="Yes, go!" placeholder="A dragon who is scared of sandwiches…" onSubmit={startStory} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start" },
  header: { gap: 12 },
});
