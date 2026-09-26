import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useStoryApi } from "../api/api-context.tsx";
import { ANSWER_BOX_MIN_HEIGHT, answerBoxHeight, formatElapsed } from "../speech/speech-machine.ts";
import { useSpeechInput } from "../speech/use-speech-input.ts";
import { useNarration } from "../story/narration.tsx";
import { BigButton } from "./big-button.tsx";
import { MicButton } from "./mic-button.tsx";
import { text } from "./text-styles.ts";
import { colours, fonts, radius } from "./theme.ts";
import { WaitingCard } from "./waiting-card.tsx";

/** The server's limit for answers and outline changes (ReplyBody). */
// Matches the server limits for answers and change requests (ReplyBody).
const DEFAULT_MAX_LENGTH = 2000;
/** Border width of the answer box: its content size doesn't include it. */
const BOX_BORDER = 4;

export interface SpeechInputProps {
  readonly submitLabel: string;
  readonly placeholder: string;
  /** Resolves false if sending failed, so the child can try again. */
  readonly onSubmit: (text: string) => Promise<boolean>;
  /** Called just before the mic opens, e.g. to hush any clip that's playing. */
  readonly onListen?: () => void;
  /** Longest text the server accepts here. */
  readonly maxLength?: number;
  /** The story this answers, if any; its recording is filed under the story. */
  readonly storyId?: string;
}

/** Say it (tap the mic) or type it, check it, send it. */
export function SpeechInput({ submitLabel, placeholder, onSubmit, onListen, maxLength = DEFAULT_MAX_LENGTH, storyId }: SpeechInputProps) {
  const speech = useSpeechInput(useStoryApi(), storyId);
  const narration = useNarration();
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [boxHeight, setBoxHeight] = useState(ANSWER_BOX_MIN_HEIGHT);
  const { state } = speech;

  function listen(): void {
    narration.stop();
    onListen?.();
    void speech.startRecording();
  }

  async function submit(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed === "" || sending) return;
    setSending(true);
    setSendFailed(false);
    const ok = await onSubmit(trimmed.slice(0, maxLength));
    setSending(false);
    setSendFailed(!ok);
  }

  switch (state.kind) {
    case "transcribing":
      return <WaitingCard compact message="Listening back…" />;

    case "editing":
      return (
        <View style={styles.stack}>
          <Text style={text.subheading}>{state.source === "voice" ? "Did I hear you right?" : "Type it here:"}</Text>
          <TextInput
            value={state.text}
            onChangeText={speech.edit}
            placeholder={placeholder}
            placeholderTextColor={colours.inkSoft}
            multiline
            autoFocus={state.source === "typed"}
            maxLength={maxLength}
            onContentSizeChange={(event) => {
              setBoxHeight(answerBoxHeight(event.nativeEvent.contentSize.height + 2 * BOX_BORDER));
            }}
            style={[styles.input, { height: boxHeight }]}
            accessibilityLabel="Your words"
          />
          {sendFailed && <Text style={text.problem}>Oops, that didn't send. Try again!</Text>}
          <View style={styles.buttons}>
            <BigButton
              variant="go"
              size="huge"
              label={sending ? "Sending…" : submitLabel}
              disabled={sending || state.text.trim() === ""}
              onPress={() => void submit(state.text)}
            />
            <BigButton
              variant="soft"
              label={state.source === "voice" ? "🎤 Try again" : "🎤 Use the mic"}
              disabled={sending}
              onPress={listen}
            />
          </View>
        </View>
      );

    case "idle":
    case "starting":
    case "recording":
    case "problem":
      return (
        <View style={styles.stack}>
          <MicButton
            recording={state.kind === "recording"}
            disabled={state.kind === "starting"}
            elapsedLabel={formatElapsed(speech.elapsedMs)}
            onPress={() => {
              if (state.kind === "recording") void speech.stopRecording();
              else listen();
            }}
          />
          {state.kind === "problem" && <Text style={text.problem}>{state.message}</Text>}
          {state.kind !== "recording" && (
            <BigButton variant="ghost" size="small" label="⌨️ Type instead" onPress={speech.typeInstead} style={styles.center} />
          )}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  stack: { gap: 16, alignItems: "stretch" },
  input: {
    minHeight: 140,
    backgroundColor: colours.card,
    borderRadius: radius.card,
    borderWidth: BOX_BORDER,
    borderColor: colours.softDark,
    padding: 20,
    fontFamily: fonts.body,
    fontSize: 26,
    color: colours.ink,
    textAlignVertical: "top",
  },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "center" },
  center: { alignSelf: "center" },
});
