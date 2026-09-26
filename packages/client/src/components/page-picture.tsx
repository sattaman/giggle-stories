import { useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { cardShadow, colours, fonts, radius } from "./theme.ts";

/**
 * The page's picture, framed like a picture-book plate. While it's still being drawn, a frame
 * of the same size holds its place (so nothing jumps), then the picture fades in.
 */
export function PagePicture({ url, drawing }: { readonly url: string | null; readonly drawing: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);
  if ((url === null && !drawing) || failed) return null;

  return (
    <View style={styles.frame} accessibilityRole="image" accessibilityLabel="A picture of this page of the story">
      <View style={styles.plate}>
        {url === null ? (
          <View style={styles.placeholder}>
            <Text style={styles.brush}>🎨</Text>
            <Text style={styles.drawing}>Drawing your picture…</Text>
          </View>
        ) : (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
            <Image
              source={{ uri: url }}
              style={styles.image}
              resizeMode="contain" // never crop: a joke at the edge (the raisin, the spoon) must stay in
              onLoad={() => {
                Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
              }}
              onError={() => {
                setFailed(true);
              }}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colours.card,
    borderRadius: radius.card,
    padding: 10,
    alignSelf: "stretch",
    ...cardShadow,
  },
  plate: {
    aspectRatio: 4 / 3,
    borderRadius: radius.card - 10,
    overflow: "hidden",
    backgroundColor: colours.soft,
  },
  image: { width: "100%", height: "100%" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  brush: { fontSize: 56 },
  drawing: { fontFamily: fonts.body, fontSize: 22, fontWeight: "700", color: colours.inkSoft },
});
