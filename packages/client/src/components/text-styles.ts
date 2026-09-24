import { StyleSheet } from "react-native";
import { colours, fonts } from "./theme.ts";

export const text = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 44, fontWeight: "900", color: colours.ink, textAlign: "center" },
  heading: { fontFamily: fonts.heading, fontSize: 34, fontWeight: "800", color: colours.ink, textAlign: "center" },
  subheading: { fontFamily: fonts.heading, fontSize: 24, fontWeight: "800", color: colours.ink },
  body: { fontFamily: fonts.body, fontSize: 20, color: colours.inkSoft, textAlign: "center", lineHeight: 28 },
  problem: { fontFamily: fonts.body, fontSize: 20, fontWeight: "700", color: colours.recordDark, textAlign: "center" },
});
