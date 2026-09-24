import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useStoryApi } from "../../api/api-context.tsx";
import { BigButton } from "../../components/big-button.tsx";
import { CastRow } from "../../components/cast-row.tsx";
import { ClarificationView } from "../../components/clarification-view.tsx";
import { OopsCard } from "../../components/oops-card.tsx";
import { OutlineReview } from "../../components/outline-review.tsx";
import { PerformanceView } from "../../components/performance-view.tsx";
import { ReconnectingNote } from "../../components/reconnecting-note.tsx";
import { Screen } from "../../components/screen.tsx";
import { WaitingCard } from "../../components/waiting-card.tsx";
import { castOf } from "../../story/cast.ts";
import { screenFor } from "../../story/flow.ts";
import { useStory, type StorySession } from "../../story/use-story.ts";

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const startOver = () => {
    router.replace("/new");
  };

  return (
    <Screen>
      <BigButton variant="ghost" size="small" label="← Home" onPress={() => {
        router.replace("/");
      }} style={styles.back} />
      {typeof id === "string" && id !== "" ? (
        <StoryBody key={id} id={id} onStartOver={startOver} />
      ) : (
        <OopsCard title="Hmm, which story?" message="I couldn't find that story." onRetry={startOver} />
      )}
    </Screen>
  );
}

function StoryBody({ id, onStartOver }: { readonly id: string; readonly onStartOver: () => void }) {
  const session = useStory(useStoryApi(), id);
  return (
    <View style={styles.body}>
      {session.reconnecting && <ReconnectingNote />}
      <StoryStep session={session} onStartOver={onStartOver} />
    </View>
  );
}

function StoryStep({ session, onStartOver }: { readonly session: StorySession; readonly onStartOver: () => void }) {
  const { load, reply } = session;
  switch (load.kind) {
    case "loading":
      return <WaitingCard message="Opening your story…" />;
    case "missing":
      return <OopsCard title="Where did it go?" message="I couldn't find that story. Let's make a new one!" onRetry={onStartOver} />;
    case "ready":
      break;
  }

  const { view } = load;
  const screen = screenFor(view);
  switch (screen.kind) {
    case "working":
      return (
        <View style={styles.body}>
          <WaitingCard message={screen.message} />
          {view.characters.length > 0 && <CastRow cast={castOf(view.characters, false)} />}
        </View>
      );
    case "clarification":
      return (
        <ClarificationView
          key={`${String(screen.round)}:${screen.question}`}
          question={screen.question}
          audioUrl={screen.audioUrl}
          onAnswer={(text) => reply({ kind: "answer", text })}
        />
      );
    case "outline":
      return (
        <OutlineReview
          key={screen.outline.storyTitle}
          outline={screen.outline}
          characters={view.characters}
          onApprove={() => reply({ kind: "outline", approved: true })}
          onChange={(feedback) => reply({ kind: "outline", approved: false, feedback })}
        />
      );
    case "performance":
      return (
        <PerformanceView
          performance={screen.performance}
          characters={view.characters}
          title={view.title}
          onAnotherStory={onStartOver}
        />
      );
    case "error":
      return (
        <OopsCard
          title="Oh no, the story machine got in a muddle!"
          message="It's not your fault. Shall we try again?"
          onRetry={onStartOver}
        />
      );
  }
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start" },
  body: { gap: 24 },
});
