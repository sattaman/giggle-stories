import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export interface BouncyProps {
  readonly children: ReactNode;
  readonly active?: boolean;
  /** How far it hops, in points. */
  readonly height?: number;
  readonly delayMs?: number;
  readonly periodMs?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/** Gently hops its children up and down while active. */
export function Bouncy({ children, active = true, height = 12, delayMs = 0, periodMs = 900, style }: BouncyProps) {
  const hop = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(hop);
      hop.set(withTiming(0, { duration: 150 }));
      return;
    }
    const half = periodMs / 2;
    hop.set(
      withDelay(
        delayMs,
        withRepeat(
          withSequence(
            withTiming(1, { duration: half, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: half, easing: Easing.in(Easing.quad) }),
          ),
          -1,
          false,
        ),
      ),
    );
  }, [active, delayMs, periodMs, hop]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: -height * hop.get() }] }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
