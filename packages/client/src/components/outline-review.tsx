import type { Character, Outline } from "@storytime/domain";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useClipPlayer } from "../audio/use-clip-player.ts";
import { castOf } from "../story/cast.ts";
import { BigButton } from "./big-button.tsx";
import { CastRow } from "./cast-row.tsx";
import { SpeechInput } from "./speech-input.tsx";
import { text } from "./text-styles.ts";
import { cardShadow, colours, fonts, radius } from "./theme.ts";

const BEAT_COLOURS = ["#FFB020", "#FF6B8B", "#7B5CFF", "#22B07D", "#2FA8F5", "#FF7A45"] as const;

export interface OutlineReviewProps {
  readonly outline: Outline;
  readonly characters: readonly Character[];
  readonly onApprove: () => Promise<boolean>;
  readonly onChange: (feedback: string) => Promise<boolean>;
}

/** "Here's my plan!": the six beats and the cast, for a thumbs up or a change. */
export function OutlineReview({ outline, characters, onApprove, onChange }: OutlineReviewProps) {
  const clips = useClipPlayer();
  const [changing, setChanging] = useState(false);
  const [approving, setApproving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function approve(): Promise<void> {
    setApproving(true);
    setFailed(false);
    const ok = await onApprove();
    setApproving(false);
    setFailed(!ok);
  }

  return (
    <View style={styles.stack}>
      <Text style={text.body}>Here's my plan for…</Text>
      <Text style={text.title}>{outline.storyTitle}</Text>

      <View style={styles.beats}>
        {outline.pages.map((page, i) => (
          <View key={page.page} style={styles.beat}>
            <View style={[styles.number, { backgroundColor: BEAT_COLOURS[i % BEAT_COLOURS.length] }]}>
              <Text style={styles.numberText}>{page.page}</Text>
            </View>
            <View style={styles.beatText}>
              <Text style={styles.beatLine}>{page.beat}</Text>
              {page.funnyMoment !== "" && <Text style={styles.funny}>😂 {page.funnyMoment}</Text>}
            </View>
          </View>
        ))}
      </View>

      {characters.length > 0 && (
        <>
          <Text style={text.heading}>Meet the characters!</Text>
          <CastRow cast={castOf(characters, false)} clips={clips} />
        </>
      )}

      {changing ? (
        <View style={styles.change}>
          <Text style={text.heading}>What should I change?</Text>
          <SpeechInput submitLabel="Change it!" placeholder="e.g. Make the frog a pirate too" onSubmit={onChange} onListen={clips.stop} />
          <BigButton
            variant="ghost"
            size="small"
            label="Never mind, it's perfect"
            onPress={() => {
              setChanging(false);
            }}
            style={styles.center}
          />
        </View>
      ) : (
        <View style={styles.buttons}>
          {failed && <Text style={text.problem}>Oops, that didn't send. Try again!</Text>}
          <BigButton variant="go" size="huge" label={approving ? "Here we go…" : "Yes! Make it! 🎉"} disabled={approving} onPress={() => void approve()} />
          <BigButton
            variant="soft"
            label="✏️ Change something"
            disabled={approving}
            onPress={() => {
              clips.stop();
              setChanging(true);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  beats: { gap: 14 },
  beat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: colours.card,
    borderRadius: radius.card,
    padding: 18,
    ...cardShadow,
  },
  number: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  numberText: { fontFamily: fonts.heading, fontSize: 28, fontWeight: "900", color: "#FFFFFF" },
  beatText: { flex: 1, gap: 6 },
  beatLine: { fontFamily: fonts.body, fontSize: 22, lineHeight: 30, fontWeight: "700", color: colours.ink },
  funny: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, fontStyle: "italic", color: colours.inkSoft },
  change: { gap: 16, marginTop: 8 },
  buttons: { alignItems: "center", gap: 16, marginTop: 8 },
  center: { alignSelf: "center" },
});
