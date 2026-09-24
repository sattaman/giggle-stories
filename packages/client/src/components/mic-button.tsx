import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colours, fonts } from "./theme.ts";

const SIZE = 168;

export interface MicButtonProps {
  readonly recording: boolean;
  readonly disabled?: boolean;
  readonly elapsedLabel: string;
  readonly onPress: () => void;
}

/** Tap to start, tap to stop. Pulses while it's listening. */
export function MicButton({ recording, disabled = false, elapsedLabel, onPress }: MicButtonProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (recording) {
      pulse.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false));
    } else {
      cancelAnimation(pulse);
      pulse.set(0);
    }
  }, [recording, pulse]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.get() * 0.55 }],
    opacity: 0.55 * (1 - pulse.get()),
  }));

  const face = recording ? colours.record : colours.primary;
  const edge = recording ? colours.recordDark : colours.primaryDark;

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        <Animated.View style={[styles.ring, { backgroundColor: face }, ring]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? "Stop recording" : "Start recording"}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: face,
              borderBottomColor: edge,
              borderBottomWidth: pressed ? 3 : 8,
              transform: [{ translateY: pressed ? 5 : 0 }],
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          {recording ? <View style={styles.stopSquare} /> : <Text style={styles.icon}>🎤</Text>}
        </Pressable>
      </View>
      <Text style={styles.caption}>{recording ? `Listening… ${elapsedLabel}` : "Tap to talk"}</Text>
      {recording && <Text style={styles.hint}>Tap again when you've finished</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12 },
  stage: { width: SIZE * 1.6, height: SIZE * 1.6, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  icon: { fontSize: 72 },
  stopSquare: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#FFFFFF" },
  caption: { fontFamily: fonts.heading, fontSize: 26, fontWeight: "800", color: colours.ink },
  hint: { fontFamily: fonts.body, fontSize: 18, color: colours.inkSoft },
});
