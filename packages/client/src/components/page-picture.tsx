import type { StoryView } from "@storytime/domain";
import { useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { cardShadow, colours, fonts, radius } from "./theme.ts";

type Picture = StoryView["pictures"][number];
type Kind = Picture["kind"];

const LABEL: Record<Kind, string> = { painted: "🖌️ Painted", animated: "✨ Animated" };
const DRAWING: Record<Kind, string> = { painted: "Painting your picture…", animated: "Drawing your moving picture…" };

/** Remembers which kind the child picked for the rest of the session. */
let preferred: Kind = "painted";

/**
 * The page's picture, framed like a picture-book plate. With more than one kind (painted and
 * animated), a small toggle switches between them. A picture still being drawn keeps a frame of
 * the same size (so nothing jumps), then fades in.
 */
export function PagePicture({ pictures, drawing }: { readonly pictures: StoryView["pictures"]; readonly drawing: boolean }) {
  const [kind, setKind] = useState<Kind>(() => (pictures.some((p) => p.kind === preferred) ? preferred : (pictures[0]?.kind ?? "painted")));
  const shown = pictures.find((p) => p.kind === kind) ?? pictures[0];
  if (shown === undefined || (shown.url === null && !drawing && pictures.every((p) => p.url === null))) return null;

  return (
    <View style={styles.frame}>
      {pictures.length > 1 && (
        <View style={styles.toggle} accessibilityRole="tablist">
          {pictures.map((p) => (
            <Pressable
              key={p.kind}
              accessibilityRole="tab"
              accessibilityState={{ selected: p.kind === shown.kind }}
              onPress={() => {
                preferred = p.kind;
                setKind(p.kind);
              }}
              style={[styles.option, p.kind === shown.kind && styles.selected]}
            >
              <Text style={[styles.optionText, p.kind === shown.kind && styles.selectedText]}>{LABEL[p.kind]}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.plate}>
        {shown.url === null ? (
          <View style={styles.placeholder}>
            <Text style={styles.brush}>{drawing ? "🎨" : "🙈"}</Text>
            <Text style={styles.drawing}>{drawing ? DRAWING[shown.kind] : "This one didn't work out."}</Text>
          </View>
        ) : (
          <FadeInImage key={shown.url} url={shown.url} />
        )}
      </View>
    </View>
  );
}

function FadeInImage({ url }: { readonly url: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} accessibilityRole="image" accessibilityLabel="A picture of this page of the story">
      <Image
        source={{ uri: url }}
        style={styles.image}
        resizeMode="contain" // never crop: a joke at the edge (the raisin, the spoon) must stay in
        onLoad={() => {
          Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colours.card,
    borderRadius: radius.card,
    padding: 10,
    gap: 10,
    alignSelf: "stretch",
    ...cardShadow,
  },
  toggle: { flexDirection: "row", alignSelf: "center", backgroundColor: colours.soft, borderRadius: radius.pill, padding: 4, gap: 4 },
  option: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.pill, minHeight: 44, justifyContent: "center" },
  selected: { backgroundColor: colours.primary },
  optionText: { fontFamily: fonts.body, fontSize: 18, fontWeight: "800", color: colours.primaryDark },
  selectedText: { color: colours.card },
  plate: { aspectRatio: 4 / 3, borderRadius: radius.card - 10, overflow: "hidden", backgroundColor: colours.soft },
  image: { width: "100%", height: "100%" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  brush: { fontSize: 56 },
  drawing: { fontFamily: fonts.body, fontSize: 22, fontWeight: "700", color: colours.inkSoft },
});
