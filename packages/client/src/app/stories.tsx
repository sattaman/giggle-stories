import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useStoryApi } from "../api/api-context.tsx";
import { BigButton } from "../components/big-button.tsx";
import { OopsCard } from "../components/oops-card.tsx";
import { Screen } from "../components/screen.tsx";
import { text } from "../components/text-styles.ts";
import { cardShadow, colours, fonts, radius } from "../components/theme.ts";
import { WaitingCard } from "../components/waiting-card.tsx";
import { libraryEntries, type LibraryEntry } from "../story/library.ts";

type Load = { readonly kind: "loading" } | { readonly kind: "ready"; readonly entries: readonly LibraryEntry[] } | { readonly kind: "failed" };

/** "My stories": every story made so far, to play again. */
export default function StoriesScreen() {
  const api = useStoryApi();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .listStories()
      .then((stories) => {
        if (!cancelled) setLoad({ kind: "ready", entries: libraryEntries(stories, new Date()) });
      })
      .catch(() => {
        if (!cancelled) setLoad({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const retry = useCallback(() => {
    setLoad({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const open = (id: string) => {
    router.push({ pathname: "/story/[id]", params: { id } });
  };

  return (
    <Screen>
      <BigButton
        variant="ghost"
        size="small"
        label="← Home"
        onPress={() => {
          router.replace("/");
        }}
        style={styles.back}
      />
      <Text style={text.title}>📚 My stories</Text>
      {load.kind === "loading" && <WaitingCard message="Finding your stories…" />}
      {load.kind === "failed" && <OopsCard title="I can't find the bookshelf!" message="Let's try that again." onRetry={retry} />}
      {load.kind === "ready" && load.entries.length === 0 && (
        <View style={styles.empty}>
          <Text style={text.body}>No stories yet. Let's make the first one!</Text>
          <BigButton
            variant="primary"
            size="huge"
            label="Make a story ✨"
            onPress={() => {
              router.replace("/new");
            }}
          />
        </View>
      )}
      {load.kind === "ready" && (
        <View style={styles.list}>
          {load.entries.map((entry) => (
            <StoryCard
              key={entry.id}
              entry={entry}
              onOpen={() => {
                open(entry.id);
              }}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function StoryCard({ entry, onOpen }: { readonly entry: LibraryEntry; readonly onOpen: () => void }) {
  const playable = entry.state === "playable";
  return (
    <View style={styles.card}>
      <View style={styles.cardText}>
        <Text style={styles.title} numberOfLines={2}>
          {entry.title}
        </Text>
        <View style={styles.meta}>
          <View style={styles.faces}>
            {entry.characters.map((c) => (
              <View key={c.name} style={[styles.face, { backgroundColor: c.colour }]} accessibilityLabel={c.name}>
                <Text style={styles.faceEmoji}>{c.emoji}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.date}>{entry.dateLabel}</Text>
          {!playable && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Unfinished</Text>
            </View>
          )}
        </View>
      </View>
      <BigButton variant={playable ? "go" : "soft"} label="▶ Play" onPress={onOpen} accessibilityLabel={`Play ${entry.title}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start" },
  empty: { alignItems: "center", gap: 20 },
  list: { gap: 16 },
  card: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 16,
    backgroundColor: colours.card,
    borderRadius: radius.card,
    padding: 20,
    ...cardShadow,
  },
  cardText: { flexGrow: 1, flexShrink: 1, flexBasis: 280, gap: 10 },
  title: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, fontWeight: "800", color: colours.ink },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  faces: { flexDirection: "row", gap: 6 },
  face: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  faceEmoji: { fontSize: 24, lineHeight: 30 },
  date: { fontFamily: fonts.body, fontSize: 18, color: colours.inkSoft },
  badge: { backgroundColor: colours.sun, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: "800", color: colours.ink },
});
