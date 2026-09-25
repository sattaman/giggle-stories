// Whether sound may start without a tap. Browsers block autoplay until the
// person has interacted with the page, and expo-audio swallows the rejected
// play() promise, so we can't see the block itself. Sticky user activation is
// the signal Chrome, Safari and Firefox use for it, so we go by that. Native
// apps may always play.

import { Platform } from "react-native";

export function mayAutoplay(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof navigator === "undefined" || !("userActivation" in navigator)) return true;
  return navigator.userActivation.hasBeenActive;
}
