import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import type { CastMember } from "../story/cast.ts";
import { Bouncy } from "./bouncy.tsx";
import { cardShadow, colours, fonts, radius, TOUCH } from "./theme.ts";

export interface CharacterCardProps {
  readonly member: CastMember;
  /** Currently speaking in the story: grows, bounces and gets a coloured border. */
  readonly speaking?: boolean;
  /** Dim everyone who isn't speaking. */
  readonly dimmed?: boolean;
  readonly compact?: boolean;
  /** Show the comic trait even when compact (e.g. while this character says hello). */
  readonly showTrait?: boolean;
  /** Offer "Hear my voice" (only when the member has a sample). */
  readonly onHearVoice?: () => void;
  readonly voicePlaying?: boolean;
}

export function CharacterCard({ member, speaking = false, dimmed = false, compact = false, showTrait = false, onHearVoice, voicePlaying = false }: CharacterCardProps) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.set(withSpring(speaking ? 1.1 : 1, { damping: 9, stiffness: 180 }));
  }, [speaking, scale]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Animated.View
      style={[
        styles.card,
        compact && styles.compact,
        { borderColor: speaking ? member.colour : "transparent", opacity: dimmed && !speaking ? 0.55 : 1 },
        grow,
      ]}
    >
      <Bouncy active={speaking} height={8} periodMs={500}>
        <View style={[styles.avatar, compact && styles.compactAvatar, { backgroundColor: member.colour }]}>
          <Text style={[styles.emoji, compact && styles.compactEmoji]}>{member.emoji}</Text>
        </View>
      </Bouncy>
      <Text style={[styles.name, compact && styles.compactName]} numberOfLines={2}>
        {member.name}
      </Text>
      {(!compact || showTrait) && member.trait !== null && <Text style={[styles.trait, compact && styles.compactTrait]}>{member.trait}</Text>}
      {onHearVoice !== undefined && member.sampleUrl !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Hear ${member.name}'s voice`}
          onPress={onHearVoice}
          style={({ pressed }) => [styles.voice, compact && styles.compactVoice, { backgroundColor: member.colour, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.voiceLabel, compact && styles.compactVoiceLabel]}>{voicePlaying ? "🔊 Listening…" : "▶ Hear my voice"}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 210,
    backgroundColor: colours.card,
    borderRadius: radius.card,
    borderWidth: 5,
    padding: 16,
    alignItems: "center",
    gap: 8,
    ...cardShadow,
  },
  compact: { width: 176, padding: 10, gap: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  compactAvatar: { width: 68, height: 68, borderRadius: 34 },
  emoji: { fontSize: 48, lineHeight: 58 },
  compactEmoji: { fontSize: 36, lineHeight: 44 },
  name: { fontFamily: fonts.heading, fontSize: 22, fontWeight: "800", color: colours.ink, textAlign: "center" },
  compactName: { fontSize: 17 },
  trait: { fontFamily: fonts.body, fontSize: 16, color: colours.inkSoft, textAlign: "center" },
  compactTrait: { fontSize: 14 },
  voice: {
    marginTop: 4,
    minHeight: TOUCH,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    cursor: "pointer",
  },
  compactVoice: { paddingHorizontal: 8 },
  compactVoiceLabel: { fontSize: 15 },
  voiceLabel: { fontFamily: fonts.heading, fontSize: 17, fontWeight: "800", color: "#FFFFFF", textAlign: "center" },
});
