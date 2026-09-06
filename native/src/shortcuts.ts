export type NativeShortcutAction =
  | "help"
  | "toggle-playback"
  | "next"
  | "previous"
  | "shuffle"
  | "repeat"
  | "mute"
  | "seek-backward"
  | "seek-forward"
  | "volume-down"
  | "volume-up";

export type NativeShortcutInput = {
  key: string;
  code: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  playbackAvailable: boolean;
};

/** Resolve only the product-level shortcuts; text-field filtering stays in the UI. */
export function resolveNativeShortcut(input: NativeShortcutInput): NativeShortcutAction | null {
  if (input.ctrlKey || input.altKey || input.metaKey) return null;

  const key = input.key.toLowerCase();
  if (input.key === "?") return "help";
  if (!input.playbackAvailable) return null;

  if (input.code === "Space" || input.key === " ") return "toggle-playback";
  if (key === "k") return "toggle-playback";
  if (key === "n") return "next";
  if (key === "p") return "previous";
  if (key === "s") return "shuffle";
  if (key === "r") return "repeat";
  if (key === "m") return "mute";
  if (input.key === "ArrowLeft") return "seek-backward";
  if (input.key === "ArrowRight") return "seek-forward";
  if (input.key === "[") return "volume-down";
  if (input.key === "]") return "volume-up";
  return null;
}
