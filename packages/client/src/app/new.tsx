import { DEFAULT_AGE_BAND, StartStoryBody, type AgeBand } from "@storytime/domain";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useStoryApi } from "../api/api-context.tsx";
import { AgePicker } from "../components/age-picker.tsx";
import { BigButton } from "../components/big-button.tsx";
import { NarrationLine } from "../components/narration-line.tsx";
import { Screen } from "../components/screen.tsx";
import { SpeechInput } from "../components/speech-input.tsx";
import { text } from "../components/text-styles.ts";

/** A long, rambling idea is fine: allow everything the server accepts. */
const IDEA_MAX_LENGTH = StartStoryBody.shape.idea.maxLength ?? 2000;

export default function IdeaScreen() {
  const api = useStoryApi();
  const router = useRouter();
  const [ageBand, setAgeBand] = useState<AgeBand>(DEFAULT_AGE_BAND);

  async function startStory(idea: string): Promise<boolean> {
    try {
      const view = await api.start(idea, ageBand);
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
        <NarrationLine line="idea" />
        <Text style={text.body}>Who's in it? Where are they? What silly thing happens?</Text>
      </View>
      <AgePicker value={ageBand} onChange={setAgeBand} />
      <SpeechInput submitLabel="Yes, go!" placeholder="A dragon who is scared of sandwiches…" onSubmit={startStory} maxLength={IDEA_MAX_LENGTH} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start" },
  header: { gap: 12 },
});
