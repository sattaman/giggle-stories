import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useStoryApi } from "../api/api-context.tsx";
import { formatElapsed } from "../speech/speech-machine.ts";
import { useSpeechInput } from "../speech/use-speech-input.ts";
import { BigButton } from "./big-button.tsx";
import { MicButton } from "./mic-button.tsx";
import { text } from "./text-styles.ts";
import { colours, fonts, radius } from "./theme.ts";
import { WaitingCard } from "./waiting-card.tsx";

const MAX_LENGTH = 1000;

export interface SpeechInputProps {
  readonly submitLabel: string;
  readonly placeholder: string;
  /** Resolves false if sending failed, so the child can try again. */
  readonly onSubmit: (text: string) => Promise<boolean>;
}

/** Say it (tap the mic) or type it, check it, send it. */
export function SpeechInput({ submitLabel, placeholder, onSubmit }: SpeechInputProps) {
  const speech = useSpeechInput(useStoryApi());
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const { state } = speech;

  async function submit(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed === "" || sending) return;
    setSending(true);
    setSendFailed(false);
    const ok = await onSubmit(trimmed.slice(0, MAX_LENGTH));
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
            maxLength={MAX_LENGTH}
            style={styles.input}
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
              onPress={() => void speech.startRecording()}
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
            onPress={() => void (state.kind === "recording" ? speech.stopRecording() : speech.startRecording())}
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
    borderWidth: 4,
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
