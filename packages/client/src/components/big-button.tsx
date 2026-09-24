import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { colours, fonts, radius, TOUCH } from "./theme.ts";

type Variant = "primary" | "go" | "soft" | "ghost";

const VARIANTS: Record<Variant, { face: string; edge: string; text: string }> = {
  primary: { face: colours.primary, edge: colours.primaryDark, text: "#FFFFFF" },
  go: { face: colours.go, edge: colours.goDark, text: "#FFFFFF" },
  soft: { face: colours.soft, edge: colours.softDark, text: colours.ink },
  ghost: { face: "transparent", edge: "transparent", text: colours.inkSoft },
};

export interface BigButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: Variant;
  readonly size?: "normal" | "huge" | "small";
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/** A chunky, squishy button with a big touch target. */
export function BigButton({ label, onPress, variant = "primary", size = "normal", disabled = false, style }: BigButtonProps) {
  const look = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === "huge" && styles.huge,
        size === "small" && styles.small,
        {
          backgroundColor: look.face,
          borderBottomColor: look.edge,
          borderBottomWidth: variant === "ghost" ? 0 : pressed ? 2 : 6,
          transform: [{ translateY: pressed && variant !== "ghost" ? 4 : 0 }],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, size === "huge" && styles.hugeLabel, size === "small" && styles.smallLabel, { color: look.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 72,
    minWidth: 160,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  huge: { minHeight: 96, paddingHorizontal: 48, borderRadius: 48 },
  small: { minHeight: TOUCH, minWidth: 0, paddingHorizontal: 20 },
  label: { fontFamily: fonts.heading, fontSize: 24, fontWeight: "800", textAlign: "center" },
  hugeLabel: { fontSize: 34 },
  smallLabel: { fontSize: 19 },
});
