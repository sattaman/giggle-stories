import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useClipPlayer } from "../audio/use-clip-player.ts";
import { BigButton } from "./big-button.tsx";
import { Bouncy } from "./bouncy.tsx";
import { SpeechInput } from "./speech-input.tsx";
import { cardShadow, colours, fonts, radius } from "./theme.ts";

export interface ClarificationViewProps {
  readonly question: string;
  readonly audioUrl: string | null;
  readonly onAnswer: (answer: string) => Promise<boolean>;
  /** Files the spoken answer under this story. */
  readonly storyId: string;
}

/** One quick question from the storyteller, asked out loud when the browser lets us. */
export function ClarificationView({ question, audioUrl, onAnswer, storyId }: ClarificationViewProps) {
  const clips = useClipPlayer();
  const { play } = clips;

  // Try to ask it out loud straight away; browsers may block this, hence the button.
  useEffect(() => {
    if (audioUrl !== null) play(audioUrl);
    // Only when a new question arrives.
  }, [audioUrl]);

  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Bouncy height={10}>
          <Text style={styles.emoji}>🤔</Text>
        </Bouncy>
        <Text style={styles.question}>{question}</Text>
        {audioUrl !== null && (
          <BigButton
            variant="soft"
            size="small"
            label={clips.playingUrl === audioUrl ? "🔊 Listening…" : "🔊 Hear it"}
            onPress={() => {
              play(audioUrl);
            }}
          />
        )}
      </View>
      <SpeechInput submitLabel="That's my answer!" placeholder="Type your answer…" onSubmit={onAnswer} onListen={clips.stop} storyId={storyId} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 28 },
  card: {
    backgroundColor: colours.card,
    borderRadius: radius.card,
    padding: 28,
    alignItems: "center",
    gap: 16,
    ...cardShadow,
  },
  emoji: { fontSize: 72, lineHeight: 86 },
  question: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 44, fontWeight: "800", color: colours.ink, textAlign: "center" },
});
