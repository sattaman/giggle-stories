import type { Character, Performance } from "@storytime/domain";
import { StyleSheet, Text, View } from "react-native";
import { castOf, memberFor } from "../story/cast.ts";
import { displayText } from "../story/lines.ts";
import { currentIndex } from "../story/playback.ts";
import { usePlayback } from "../story/use-playback.ts";
import { BigButton } from "./big-button.tsx";
import { Bouncy } from "./bouncy.tsx";
import { CastRow } from "./cast-row.tsx";
import { SpeechBubble } from "./speech-bubble.tsx";
import { text } from "./text-styles.ts";
import { colours, fonts } from "./theme.ts";

export interface PerformanceViewProps {
  readonly performance: Performance;
  readonly characters: readonly Character[];
  readonly title: string | null;
  readonly onAnotherStory: () => void;
}

/** The story page: plays each line in order, lighting up whoever is speaking. */
export function PerformanceView({ performance, characters, title, onAnotherStory }: PerformanceViewProps) {
  const playback = usePlayback(performance);
  const { state, segments } = playback;
  const cast = castOf(characters, true);
  const index = currentIndex(state);
  const current = index === null ? undefined : segments[index];
  const speakingId = state.phase === "playing" && current !== undefined ? current.speaker : null;
  const heard = segments.slice(0, index ?? (state.phase === "finished" ? segments.length : 0)).reverse();

  return (
    <View style={styles.stack}>
      {title !== null && <Text style={text.heading}>{title}</Text>}
      <CastRow cast={cast} speakingId={speakingId} compact />

      {state.phase === "ready" && (
        <View style={styles.center}>
          <Bouncy height={10}>
            <BigButton variant="go" size="huge" label="▶ Start the story!" onPress={playback.start} />
          </Bouncy>
          {segments.every((s) => s.audioUrl === null) && <Text style={text.body}>The voices are still warming up — it'll start as soon as they're ready.</Text>}
        </View>
      )}

      {current !== undefined && (
        <SpeechBubble
          speaker={memberFor(cast, current.speaker)}
          text={state.phase === "waiting" ? null : displayText(current.text)}
          lineKey={`${String(current.index)}:${"run" in state ? String(state.run) : "0"}`}
        />
      )}
      {current === undefined && state.phase === "waiting" && (
        <SpeechBubble speaker={memberFor(cast, "narrator")} text={null} lineKey="waiting" />
      )}

      {(state.phase === "playing" || state.phase === "waiting" || state.phase === "paused") && (
        <View style={styles.controls}>
          {state.phase === "paused" ? (
            <BigButton variant="go" label="▶ Keep going" onPress={playback.resume} />
          ) : (
            <BigButton variant="soft" label="⏸ Pause" onPress={playback.pause} />
          )}
          <BigButton variant="soft" label="⏮ Start again" onPress={playback.start} />
        </View>
      )}

      {state.phase === "finished" && (
        <View style={styles.center}>
          <Bouncy height={14}>
            <Text style={styles.theEnd}>The End… of page 1! 😂</Text>
          </Bouncy>
          <Text style={text.heading}>Did you laugh?</Text>
          <View style={styles.controls}>
            <BigButton variant="primary" size="huge" label="Make another story ✨" onPress={onAnotherStory} />
            <BigButton variant="soft" label="🔁 Hear it again" onPress={playback.start} />
          </View>
        </View>
      )}

      {heard.length > 0 && (
        <View style={styles.transcript}>
          {heard.map((segment) => {
            const speaker = memberFor(cast, segment.speaker);
            return (
              <Text key={segment.index} style={styles.pastLine}>
                <Text style={[styles.pastSpeaker, { color: speaker.colour }]}>
                  {speaker.emoji} {speaker.name}:{" "}
                </Text>
                {displayText(segment.text)}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 24 },
  center: { alignItems: "center", gap: 16 },
  controls: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16 },
  theEnd: { fontFamily: fonts.heading, fontSize: 40, fontWeight: "900", color: colours.primary, textAlign: "center" },
  transcript: { gap: 10, opacity: 0.6, paddingHorizontal: 8 },
  pastLine: { fontFamily: fonts.body, fontSize: 20, lineHeight: 28, color: colours.ink },
  pastSpeaker: { fontWeight: "800" },
});
