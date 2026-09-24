import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colours, MAX_WIDTH } from "./theme.ts";

/** Scrollable page with a centred, comfortably narrow column. */
export function Screen({ children, centred = false }: { readonly children: ReactNode; readonly centred?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        centred && styles.centred,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 48 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colours.background },
  content: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20 },
  centred: { justifyContent: "center" },
  column: { width: "100%", maxWidth: MAX_WIDTH, gap: 24 },
});
