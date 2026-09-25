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
 * "Here's my plan!": the title and the big Yes / Change buttons up top, then the
 * cast (who say hello one by one: the voice introductions) and six short beats.
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

  const actions = changing ? (
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
    <View style={styles.actions}>
      {failed && <Text style={[text.problem, styles.fullRow]}>Oops, that didn't send. Try again!</Text>}
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
  );

  // The buttons come first, right under the title: children look for them at the top, not after scrolling.
  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Text style={text.body}>Here's my plan for…</Text>
        <Text style={styles.title}>{outline.storyTitle}</Text>
      </View>

      {actions}

      {characters.length > 0 && (
        <View style={styles.cast}>
          <CastRow
            cast={cast}
            compact
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
              <BigButton variant="primary" size="huge" label="▶ Meet your characters!" onPress={playIntro} style={styles.center} />
            </Bouncy>
          )}
          {hasIntro && introStarted && !introPlaying && (
            <BigButton variant="soft" size="small" label="▶ Hear everyone again" onPress={playIntro} style={styles.center} />
          )}
        </View>
      )}

      <View style={styles.beats}>
        {outline.pages.map((page, i) => (
          <View key={page.page} style={styles.beat}>
            <View style={[styles.number, { backgroundColor: BEAT_COLOURS[i % BEAT_COLOURS.length] }]}>
              <Text style={styles.numberText}>{page.page}</Text>
            </View>
            <Text style={styles.beatLine} numberOfLines={2}>
              {page.beat}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  header: { gap: 4 },
  title: { fontFamily: fonts.heading, fontSize: 38, lineHeight: 46, fontWeight: "900", color: colours.ink, textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 16 },
  fullRow: { width: "100%" },
  cast: { gap: 12 },
  beats: { gap: 8, backgroundColor: colours.card, borderRadius: radius.card, padding: 16, ...cardShadow },
  beat: { flexDirection: "row", alignItems: "center", gap: 14 },
  number: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  numberText: { fontFamily: fonts.heading, fontSize: 19, fontWeight: "900", color: "#FFFFFF" },
  beatLine: { flex: 1, fontFamily: fonts.body, fontSize: 19, lineHeight: 26, fontWeight: "600", color: colours.ink },
  change: { gap: 16 },
  center: { alignSelf: "center" },
});
