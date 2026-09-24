import { StyleSheet, View } from "react-native";
import type { ClipPlayer } from "../audio/use-clip-player.ts";
import type { CastMember } from "../story/cast.ts";
import { CharacterCard } from "./character-card.tsx";

export interface CastRowProps {
  readonly cast: readonly CastMember[];
  readonly speakingId?: string | null;
  readonly compact?: boolean;
  /** When given, cards with a voice sample get a "Hear my voice" button. */
  readonly clips?: ClipPlayer;
}

export function CastRow({ cast, speakingId = null, compact = false, clips }: CastRowProps) {
  return (
    <View style={styles.row}>
      {cast.map((member) => (
        <CharacterCard
          key={member.id}
          member={member}
          compact={compact}
          speaking={member.id === speakingId}
          dimmed={speakingId !== null}
          voicePlaying={clips !== undefined && member.sampleUrl !== null && clips.playingUrl === member.sampleUrl}
          {...(clips === undefined ? {} : { onHearVoice: clips.play })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16, paddingVertical: 8 },
});
