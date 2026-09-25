import type { Character, Outline } from "@storytime/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { mayAutoplay } from "../audio/autoplay.ts";
import { castOf, memberFor } from "../story/cast.ts";
import { currentClip, helloClip, helloSpeaker, isVoiceIntroClip, voiceIntroClips } from "../story/clip-sequence.ts";
import { displayText } from "../story/lines.ts";
import { useNarration } from "../story/narration.tsx";
import { BigButton } from "./big-button.tsx";
import { Bouncy } from "./bouncy.tsx";
import { CastRow } from "./cast-row.tsx";
import { SpeechBubble } from "./speech-bubble.tsx";
import { SpeechInput } from "./speech-input.tsx";
import { text } from "./text-styles.ts";
import { cardShadow, colours, fonts, radius } from "./theme.ts";

const BEAT_COLOURS = ["#FFB020", "#FF6B8B", "#7B5CFF", "#22B07D", "#2FA8F5", "#FF7A45"] as const;

export interface OutlineReviewProps {
  readonly outline: Outline;
  readonly characters: readonly Character[];
  /** Play the voice introductions by themselves (when the browser allows sound). */
  readonly autoIntro: boolean;
  readonly onIntroStarted: () => void;
  readonly onApprove: () => Promise<boolean>;
  readonly onChange: (feedback: string) => Promise<boolean>;
}

/**
 * "Here's my plan!": the cast says hello one by one (the voice introductions),
 * then the six beats, for a thumbs up or a change.
 */
export function OutlineReview({ outline, characters, autoIntro, onIntroStarted, onApprove, onChange }: OutlineReviewProps) {
  const narration = useNarration();
  const { loaded, play, stop, stopWhere } = narration;
  const intro = useMemo(() => voiceIntroClips(characters, narration.clips), [characters, narration.clips]);
  const hasIntro = intro.some((clip) => clip.url !== null);
  const [introStarted, setIntroStarted] = useState(!autoIntro);
  const autoTried = useRef(false);

  function playIntro(): void {
    play(intro);
    setIntroStarted(true);
    onIntroStarted();
  }

  // Once the narrator's clips are in: introduce everyone, if the browser lets us
  // play sound without a tap. Otherwise the big "Meet your characters!" button does it.
  useEffect(() => {
    if (!autoIntro || !loaded || !hasIntro || autoTried.current) return;
    autoTried.current = true;
    if (mayAutoplay()) playIntro();
  });

  // Leaving the plan hushes the introductions (but not the next screen's line).
  useEffect(
    () => () => {
      stopWhere(isVoiceIntroClip);
    },
    [stopWhere],
  );

  const cast = castOf(characters, false);
  const clip = currentClip(narration.state);
  const speakerId = clip === null ? null : helloSpeaker(clip.key);
  const speaker = characters.find((c) => c.id === speakerId);
  const introPlaying = narration.state.phase === "playing" && narration.state.clips === intro;

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

      {characters.length > 0 && (
        <View style={styles.cast}>
          <Text style={text.heading}>Meet the characters!</Text>
          <CastRow
            cast={cast}
            speakingId={speaker === undefined ? null : speaker.id}
            onHearVoice={(member) => {
              const character = characters.find((c) => c.id === member.id);
              if (character !== undefined) play([helloClip(character)]);
            }}
          />
          {speaker !== undefined && clip !== null && (
            <SpeechBubble
              speaker={memberFor(cast, speaker.id)}
              text={displayText(speaker.hello)}
              lineKey={`${clip.key}:${String(narration.state.run)}`}
            />
          )}
          {hasIntro && !introStarted && (
            <Bouncy height={10}>
              <BigButton variant="go" size="huge" label="▶ Meet your characters!" onPress={playIntro} style={styles.center} />
            </Bouncy>
          )}
          {hasIntro && introStarted && !introPlaying && (
            <BigButton variant="soft" label="▶ Hear everyone again" onPress={playIntro} style={styles.center} />
          )}
        </View>
      )}

      <Text style={text.heading}>The plan</Text>

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

      {changing ? (
        <View style={styles.change}>
          <Text style={text.heading}>What should I change?</Text>
          <SpeechInput submitLabel="Change it!" placeholder="e.g. Make the frog a pirate too" onSubmit={onChange} />
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
              stop();
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
  cast: { gap: 16 },
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
